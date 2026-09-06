/**
 * Cadastro público de organização (empresa) nova — com confirmação por
 * e-mail antes de liberar o acesso, pra evitar cadastro automatizado em
 * massa (spam/abuso) num endpoint que qualquer pessoa na internet, sem
 * estar logada, pode chamar.
 *
 * Fluxo: signup.start (cria um registro pendente, manda e-mail com link)
 * -> pessoa clica no link -> signup.verify (só agora cria a organização
 * e o administrador de verdade, e já loga a pessoa).
 */

import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { getSessionCookieOptions } from "../_core/cookies";
import {
  getClientKey,
  checkSignupRateLimit,
  registerSignupAttempt,
  hashAdminPassword,
  generateSessionMarker,
  createSiteSessionToken,
  SITE_SESSION_COOKIE,
} from "../site-auth";
import {
  createPendingSignup,
  getPendingSignupByToken,
  deletePendingSignup,
  pruneExpiredPendingSignups,
} from "../db-pending-signups";
import { createOrganizationWithOwner, getOrganizationBySlug } from "../db-organizations";
import { getAdminByUsername } from "../db-admins";
import { sendEmail } from "../mailer";
import { logActivity } from "../db-activity";

const organizationSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen");

const adminUsernameSchema = z
  .string()
  .trim()
  .min(3, "Usuário deve ter ao menos 3 caracteres")
  .max(50)
  .regex(/^[a-zA-Z0-9._-]+$/, "Use apenas letras, números, ponto, hífen ou underline");

export const signupRouter = router({
  start: publicProcedure
    .input(
      z.object({
        organizationName: z.string().trim().min(2, "Nome da empresa muito curto").max(120),
        organizationSlug: organizationSlugSchema,
        adminUsername: adminUsernameSchema,
        adminPassword: z.string().min(8, "Senha deve ter ao menos 8 caracteres"),
        email: z.string().trim().email("E-mail inválido"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const clientKey = getClientKey(ctx.req);
      const remainingMs = checkSignupRateLimit(clientKey);
      if (remainingMs !== null) {
        const minutes = Math.ceil(remainingMs / 60000);
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Muitas tentativas de cadastro. Tente novamente em ${minutes} minuto${minutes !== 1 ? "s" : ""}.`,
        });
      }
      registerSignupAttempt(clientKey);

      // Limpeza oportunista de cadastros pendentes vencidos — não trava a
      // resposta (roda em paralelo, e nunca falha a operação principal).
      void pruneExpiredPendingSignups();

      const existingOrg = await getOrganizationBySlug(input.organizationSlug);
      if (existingOrg) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe uma organização com esse identificador." });
      }
      const existingAdmin = await getAdminByUsername(input.adminUsername);
      if (existingAdmin) {
        throw new TRPCError({ code: "CONFLICT", message: "Esse nome de usuário já está em uso." });
      }

      const passwordHash = await hashAdminPassword(input.adminPassword);
      const token = crypto.randomBytes(32).toString("hex");

      await createPendingSignup({
        id: uuidv4(),
        organizationName: input.organizationName,
        organizationSlug: input.organizationSlug,
        adminUsername: input.adminUsername,
        passwordHash,
        email: input.email,
        token,
      });

      const protocol = ctx.req.protocol;
      const host = ctx.req.get("host");
      const verifyUrl = `${protocol}://${host}/verificar-cadastro?token=${token}`;

      const emailSent = await sendEmail({
        to: input.email,
        subject: "Confirme o cadastro da sua empresa",
        html: `
          <p>Falta só um passo pra terminar o cadastro de <strong>${input.organizationName}</strong>.</p>
          <p><a href="${verifyUrl}">Clique aqui pra confirmar</a> (ou copie e cole este link no navegador: ${verifyUrl})</p>
          <p>Esse link vale por 24 horas. Se você não pediu esse cadastro, pode ignorar este e-mail.</p>
        `,
      });

      if (!emailSent) {
        // Não desfaz o cadastro pendente — a pessoa pode pedir de novo
        // (ou o suporte pode reenviar manualmente). Mas avisa que algo
        // não saiu como devia, em vez de fingir sucesso.
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível enviar o e-mail de confirmação agora. Tente novamente em instantes.",
        });
      }

      return { success: true } as const;
    }),

  verify: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const pending = await getPendingSignupByToken(input.token);
      if (!pending) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Link inválido ou expirado. Faça o cadastro novamente.",
        });
      }

      const { admin } = await createOrganizationWithOwner({
        organizationName: pending.organizationName,
        organizationSlug: pending.organizationSlug,
        adminUsername: pending.adminUsername,
        adminPasswordHash: pending.passwordHash,
      });

      await deletePendingSignup(pending.id);

      void logActivity({
        username: admin.username,
        role: "admin",
        action: "login",
      });

      // Já loga a pessoa direto — mesmo mecanismo de cookie/marcador do
      // login normal (server/routers/auth.ts, siteLogin).
      const sessionMarker = generateSessionMarker();
      const token = await createSiteSessionToken(admin.username, "admin", admin.id, sessionMarker);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(SITE_SESSION_COOKIE, token, cookieOptions);

      return { success: true, sessionMarker } as const;
    }),
});
