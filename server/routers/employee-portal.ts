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
  employeePortalSessionVersion,
  hashEmployeePin,
  verifyEmployeePin,
  getRawCookie,
  EMPLOYEE_SESSION_COOKIE,
} from "../site-auth";
import { getEmployeeByCpf, activateEmployeePortal, normalizeCpf } from "../db-employee-portal";
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
  // Compatibility endpoint: never reveals whether a CPF exists or has a PIN.
  checkAccess: publicProcedure
    .input(z.object({ cpf: z.string().min(1).max(32) }))
    .mutation(({ input, ctx }) => {
      const key = getClientKey(ctx.req);
      rateLimitOrThrow(key, input.cpf);
      registerEmployeePortalAttempt(key, normalizeCpf(input.cpf));
      return { hasPortalAccess: true } as const;
    }),

  firstAccessSetup: publicProcedure
    .input(z.object({ cpf: z.string().min(1).max(32), activationCode: z.string().trim().min(1).max(128), pin: pinSchema }))
    .mutation(async ({ input, ctx }) => {
      const key = getClientKey(ctx.req);
      rateLimitOrThrow(key, input.cpf);
      registerEmployeePortalAttempt(key, normalizeCpf(input.cpf));
      const employee = await getEmployeeByCpf(input.cpf);
      const pinHash = await hashEmployeePin(input.pin);
      const activated = employee && await activateEmployeePortal(employee.id, input.cpf, input.activationCode, pinHash);
      if (!activated) throw new TRPCError({ code: "UNAUTHORIZED", message: "Não foi possível ativar. Confira os dados e solicite um código válido ao RH." });
      clearEmployeePortalAttempts(key, normalizeCpf(input.cpf));
      const token = await createEmployeeSessionToken(activated.id, activated.contract, pinHash);
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

      if (!employee || employee.dismissed || !employee.portalPinHash) {
        registerEmployeePortalAttempt(clientKey, normalizeCpf(input.cpf));
        throw genericError;
      }

      const valid = await verifyEmployeePin(input.pin, employee.portalPinHash);
      if (!valid) {
        registerEmployeePortalAttempt(clientKey, normalizeCpf(input.cpf));
        throw genericError;
      }

      clearEmployeePortalAttempts(clientKey, normalizeCpf(input.cpf));

      const token = await createEmployeeSessionToken(employee.id, employee.contract, employee.portalPinHash);
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
    if (!employee || employee.dismissed || !employee.portalPinHash || employee.contract !== session.contractSlug || employeePortalSessionVersion(employee.portalPinHash) !== session.version) return null;

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

