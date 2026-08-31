import { COOKIE_NAME } from "@shared/const";
import { v4 as uuidv4 } from "uuid";
import { getSessionCookieOptions } from "../_core/cookies";
import { systemRouter } from "../_core/systemRouter";
import { publicProcedure, siteAdminProcedure, masterAdminProcedure, requirePermission, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAllEmployees, upsertEmployee, deleteEmployee, upsertTraining, getTrainingsByEmployeeId, getTrainingsGroupedByEmployee, setEmployeeDismissed, setEmployeeContract, getDistinctTrainingNames, deleteTraining, deleteTrainingsExcept } from "../db-employees";
import { listEpiRoleItems, countEpiRoleItemsByRole, listEpiResponsibleSuggestions, replaceEpiRoleItems } from "../db-epi";
import { getDb } from "../db";
import { emailNotifications, trainings, employees } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { uploadCertificate, getCertificatesByTrainingId, getCertificatesByEmployeeId, deleteCertificate, getCertificateById } from "../db-certificates";
import { uploadCertificateToSupabase, deleteCertificateFromSupabase, uploadPhotoToSupabase, getPhotoUrl, getAllPhotoUrls, uploadFdsToSupabase, deleteFdsFromSupabase } from "../supabase-storage";
import { listSafetySheets, getSafetySheetById, createSafetySheet, updateSafetySheetRoles, deleteSafetySheet, setSafetySheetContract } from "../db-fds";
import { checkSitePassword, createSiteSessionToken, SITE_SESSION_COOKIE, IMPERSONATION_BACKUP_COOKIE, getRawCookie, verifyBackupToken, generateSessionMarker, checkLoginRateLimit, registerFailedLoginAttempt, clearLoginAttempts, getClientKey, hashAdminPassword, verifyAdminPassword } from "../site-auth";
import { listAdmins, getAdminByUsername, createAdmin, deleteAdmin, countAdminsByRole, updateAdminPermissions, updateAdminSetor, listSetores, getAdminById } from "../db-admins";
import { PERMISSION_KEYS, DEFAULT_USER_PERMISSIONS, normalizePermissions, type Permissions } from "@shared/permissions";
import { DOCUMENT_TYPES } from "@shared/document-types";
import { DEFAULT_CONTRACT_SLUG, slugifyContract } from "@shared/contracts";
import {
  listContracts,
  getContractBySlug,
  getContractById,
  createContract,
  updateContract,
  softDeleteContract,
  restoreContract,
  permanentlyDeleteContract,
  countContractUsage,
  getContractsOverview,
  setContractPgr,
  removeContractPgr,
} from "../db-contracts";
import {
  listCustomFields,
  createCustomField,
  deleteCustomField,
  parseCustomFieldValues,
} from "../db-contract-fields";
import {
  listFolderContents,
  canAccessFolder,
  canAccessFile,
  getFolderPath,
  createFolder,
  renameFolder,
  deleteFolderRecursive,
  restoreFolder,
  createFileRecord,
  renameFile,
  moveFile,
  moveFolder,
  uploadNewVersion,
  listFileVersions,
  getVersionContentInfo,
  restoreFileVersion,
  getFileById,
  lockFile,
  unlockFile,
  isLockActive,
  softDeleteFile,
  restoreFile,
  permanentlyDeleteFile,
  listTrash,
  listFavorites,
  toggleFavorite,
  listRecentFiles,
  searchFiles,
  listSharedWithMe,
  listSharedByMe,
  createShare,
  revokeShare,
  getStorageInfo,
  setStorageLimit,
  adjustStorageUsed,
  recalculateStorageUsed,
  listGroups,
  createGroup,
  updateGroupAutoSetor,
  deleteGroup,
  listGroupMembers,
  listEffectiveGroupMembers,
  addGroupMember,
  removeGroupMember,
  listFilesNeedingR2Migration,
  pointFileToR2,
} from "../db-cloud";
import { uploadToR2, deleteFromR2, getR2DownloadUrl, getR2PreviewUrl, isR2Configured } from "../r2-storage";
import { listCustomRoles, createCustomRole, deleteCustomRole } from "../db-roles";
import {
  listTrainingTypes,
  getTrainingTypeByName,
  createTrainingType,
  updateTrainingType,
  deleteTrainingType,
  addMonthsToDate,
} from "../db-training-types";
import {
  listWarehouseItems,
  listWarehouseMovements,
  getWarehouseItemById,
  createWarehouseItem,
  updateWarehouseItem,
  deleteWarehouseItem,
  createWarehouseMovement,
  getPriceHistory,
} from "../db-warehouse";
import { WAREHOUSE_ITEM_TYPES, WAREHOUSE_MOVEMENT_TYPES, WAREHOUSE_ITEM_CONDITIONS } from "@shared/warehouse";
import {
  listToolDeliveries,
  listActiveDeliveriesForEmployee,
  createToolDelivery,
  returnToolDelivery,
} from "../db-tool-deliveries";
import {
  listPurchaseRequests,
  createPurchaseRequest,
  updatePurchaseRequestStatus,
  cancelPurchaseRequest,
  deletePurchaseRequest,
} from "../db-purchase-requests";
import { migrateWarehouseFromSupabase } from "../warehouse-migration";
import { PURCHASE_REQUEST_PRIORITIES, PURCHASE_REQUEST_STATUSES } from "@shared/warehouse";
import { uploadCloudFileToSupabase, deleteCloudFileFromSupabase } from "../supabase-storage";
import {
  listInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  setInvoiceContract,
} from "../db-invoices";
import {
  listInvoiceCategories,
  getInvoiceCategoryById,
  createInvoiceCategory,
  updateInvoiceCategory,
  deleteInvoiceCategory,
} from "../db-invoice-categories";
import { getInvoiceMonthlyLimit, setInvoiceMonthlyLimit } from "../db-invoice-settings";
import { uploadInvoiceFileToSupabase, deleteInvoiceFileFromSupabase } from "../supabase-storage";
import { INVOICE_DOC_TYPES, INVOICE_PAYMENT_METHODS, INVOICE_STATUSES } from "@shared/invoices";
import { logActivity, listActivity } from "../db-activity";
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
      isImpersonating: ctx.isImpersonating,
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
      list: masterAdminProcedure.query(async () => {
        return listAdmins();
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
            const adminCount = await countAdminsByRole("admin");
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
  });
