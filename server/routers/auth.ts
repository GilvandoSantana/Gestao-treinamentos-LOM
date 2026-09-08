import { COOKIE_NAME } from "@shared/const";
import { v4 as uuidv4 } from "uuid";
import { getSessionCookieOptions } from "../_core/cookies";
import { masterAdminProcedure, publicProcedure, siteAdminProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import QRCode from "qrcode";
import {
  IMPERSONATION_BACKUP_COOKIE,
  SITE_SESSION_COOKIE,
  checkLoginRateLimit,
  checkSitePassword,
  clearLoginAttempts,
  createDesktopSyncToken,
  createSiteSessionToken,
  createPending2FAToken,
  verifyPending2FAToken,
  generateSessionMarker,
  getClientKey,
  getRawCookie,
  hashAdminPassword,
  registerFailedLoginAttempt,
  verifyAdminPassword,
  verifyBackupToken,
} from "../site-auth";
import {
  countAdminsByRole,
  createAdmin,
  deleteAdmin,
  getAdminById,
  getAdminByUsername,
  getAdminRowById,
  setAdminTwoFactor,
  updateAdminBackupCodes,
  clearAdminTwoFactor,
  listAdmins,
  updateAdminPermissions,
  updateAdminSetor,
} from "../db-admins";
import {
  generateTwoFactorSecret,
  buildTwoFactorURI,
  verifyTwoFactorCode,
  generateBackupCodes,
  hashBackupCodes,
  verifyAndConsumeBackupCode,
} from "../two-factor-auth";
import {
  DEFAULT_USER_PERMISSIONS,
  PERMISSION_KEYS,
  normalizePermissions,
  type Permissions,
} from "@shared/permissions";
import { getContractBySlug } from "../db-contracts";
import { getOrganizationById } from "../db-organizations";
import { createDesktopSession, listActiveDesktopSessions, revokeDesktopSession } from "../db-desktop-sessions";
import { listActivity, logActivity } from "../db-activity";
import { sendTestEmail } from "../mailer";
import { sendTestWhatsApp } from "../whatsapp-service";

export const authRouter = router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),

    // Login com a senha única do site (substitui a checagem que era feita
    // só no frontend). A senha correta fica em APP_PASSWORD no servidor,
    // nunca no código do cliente.
    // Login com senha do site. Aceita duas formas:
    // 1) username + password → confere contra a tabela de admins nomeados
    // 2) só password (sem username) → senha mestra (APP_PASSWORD), usada
    //    como acesso de recuperação caso os admins nomeados sejam perdidos
    siteLogin: publicProcedure
      .input(
        z.object({
          username: z.string().trim().min(1).optional(),
          password: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const clientKey = getClientKey(ctx.req);

        const remainingMs = checkLoginRateLimit(clientKey);
        if (remainingMs !== null) {
          const minutes = Math.ceil(remainingMs / 60000);
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Muitas tentativas incorretas. Tente novamente em ${minutes} minuto${minutes !== 1 ? "s" : ""}.`,
          });
        }

        let isValid = false;
        let sessionUsername = "master";
        let sessionRole: "admin" | "user" = "admin";
        let sessionAdminId: string | null = null;
        // Segredo de 2FA da conta, se tiver uma ativa — só existe pra
        // contas nomeadas (o acesso mestre de recuperação nunca passa
        // por aqui, não tem uma linha própria na tabela admins pra
        // guardar um segredo).
        let twoFactorSecret: string | null = null;

        // Acesso mestre de recuperação. Aceita o usuário definido em
        // MASTER_USERNAME (se configurado) ou usuário em branco — o segundo
        // caminho fica só como retaguarda e não é oferecido pela interface,
        // que exige os dois campos.
        const masterUsername = process.env.MASTER_USERNAME?.trim().toLowerCase();
        const typedUsername = input.username?.trim().toLowerCase();
        const isMasterAttempt =
          !typedUsername || (!!masterUsername && typedUsername === masterUsername);

        if (typedUsername && !isMasterAttempt) {
          const admin = await getAdminByUsername(typedUsername);
          if (admin) {
            isValid = await verifyAdminPassword(input.password, admin.passwordHash);
            sessionUsername = admin.username;
            sessionRole = admin.role === "user" ? "user" : "admin";
            sessionAdminId = admin.id;
            twoFactorSecret = admin.twoFactorSecret;
          }
        } else {
          try {
            isValid = checkSitePassword(input.password);
            sessionUsername = masterUsername ?? "master";
          } catch (error) {
            console.error("siteLogin config error:", error);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Autenticação do site não configurada no servidor.",
            });
          }
        }

        if (!isValid) {
          registerFailedLoginAttempt(clientKey);
          // Mensagem idêntica nos dois casos: variar o texto conforme o
          // usuário estar preenchido ou não revelaria que existe um caminho de
          // acesso sem usuário.
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Usuário ou senha incorretos.",
          });
        }

        clearLoginAttempts(clientKey);

        // Segundo passo (código do app autenticador), só pra quem ativou
        // 2FA na própria conta — a sessão de verdade NÃO é criada ainda
        // aqui. O pendingToken prova só que a senha já foi conferida
        // com sucesso; sem ele, ninguém consegue tentar códigos de 2FA
        // sem antes ter acertado a senha.
        if (twoFactorSecret) {
          const pendingToken = await createPending2FAToken(sessionAdminId!);
          return { success: true, requires2FA: true, pendingToken } as const;
        }

        void logActivity({
          username: sessionUsername,
          role: sessionRole,
          action: "login",
        });

        // Marcador devolvido ao cliente, que o guarda no sessionStorage. O
        // acesso só vale enquanto os dois (cookie + marcador) existirem.
        const sessionMarker = generateSessionMarker();
        const token = await createSiteSessionToken(
          sessionUsername,
          sessionRole,
          sessionAdminId,
          sessionMarker
        );
        const cookieOptions = getSessionCookieOptions(ctx.req);
        // Sem maxAge: vira cookie de sessão do navegador, ou seja, ao fechar o
        // navegador o acesso é encerrado e é preciso entrar de novo. O token em
        // si continua expirando pelo prazo definido em site-auth.ts, então uma
        // aba deixada aberta também não fica válida para sempre.
        ctx.res.cookie(SITE_SESSION_COOKIE, token, cookieOptions);

        return { success: true, sessionMarker } as const;
      }),

    // Segundo passo do login, só chamado quando siteLogin devolveu
    // requires2FA:true. O pendingToken (curta duração, nunca vira cookie)
    // prova que a senha já foi conferida — sem ele não dá pra tentar
    // código nenhum.
    verify2FALogin: publicProcedure
      .input(z.object({ pendingToken: z.string().min(1), code: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const clientKey = getClientKey(ctx.req);
        const remainingMs = checkLoginRateLimit(clientKey);
        if (remainingMs !== null) {
          const minutes = Math.ceil(remainingMs / 60000);
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Muitas tentativas incorretas. Tente novamente em ${minutes} minuto${minutes !== 1 ? "s" : ""}.`,
          });
        }

        const adminId = await verifyPending2FAToken(input.pendingToken);
        if (!adminId) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Sessão de login expirada. Faça login novamente.",
          });
        }

        const admin = await getAdminRowById(adminId);
        if (!admin || !admin.twoFactorSecret) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Conta inválida." });
        }

        let valid = await verifyTwoFactorCode(admin.twoFactorSecret, input.code);
        if (!valid) {
          // Não bateu como código do app — tenta como código de backup
          // (formato bem diferente, então não há ambiguidade real entre
          // os dois).
          const backupResult = await verifyAndConsumeBackupCode(admin.twoFactorBackupCodes, input.code);
          if (backupResult.valid) {
            valid = true;
            await updateAdminBackupCodes(admin.id, backupResult.remainingCodesJson);
          }
        }

        if (!valid) {
          registerFailedLoginAttempt(clientKey);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Código incorreto." });
        }

        clearLoginAttempts(clientKey);

        const sessionRole: "admin" | "user" = admin.role === "user" ? "user" : "admin";
        void logActivity({ username: admin.username, role: sessionRole, action: "login" });

        const sessionMarker = generateSessionMarker();
        const token = await createSiteSessionToken(admin.username, sessionRole, admin.id, sessionMarker);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(SITE_SESSION_COOKIE, token, cookieOptions);

        return { success: true, sessionMarker } as const;
      }),

    // Configuração de 2FA — quem já está logado gerencia a própria conta
    // (não é uma permissão de recurso, é um ajuste pessoal de segurança,
    // por isso siteAdminProcedure — qualquer conta logada, não só quem
    // tem permissão de X ou Y). O acesso mestre de recuperação nunca tem
    // linha na tabela admins, então não pode ativar 2FA — faz sentido,
    // já que ele é o próprio mecanismo de emergência caso alguém perca
    // acesso à conta normal.

    /** Passo 1: gera um segredo novo (ainda NÃO salvo no banco) e devolve
     * o QR code pra pessoa escanear no app autenticador. */
    setup2FAStart: siteAdminProcedure.mutation(async ({ ctx }) => {
      if (!ctx.siteAdminUsername) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O acesso mestre de recuperação não pode ativar 2FA." });
      }
      const secret = generateTwoFactorSecret();
      const uri = buildTwoFactorURI(secret, ctx.siteAdminUsername);
      const qrCodeDataUrl = await QRCode.toDataURL(uri);
      return { secret, qrCodeDataUrl } as const;
    }),

    /** Passo 2: confirma que o código digitado bate com o segredo gerado
     * no passo 1 — só ENTÃO salva de verdade e ativa. Devolve os códigos
     * de backup em texto puro (única vez que isso acontece — depois só
     * ficam guardados em hash). */
    confirm2FASetup: siteAdminProcedure
      .input(z.object({ secret: z.string().min(1), code: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteAdminUsername) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O acesso mestre de recuperação não pode ativar 2FA." });
        }
        const admin = await getAdminByUsername(ctx.siteAdminUsername);
        if (!admin) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Conta inválida." });
        }

        const valid = await verifyTwoFactorCode(input.secret, input.code);
        if (!valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Código incorreto. Confira o app autenticador e tente de novo.",
          });
        }

        const backupCodes = generateBackupCodes();
        const backupCodesJson = await hashBackupCodes(backupCodes);
        await setAdminTwoFactor(admin.id, input.secret, backupCodesJson);

        void logActivity({
          username: admin.username,
          role: ctx.siteRole,
          action: "admin.enable2FA",
        });

        return { success: true, backupCodes } as const;
      }),

    /** Desativa 2FA — exige a senha atual de novo, por segurança (evita
     * que alguém com a sessão aberta, mas sem saber a senha, desative a
     * proteção — por exemplo, num computador que ficou logado). */
    disable2FA: siteAdminProcedure
      .input(z.object({ password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteAdminUsername) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O acesso mestre de recuperação não tem 2FA." });
        }
        const admin = await getAdminByUsername(ctx.siteAdminUsername);
        if (!admin) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Conta inválida." });
        }

        const isValid = await verifyAdminPassword(input.password, admin.passwordHash);
        if (!isValid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta." });
        }

        await clearAdminTwoFactor(admin.id);

        void logActivity({
          username: admin.username,
          role: ctx.siteRole,
          action: "admin.disable2FA",
        });

        return { success: true } as const;
      }),

    // Login do programa de sincronização de pasta local (Windows) — mesma
    // validação de usuário/senha do login do site, mas devolve um token de
    // longa duração em vez de um cookie (o programa guarda esse token
    // criptografado no computador e usa como cabeçalho Authorization em
    // cada chamada). Usa o mesmo limite de tentativas do login do site.
    desktopLogin: publicProcedure
      .input(
        z.object({
          username: z.string().trim().min(1).optional(),
          password: z.string().min(1),
          // Nome do computador, sugerido pelo próprio programa
          // (os.hostname()) — pra aparecer na lista de "Dispositivos
          // conectados" e permitir revogar só este, se for perdido.
          deviceName: z.string().trim().max(255).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const clientKey = getClientKey(ctx.req);

        const remainingMs = checkLoginRateLimit(clientKey);
        if (remainingMs !== null) {
          const minutes = Math.ceil(remainingMs / 60000);
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Muitas tentativas incorretas. Tente novamente em ${minutes} minuto${minutes !== 1 ? "s" : ""}.`,
          });
        }

        let isValid = false;
        let sessionUsername = "master";
        let sessionRole: "admin" | "user" = "admin";
        let sessionAdminId: string | null = null;

        const masterUsername = process.env.MASTER_USERNAME?.trim().toLowerCase();
        const typedUsername = input.username?.trim().toLowerCase();
        const isMasterAttempt =
          !typedUsername || (!!masterUsername && typedUsername === masterUsername);

        if (typedUsername && !isMasterAttempt) {
          const admin = await getAdminByUsername(typedUsername);
          if (admin) {
            isValid = await verifyAdminPassword(input.password, admin.passwordHash);
            sessionUsername = admin.username;
            sessionRole = admin.role === "user" ? "user" : "admin";
            sessionAdminId = admin.id;
          }
        } else {
          try {
            isValid = checkSitePassword(input.password);
            sessionUsername = masterUsername ?? "master";
          } catch (error) {
            console.error("desktopLogin config error:", error);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Autenticação do site não configurada no servidor.",
            });
          }
        }

        if (!isValid) {
          registerFailedLoginAttempt(clientKey);
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Usuário ou senha incorretos.",
          });
        }

        clearLoginAttempts(clientKey);

        void logActivity({
          username: sessionUsername,
          role: sessionRole,
          action: "login",
        });

        const sessionId = uuidv4();
        await createDesktopSession({
          id: sessionId,
          username: sessionUsername,
          adminId: sessionAdminId,
          deviceName: input.deviceName ?? null,
        });
        const token = await createDesktopSyncToken(sessionUsername, sessionRole, sessionAdminId, sessionId);

        return { success: true, token, username: sessionUsername } as const;
      }),

    siteLogout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(SITE_SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(IMPERSONATION_BACKUP_COOKIE, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    // Volta da sessão "ver como" para a sessão original do administrador.
    // Não usa masterAdminProcedure de propósito: durante o impersonate a
    // sessão ativa é a do usuário (role 'user'), então essa rota precisa
    // funcionar mesmo sem privilégio de admin — a validação real é o
    // cookie de retaguarda ter uma assinatura válida.
    stopImpersonating: publicProcedure.mutation(async ({ ctx }) => {
      const backupToken = getRawCookie(ctx.req, IMPERSONATION_BACKUP_COOKIE);
      if (!backupToken) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não há uma sessão de administrador para retornar.",
        });
      }

      const decoded = await verifyBackupToken(backupToken);
      if (!decoded) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "A sessão de administrador salva expirou. Faça login novamente.",
        });
      }

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(SITE_SESSION_COOKIE, backupToken, cookieOptions);
      ctx.res.clearCookie(IMPERSONATION_BACKUP_COOKIE, { ...cookieOptions, maxAge: -1 });

      void logActivity({
        username: decoded.username,
        role: "admin",
        action: "account.stopImpersonate",
      });

      return { success: true, sessionMarker: decoded.marker } as const;
    }),

    siteSession: publicProcedure.query(async ({ ctx }) => ({
      isSiteAdmin: ctx.isSiteAdmin,
      username: ctx.siteAdminUsername,
      role: ctx.siteRole,
      permissions: ctx.sitePermissions,
      // Objeto completo (não só o slug), para o cabeçalho montar o título
      // com o nome certo e a preposição certa sem outra consulta.
      contract: ctx.siteContract ? await getContractBySlug(ctx.siteContract) ?? null : null,
      // Organização (empresa dona da conta) de quem está logado — usada
      // pra mostrar o nome/marca certos no cabeçalho, em vez do nome do
      // produto (GesCon) fixo pra todo mundo. null no login mestre (que
      // enxerga além de uma organização só — ver siteOrganizationId em
      // server/_core/context.ts). Só os campos de marca vão pro cliente
      // — nunca os de cobrança (stripeCustomerId etc), que ficam só no
      // servidor.
      organization: ctx.siteOrganizationId
        ? await getOrganizationById(ctx.siteOrganizationId).then((org) =>
            org ? { id: org.id, slug: org.slug, name: org.name } : null
          )
        : null,
      isImpersonating: ctx.isImpersonating,
      hasTwoFactorEnabled: ctx.siteHasTwoFactorEnabled,
    })),

    // Teste de envio de e-mail — SOMENTE o administrador principal.
    testEmail: masterAdminProcedure.mutation(async ({ ctx }) => {
      const result = await sendTestEmail();
      void logActivity({
        username: ctx.siteAdminUsername,
        role: ctx.siteRole,
        action: "email.test",
        targetType: "email",
        details: result.success ? "teste de e-mail enviado" : `teste de e-mail falhou: ${result.message}`,
      });
      return result;
    }),

    // Teste de envio de WhatsApp — SOMENTE o administrador principal.
    testWhatsApp: masterAdminProcedure
      .input(z.object({ phone: z.string().min(8, "Informe um telefone válido") }))
      .mutation(async ({ input, ctx }) => {
        const result = await sendTestWhatsApp(input.phone);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "whatsapp.test",
          targetType: "whatsapp",
          details: result.success ? "teste de whatsapp enviado" : `teste de whatsapp falhou: ${result.message}`,
        });
        return result;
      }),

    // Rastro de atividades — SOMENTE o administrador principal.
    activity: router({
      list: masterAdminProcedure
        .input(
          z.object({
            limit: z.number().min(1).max(500).default(200),
            username: z.string().optional(),
          })
        )
        .query(async ({ input }) => {
          return listActivity({ limit: input.limit, username: input.username });
        }),
    }),

    // Gerenciamento de contas — SOMENTE o administrador principal.
    admins: router({
      list: masterAdminProcedure.query(async ({ ctx }) => {
        return listAdmins(ctx.siteOrganizationId);
      }),

      create: masterAdminProcedure
        .input(
          z.object({
            username: z
              .string()
              .trim()
              .min(3, "Usuário deve ter ao menos 3 caracteres")
              .max(50)
              .regex(/^[a-zA-Z0-9._-]+$/, "Use apenas letras, números, ponto, hífen ou underline"),
            password: z.string().min(8, "Senha deve ter ao menos 8 caracteres"),
            contract: z.string().min(1),
            setor: z.string().trim().max(100).nullish(),
            permissions: z.record(z.string(), z.boolean()).optional(),
          })
        )
        .mutation(async ({ input, ctx }) => {
          // getAdminByUsername busca GLOBALMENTE (não só na organização de
          // quem está criando) DE PROPÓSITO: o login de hoje ainda não
          // pergunta "de qual organização" (só existe uma organização com
          // uso real por enquanto), então dois admins com o mesmo nome de
          // usuário em organizações diferentes ficariam impossíveis de
          // logar sem ambiguidade. Não trocar essa checagem pra ficar
          // restrita à própria organização sem antes o login saber
          // desambiguar por organização (ver comentário em
          // getAdminByUsername, server/db-admins.ts).
          const existing = await getAdminByUsername(input.username);
          if (existing) {
            throw new TRPCError({ code: "CONFLICT", message: "Esse usuário já existe." });
          }

          const contract = await getContractBySlug(input.contract);
          if (!contract || contract.deleted) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato inválido ou excluído." });
          }

          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "account.create",
            targetType: "account",
            targetName: input.username,
            details: "usuário",
          });

          const passwordHash = await hashAdminPassword(input.password);
          return createAdmin({
            id: uuidv4(),
            username: input.username,
            passwordHash,
            // Só existe um administrador: a conta mestra configurada no
            // Railway (MASTER_USERNAME + APP_PASSWORD). Contas criadas por
            // aqui são sempre usuários, com permissões definidas na criação.
            role: "user",
            contract: input.contract,
            setor: input.setor,
            permissions: normalizePermissions(input.permissions ?? DEFAULT_USER_PERMISSIONS, "user"),
          });
        }),

      setSetor: masterAdminProcedure
        .input(z.object({ id: z.string(), setor: z.string().trim().max(100).nullable() }))
        .mutation(async ({ input }) => {
          await updateAdminSetor(input.id, input.setor);
          return { success: true } as const;
        }),

      setPermissions: masterAdminProcedure
        .input(
          z.object({
            id: z.string(),
            permissions: z.record(z.string(), z.boolean()),
          })
        )
        .mutation(async ({ input, ctx }) => {
          const target = await getAdminById(input.id);
          if (!target) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada." });
          }
          if (target.role === "admin") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "O administrador principal sempre tem acesso total.",
            });
          }

          const permissions: Permissions = normalizePermissions(input.permissions, "user");
          await updateAdminPermissions(input.id, permissions);

          const granted = PERMISSION_KEYS.filter(k => permissions[k]);
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "account.permissions",
            targetType: "account",
            targetId: input.id,
            targetName: target.username,
            details: granted.length ? granted.join(", ") : "nenhuma permissão",
          });

          return { success: true, permissions } as const;
        }),

      delete: masterAdminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
          const target = await getAdminById(input.id);
          if (!target) return { success: true } as const;

          if (target.username === ctx.siteAdminUsername) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Você não pode remover a própria conta enquanto estiver logado com ela.",
            });
          }

          if (target.role === "admin") {
            const adminCount = await countAdminsByRole("admin", target.organizationId);
            if (adminCount <= 1) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Não é possível remover o último administrador principal.",
              });
            }
          }

          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "account.delete",
            targetType: "account",
            targetId: input.id,
            targetName: target.username,
          });

          await deleteAdmin(input.id);
          return { success: true } as const;
        }),

      // "Ver como" um usuário — SOMENTE o administrador principal, e nunca
      // aninhado: enquanto estiver "vendo como", a sessão passa a ser desse
      // usuário (role 'user'), então masterAdminProcedure já bloqueia uma
      // segunda tentativa de impersonar sem precisar de checagem extra.
      impersonate: masterAdminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
          const target = await getAdminById(input.id);
          if (!target) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada." });
          }

          const currentToken = getRawCookie(ctx.req, SITE_SESSION_COOKIE);
          if (!currentToken) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
          }

          const sessionMarker = generateSessionMarker();
          const impersonatedToken = await createSiteSessionToken(
            target.username,
            "user",
            target.id,
            sessionMarker
          );

          const cookieOptions = getSessionCookieOptions(ctx.req);
          // Guarda a sessão atual do administrador para restaurar depois, e
          // troca a sessão ativa para a do usuário escolhido.
          ctx.res.cookie(IMPERSONATION_BACKUP_COOKIE, currentToken, cookieOptions);
          ctx.res.cookie(SITE_SESSION_COOKIE, impersonatedToken, cookieOptions);

          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "account.impersonate",
            targetType: "account",
            targetId: target.id,
            targetName: target.username,
          });

          return { success: true, sessionMarker, username: target.username } as const;
        }),
    }),

    // Sessões do programa de sincronização de pasta local (Windows) — só
    // o administrador principal, mesma lógica de "admins" acima (é
    // gerenciamento de infraestrutura de acesso, não algo de contrato
    // específico).
    desktopSessions: router({
      list: masterAdminProcedure.query(async () => {
        return listActiveDesktopSessions();
      }),

      revoke: masterAdminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
          await revokeDesktopSession(input.id);
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "desktopSession.revoke",
            targetType: "desktopSession",
            targetId: input.id,
          });
          return { success: true } as const;
        }),
    }),
  });
