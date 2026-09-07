/**
 * Portal de autoatendimento do colaborador — acesso só de LEITURA aos
 * próprios treinamentos, por CPF + PIN (bem mais fraco que
 * usuário/senha de administrador, então tudo aqui é mais restritivo:
 * limite de tentativas mais apertado, sessão mais curta — ver os
 * comentários completos em server/site-auth.ts).
 *
 * Primeiro acesso: confirma identidade com CPF + data de nascimento
 * (dado que já existe no cadastro feito pelo administrador) antes de
 * deixar a pessoa criar um PIN. Depois disso, login normal é só
 * CPF + PIN.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getEmployeeSessionCookieOptions } from "../_core/cookies";
import {
  getClientKey,
  checkEmployeePortalRateLimit,
  registerEmployeePortalAttempt,
  clearEmployeePortalAttempts,
  createEmployeeSessionToken,
  verifyEmployeeSessionToken,
  hashEmployeePin,
  verifyEmployeePin,
  getRawCookie,
  EMPLOYEE_SESSION_COOKIE,
} from "../site-auth";
import { getEmployeeByCpf, setEmployeePortalPin, normalizeCpf } from "../db-employee-portal";
import { getEmployeeById, getTrainingsByEmployeeId } from "../db-employees";

const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "O PIN deve ter exatamente 6 números");

function rateLimitOrThrow(ip: string, cpf: string) {
  const remainingMs = checkEmployeePortalRateLimit(ip, normalizeCpf(cpf));
  if (remainingMs !== null) {
    const minutes = Math.ceil(remainingMs / 60000);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Muitas tentativas. Tente novamente em ${minutes} minuto${minutes !== 1 ? "s" : ""}.`,
    });
  }
}

export const employeePortalRouter = router({
  /** Primeiro passo: informa só o CPF, e a tela decide se mostra "criar
   * PIN" (primeiro acesso) ou "digitar PIN" (já configurado). Mensagem
   * de erro genérica de propósito — não revela se um CPF existe ou não
   * no sistema pra quem só está adivinhando CPFs. */
  checkAccess: publicProcedure
    .input(z.object({ cpf: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const clientKey = getClientKey(ctx.req);
      rateLimitOrThrow(clientKey, input.cpf);

      const employee = await getEmployeeByCpf(input.cpf);
      if (!employee) {
        registerEmployeePortalAttempt(clientKey, normalizeCpf(input.cpf));
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "CPF não encontrado. Confira com o RH se o cadastro está certo.",
        });
      }

      return { hasPortalAccess: !!employee.portalPinHash } as const;
    }),

  /** Confirma identidade (CPF + data de nascimento, já cadastrados pelo
   * administrador) e cria o PIN — só funciona pra quem ainda não tem
   * PIN configurado (ver checkAccess). Já loga a pessoa em seguida. */
  firstAccessSetup: publicProcedure
    .input(
      z.object({
        cpf: z.string().min(1),
        birthDate: z.string().min(1),
        pin: pinSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const clientKey = getClientKey(ctx.req);
      rateLimitOrThrow(clientKey, input.cpf);

      const employee = await getEmployeeByCpf(input.cpf);
      if (!employee) {
        registerEmployeePortalAttempt(clientKey, normalizeCpf(input.cpf));
        throw new TRPCError({ code: "NOT_FOUND", message: "CPF não encontrado." });
      }
      if (employee.portalPinHash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Esse CPF já tem um PIN configurado. Use a opção de entrar normalmente.",
        });
      }
      if (!employee.birthDate || employee.birthDate !== input.birthDate) {
        registerEmployeePortalAttempt(clientKey, normalizeCpf(input.cpf));
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Data de nascimento não confere." });
      }

      clearEmployeePortalAttempts(clientKey, normalizeCpf(input.cpf));

      const pinHash = await hashEmployeePin(input.pin);
      await setEmployeePortalPin(employee.id, pinHash);

      const token = await createEmployeeSessionToken(employee.id, employee.contract);
      ctx.res.cookie(EMPLOYEE_SESSION_COOKIE, token, getEmployeeSessionCookieOptions(ctx.req));

      return { success: true } as const;
    }),

  /** Login normal (depois do primeiro acesso): CPF + PIN. */
  login: publicProcedure
    .input(z.object({ cpf: z.string().min(1), pin: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const clientKey = getClientKey(ctx.req);
      rateLimitOrThrow(clientKey, input.cpf);

      const employee = await getEmployeeByCpf(input.cpf);
      // Mensagem igual pros dois casos (CPF errado ou PIN errado) — não
      // dá pista de qual dos dois está errado.
      const genericError = new TRPCError({ code: "UNAUTHORIZED", message: "CPF ou PIN incorretos." });

      if (!employee || !employee.portalPinHash) {
        registerEmployeePortalAttempt(clientKey, normalizeCpf(input.cpf));
        throw genericError;
      }

      const valid = await verifyEmployeePin(input.pin, employee.portalPinHash);
      if (!valid) {
        registerEmployeePortalAttempt(clientKey, normalizeCpf(input.cpf));
        throw genericError;
      }

      clearEmployeePortalAttempts(clientKey, normalizeCpf(input.cpf));

      const token = await createEmployeeSessionToken(employee.id, employee.contract);
      ctx.res.cookie(EMPLOYEE_SESSION_COOKIE, token, getEmployeeSessionCookieOptions(ctx.req));

      return { success: true } as const;
    }),

  /** Dados da própria sessão — nome, função, e os próprios treinamentos
   * com status. Lê o cookie employee_session diretamente (sessão
   * separada da do administrador, nunca se misturam). */
  me: publicProcedure.query(async ({ ctx }) => {
    const token = getRawCookie(ctx.req, EMPLOYEE_SESSION_COOKIE);
    if (!token) return null;

    const session = await verifyEmployeeSessionToken(token);
    if (!session) return null;

    const employee = await getEmployeeById(session.employeeId);
    if (!employee) return null;

    const employeeTrainings = await getTrainingsByEmployeeId(employee.id);

    return {
      name: employee.name,
      role: employee.role,
      admissionDate: employee.admissionDate,
      trainings: employeeTrainings.map((t) => ({
        id: t.id,
        name: t.name,
        completionDate: t.completionDate,
        expirationDate: t.expirationDate,
      })),
    };
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    ctx.res.clearCookie(EMPLOYEE_SESSION_COOKIE);
    return { success: true } as const;
  }),
});
