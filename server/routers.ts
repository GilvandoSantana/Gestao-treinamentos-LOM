import { COOKIE_NAME } from "@shared/const";
import { v4 as uuidv4 } from "uuid";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, siteAdminProcedure, masterAdminProcedure, requirePermission, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAllEmployees, upsertEmployee, deleteEmployee, upsertTraining, getTrainingsByEmployeeId, getTrainingsGroupedByEmployee, setEmployeeDismissed, setEmployeeContract, getDistinctTrainingNames, deleteTraining, deleteTrainingsExcept } from "./db-employees";
import { getDb } from "./db";
import { emailNotifications, trainings, employees } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { uploadCertificate, getCertificatesByTrainingId, getCertificatesByEmployeeId, deleteCertificate, getCertificateById } from "./db-certificates";
import { uploadCertificateToSupabase, deleteCertificateFromSupabase, uploadPhotoToSupabase, getPhotoUrl, getAllPhotoUrls, uploadFdsToSupabase, deleteFdsFromSupabase } from "./supabase-storage";
import { listSafetySheets, getSafetySheetById, createSafetySheet, updateSafetySheetRoles, deleteSafetySheet, setSafetySheetContract } from "./db-fds";
import { checkSitePassword, createSiteSessionToken, SITE_SESSION_COOKIE, IMPERSONATION_BACKUP_COOKIE, getRawCookie, verifyBackupToken, generateSessionMarker, checkLoginRateLimit, registerFailedLoginAttempt, clearLoginAttempts, getClientKey, hashAdminPassword, verifyAdminPassword } from "./site-auth";
import { listAdmins, getAdminByUsername, createAdmin, deleteAdmin, countAdminsByRole, updateAdminPermissions, getAdminById } from "./db-admins";
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
} from "./db-contracts";
import {
  listCustomFields,
  createCustomField,
  deleteCustomField,
  parseCustomFieldValues,
} from "./db-contract-fields";
import {
  listFolderContents,
  getFolderPath,
  createFolder,
  renameFolder,
  deleteFolderRecursive,
  restoreFolder,
  createFileRecord,
  renameFile,
  moveFile,
  moveFolder,
  getFileById,
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
  deleteGroup,
  listGroupMembers,
  addGroupMember,
  removeGroupMember,
  listFilesNeedingR2Migration,
  pointFileToR2,
} from "./db-cloud";
import { uploadToR2, deleteFromR2, getR2DownloadUrl, getR2PreviewUrl, isR2Configured } from "./r2-storage";
import { listCustomRoles, createCustomRole, deleteCustomRole } from "./db-roles";
import {
  listTrainingTypes,
  getTrainingTypeByName,
  createTrainingType,
  updateTrainingType,
  deleteTrainingType,
  addMonthsToDate,
} from "./db-training-types";
import {
  listWarehouseItems,
  listWarehouseMovements,
  getWarehouseItemById,
  createWarehouseItem,
  updateWarehouseItem,
  deleteWarehouseItem,
  createWarehouseMovement,
  getPriceHistory,
} from "./db-warehouse";
import { WAREHOUSE_ITEM_TYPES, WAREHOUSE_MOVEMENT_TYPES } from "@shared/warehouse";
import {
  listToolDeliveries,
  listActiveDeliveriesForEmployee,
  createToolDelivery,
  returnToolDelivery,
} from "./db-tool-deliveries";
import {
  listPurchaseRequests,
  createPurchaseRequest,
  updatePurchaseRequestStatus,
  cancelPurchaseRequest,
  deletePurchaseRequest,
} from "./db-purchase-requests";
import { migrateWarehouseFromSupabase } from "./warehouse-migration";
import { PURCHASE_REQUEST_PRIORITIES, PURCHASE_REQUEST_STATUSES } from "@shared/warehouse";
import { uploadCloudFileToSupabase, deleteCloudFileFromSupabase } from "./supabase-storage";
import {
  listInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  setInvoiceContract,
} from "./db-invoices";
import {
  listInvoiceCategories,
  getInvoiceCategoryById,
  createInvoiceCategory,
  updateInvoiceCategory,
  deleteInvoiceCategory,
} from "./db-invoice-categories";
import { getInvoiceMonthlyLimit, setInvoiceMonthlyLimit } from "./db-invoice-settings";
import { uploadInvoiceFileToSupabase, deleteInvoiceFileFromSupabase } from "./supabase-storage";
import { INVOICE_DOC_TYPES, INVOICE_PAYMENT_METHODS, INVOICE_STATUSES } from "@shared/invoices";
import { logActivity, listActivity } from "./db-activity";
import { sendTestEmail } from "./mailer";
import { sendTestWhatsApp } from "./whatsapp-service";

export const appRouter = router({
  system: systemRouter,
  auth: router({
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
            permissions: normalizePermissions(input.permissions ?? DEFAULT_USER_PERMISSIONS, "user"),
          });
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
  }),

  // Nuvem de arquivos por contrato (estilo SharePoint). Acesso controlado
  // pelas permissões viewCloud/manageCloud, individuais por usuário.
  cloud: router({
    list: requirePermission('viewCloud')
      .input(z.object({ folderId: z.string().nullable() }).optional())
      .query(async ({ input, ctx }) => {
        if (!ctx.siteContract) return { folders: [], files: [], path: [] };
        const folderId = input?.folderId ?? null;
        const [contents, path] = await Promise.all([
          listFolderContents(ctx.siteContract, folderId),
          folderId ? getFolderPath(folderId) : Promise.resolve([]),
        ]);
        return { ...contents, path };
      }),

    // Espaço usado/limite do contrato — mostrado no topo da Nuvem.
    storageInfo: requirePermission('viewCloud').query(async ({ ctx }) => {
      if (!ctx.siteContract) return { limitBytes: 0, usedBytes: 0 };
      return getStorageInfo(ctx.siteContract);
    }),

    // Só o administrador principal pode aumentar o limite (10GB -> 1TB, etc).
    setStorageLimit: masterAdminProcedure
      .input(z.object({ limitBytes: z.number().positive() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        await setStorageLimit(ctx.siteContract, input.limitBytes);
        return { success: true } as const;
      }),

    // Rotina de segurança: recalcula o espaço usado somando os arquivos de
    // verdade, caso o contador fique dessincronizado por algum motivo.
    recalculateStorage: masterAdminProcedure.mutation(async ({ ctx }) => {
      if (!ctx.siteContract) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
      }
      const usedBytes = await recalculateStorageUsed(ctx.siteContract);
      return { usedBytes } as const;
    }),

    createFolder: requirePermission('manageCloud')
      .input(z.object({ parentId: z.string().nullable(), name: z.string().trim().min(1).max(255) }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Escolha um contrato no cabeçalho antes de criar uma pasta.",
          });
        }
        const folder = await createFolder({
          id: uuidv4(),
          contractSlug: ctx.siteContract,
          parentId: input.parentId,
          name: input.name,
          createdBy: ctx.siteAdminUsername,
        });
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.folderCreate",
          targetType: "cloudFolder",
          targetId: folder.id,
          targetName: folder.name,
        });
        return folder;
      }),

    renameFolder: requirePermission('manageCloud')
      .input(z.object({ id: z.string(), name: z.string().trim().min(1).max(255) }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        await renameFolder(input.id, ctx.siteContract, input.name);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.folderRename",
          targetType: "cloudFolder",
          targetId: input.id,
          targetName: input.name,
        });
        return { success: true } as const;
      }),

    // Move a pasta pra lixeira (não apaga de vez).
    deleteFolder: requirePermission('manageCloud')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        await deleteFolderRecursive(input.id, ctx.siteContract, ctx.siteAdminUsername, false);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.folderDelete",
          targetType: "cloudFolder",
          targetId: input.id,
        });
        return { success: true } as const;
      }),

    restoreFolder: requirePermission('manageCloud')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        await restoreFolder(input.id, ctx.siteContract);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.folderRestore",
          targetType: "cloudFolder",
          targetId: input.id,
        });
        return { success: true } as const;
      }),

    upload: requirePermission('manageCloud')
      .input(
        z.object({
          folderId: z.string().nullable(),
          name: z.string().trim().min(1).max(255),
          fileName: z.string(),
          fileData: z.string(),
          mimeType: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Escolha um contrato no cabeçalho antes de enviar um arquivo.",
          });
        }

        const fileBuffer = Buffer.from(input.fileData, "base64");
        const MAX_CLOUD_BYTES = 200 * 1024 * 1024;
        if (fileBuffer.length > MAX_CLOUD_BYTES) {
          throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "O arquivo excede o limite de 200MB." });
        }

        // Confere se cabe no espaço disponível ANTES de subir pro R2.
        const storage = await getStorageInfo(ctx.siteContract);
        if (storage.usedBytes + fileBuffer.length > storage.limitBytes) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Espaço de armazenamento insuficiente.",
          });
        }

        if (!isR2Configured) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "O armazenamento em nuvem (Cloudflare R2) ainda não foi configurado. Defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET_NAME no Railway.",
          });
        }

        // Espelha as pastas do sistema na chave do R2, para o arquivo
        // aparecer organizado também olhando direto lá — ex:
        // lom/contratos/assinados/uuid-arquivo.pdf
        const folderChain = input.folderId ? await getFolderPath(input.folderId) : [];
        const folderPath = folderChain.map((f) => slugifyContract(f.name)).join("/");
        const fileId = uuidv4();
        const r2Key = `${ctx.siteContract}/${folderPath ? `${folderPath}/` : ""}${fileId}-${input.fileName}`;

        await uploadToR2(r2Key, fileBuffer, input.mimeType);

        const file = await createFileRecord({
          id: fileId,
          contractSlug: ctx.siteContract,
          folderId: input.folderId,
          name: input.name,
          r2Key,
          fileSize: fileBuffer.length,
          mimeType: input.mimeType,
          uploadedBy: ctx.siteAdminUsername,
        });

        await adjustStorageUsed(ctx.siteContract, fileBuffer.length);

        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.fileUpload",
          targetType: "cloudFile",
          targetId: file.id,
          targetName: file.name,
        });

        return file;
      }),

    renameFile: requirePermission('manageCloud')
      .input(z.object({ id: z.string(), name: z.string().trim().min(1).max(255) }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        await renameFile(input.id, ctx.siteContract, input.name);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.fileRename",
          targetType: "cloudFile",
          targetId: input.id,
          targetName: input.name,
        });
        return { success: true } as const;
      }),

    moveFile: requirePermission('manageCloud')
      .input(z.object({ id: z.string(), folderId: z.string().nullable() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        await moveFile(input.id, ctx.siteContract, input.folderId);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.fileMove",
          targetType: "cloudFile",
          targetId: input.id,
        });
        return { success: true } as const;
      }),

    moveFolder: requirePermission('manageCloud')
      .input(z.object({ id: z.string(), targetFolderId: z.string().nullable() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        try {
          await moveFolder(input.id, ctx.siteContract, input.targetFolderId);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Erro ao mover pasta.",
          });
        }
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.folderMove",
          targetType: "cloudFolder",
          targetId: input.id,
        });
        return { success: true } as const;
      }),

    // Gera uma URL temporária (1h) pra baixar — nunca expõe um link fixo.
    // Verifica permissão de acesso: dono do contrato (viewCloud) ou alguém
    // com quem o arquivo foi compartilhado.
    getDownloadUrl: requirePermission('viewCloud')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const file = await getFileById(input.id);
        if (!file || file.contractSlug !== ctx.siteContract) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo não encontrado." });
        }
        if (file.r2Key) {
          if (!isR2Configured) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Armazenamento não configurado." });
          }
          const url = await getR2DownloadUrl(file.r2Key, file.name);
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "cloud.fileDownload",
            targetType: "cloudFile",
            targetId: file.id,
            targetName: file.name,
          });
          return { url };
        }
        // Arquivo antigo, ainda no Supabase — link direto (legado).
        if (file.fileUrl) return { url: file.fileUrl };
        throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo sem conteúdo associado." });
      }),

    // URL pra abrir o arquivo direto no navegador (PDF/imagem), sem forçar
    // download. Mesma checagem de permissão da rota de download.
    getPreviewUrl: requirePermission('viewCloud')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const file = await getFileById(input.id);
        if (!file || file.contractSlug !== ctx.siteContract) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo não encontrado." });
        }
        if (file.r2Key) {
          if (!isR2Configured) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Armazenamento não configurado." });
          }
          const url = await getR2PreviewUrl(file.r2Key);
          return { url, mimeType: file.mimeType };
        }
        if (file.fileUrl) return { url: file.fileUrl, mimeType: file.mimeType };
        throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo sem conteúdo associado." });
      }),

    // Move pra lixeira (não apaga de vez, não mexe no R2 ainda).
    deleteFile: requirePermission('manageCloud')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const file = await getFileById(input.id);
        await softDeleteFile(input.id, ctx.siteContract, ctx.siteAdminUsername);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.fileDelete",
          targetType: "cloudFile",
          targetId: input.id,
          targetName: file?.name,
        });
        return { success: true } as const;
      }),

    restoreFile: requirePermission('manageCloud')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        await restoreFile(input.id, ctx.siteContract);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.fileRestore",
          targetType: "cloudFile",
          targetId: input.id,
        });
        return { success: true } as const;
      }),

    // Lixeira — pastas e arquivos marcados como excluídos.
    listTrash: requirePermission('viewCloud').query(async ({ ctx }) => {
      if (!ctx.siteContract) return { folders: [], files: [] };
      return listTrash(ctx.siteContract);
    }),

    // Exclusão definitiva — some do banco e do R2, nunca mais volta.
    permanentlyDeleteFile: requirePermission('manageCloud')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const file = await permanentlyDeleteFile(input.id, ctx.siteContract);
        if (file) {
          if (file.r2Key) await deleteFromR2(file.r2Key);
          else if (file.fileUrl) await deleteCloudFileFromSupabase(file.fileUrl);
          await adjustStorageUsed(ctx.siteContract, -(file.fileSize ?? 0));
        }
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.filePermanentDelete",
          targetType: "cloudFile",
          targetId: input.id,
          targetName: file?.name,
        });
        return { success: true } as const;
      }),

    permanentlyDeleteFolder: requirePermission('manageCloud')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const removed = await deleteFolderRecursive(input.id, ctx.siteContract, ctx.siteAdminUsername, true);
        let freedBytes = 0;
        for (const key of removed.r2Keys) {
          await deleteFromR2(key);
        }
        for (const url of removed.fileUrls) {
          await deleteCloudFileFromSupabase(url);
        }
        // Não temos o tamanho aqui de cada arquivo removido — recalcula pra
        // garantir consistência em vez de tentar somar às cegas.
        await recalculateStorageUsed(ctx.siteContract);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.folderPermanentDelete",
          targetType: "cloudFolder",
          targetId: input.id,
        });
        return { success: true, freedBytes } as const;
      }),

    // Favoritos — arquivo ou pasta, nunca os dois.
    listFavorites: requirePermission('viewCloud').query(async ({ ctx }) => {
      if (!ctx.siteContract || !ctx.siteAdminUsername) return [];
      return listFavorites(ctx.siteContract, ctx.siteAdminUsername);
    }),

    toggleFavorite: requirePermission('viewCloud')
      .input(z.object({ fileId: z.string().optional(), folderId: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract || !ctx.siteAdminUsername) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Sessão inválida." });
        }
        if (!input.fileId && !input.folderId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um arquivo ou pasta." });
        }
        const isFavorite = await toggleFavorite(uuidv4(), ctx.siteContract, ctx.siteAdminUsername, input);
        return { isFavorite } as const;
      }),

    // Recentes — últimos enviados/modificados.
    listRecent: requirePermission('viewCloud').query(async ({ ctx }) => {
      if (!ctx.siteContract) return [];
      return listRecentFiles(ctx.siteContract);
    }),

    // Busca por nome, dentro do contrato do usuário.
    search: requirePermission('viewCloud')
      .input(z.object({ query: z.string() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.siteContract) return [];
        return searchFiles(ctx.siteContract, input.query);
      }),

    // Compartilhamento pessoa a pessoa.
    listSharedWithMe: requirePermission('viewCloud').query(async ({ ctx }) => {
      if (!ctx.siteContract || !ctx.siteAdminUsername) return [];
      return listSharedWithMe(ctx.siteContract, ctx.siteAdminUsername);
    }),

    listSharedByMe: requirePermission('viewCloud').query(async ({ ctx }) => {
      if (!ctx.siteContract || !ctx.siteAdminUsername) return [];
      return listSharedByMe(ctx.siteContract, ctx.siteAdminUsername);
    }),

    // Compartilha com uma pessoa OU com um grupo — nunca os dois ao mesmo
    // tempo. Informe exatamente um dos dois: sharedWith ou groupId.
    shareFile: requirePermission('manageCloud')
      .input(
        z.object({
          fileId: z.string(),
          sharedWith: z.string().trim().optional(),
          groupId: z.string().optional(),
          permission: z.enum(["view", "download", "edit"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract || !ctx.siteAdminUsername) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Sessão inválida." });
        }
        if (!input.sharedWith && !input.groupId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha uma pessoa ou um grupo." });
        }
        const file = await getFileById(input.fileId);
        if (!file || file.contractSlug !== ctx.siteContract) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo não encontrado." });
        }
        if (input.sharedWith === ctx.siteAdminUsername) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível compartilhar consigo mesmo." });
        }
        const share = await createShare({
          id: uuidv4(),
          contractSlug: ctx.siteContract,
          fileId: input.fileId,
          itemName: file.name,
          sharedBy: ctx.siteAdminUsername,
          sharedWith: input.sharedWith || null,
          sharedWithGroupId: input.groupId || null,
          permission: input.permission,
        });
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.share",
          targetType: "cloudFile",
          targetId: input.fileId,
          targetName: `${file.name} → ${share.sharedWith ?? share.sharedWithGroupName ?? "?"}`,
        });
        return share;
      }),

    revokeShare: requirePermission('manageCloud')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        await revokeShare(input.id, ctx.siteContract);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.unshare",
          targetType: "cloudShare",
          targetId: input.id,
        });
        return { success: true } as const;
      }),

    // Grupos (setor/cargo/equipe) — compartilhar com o grupo dá acesso a
    // todos os membros dele de uma vez. Só o administrador principal
    // cria/apaga grupo e mexe nos membros; qualquer um com manageCloud
    // pode listar (é o que preenche o seletor na hora de compartilhar).
    listGroups: requirePermission('manageCloud').query(async ({ ctx }) => {
      if (!ctx.siteContract) return [];
      return listGroups(ctx.siteContract);
    }),

    createGroup: masterAdminProcedure
      .input(z.object({ name: z.string().trim().min(2, "Informe o nome do grupo").max(120) }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const group = await createGroup(uuidv4(), ctx.siteContract, input.name);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.groupCreate",
          targetType: "cloudGroup",
          targetId: group.id,
          targetName: group.name,
        });
        return group;
      }),

    deleteGroup: masterAdminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        await deleteGroup(input.id, ctx.siteContract);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.groupDelete",
          targetType: "cloudGroup",
          targetId: input.id,
        });
        return { success: true } as const;
      }),

    listGroupMembers: requirePermission('manageCloud')
      .input(z.object({ groupId: z.string() }))
      .query(async ({ input }) => {
        return listGroupMembers(input.groupId);
      }),

    addGroupMember: masterAdminProcedure
      .input(z.object({ groupId: z.string(), username: z.string().trim().min(1) }))
      .mutation(async ({ input, ctx }) => {
        await addGroupMember(uuidv4(), input.groupId, input.username.trim());
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.groupAddMember",
          targetType: "cloudGroup",
          targetId: input.groupId,
          targetName: input.username,
        });
        return { success: true } as const;
      }),

    removeGroupMember: masterAdminProcedure
      .input(z.object({ groupId: z.string(), username: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await removeGroupMember(input.groupId, input.username);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.groupRemoveMember",
          targetType: "cloudGroup",
          targetId: input.groupId,
          targetName: input.username,
        });
        return { success: true } as const;
      }),

    // Migração dos arquivos que ainda estão só no Supabase (de antes do R2
    // existir) — baixa o conteúdo de lá e sobe pro R2, sem perder nada se
    // der erro no meio (cada arquivo é independente).
    migrateLegacyToR2: masterAdminProcedure.mutation(async ({ ctx }) => {
      if (!ctx.siteContract) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
      }
      if (!isR2Configured) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cloudflare R2 não está configurado." });
      }

      const pending = await listFilesNeedingR2Migration(ctx.siteContract);
      let migrated = 0;
      const failed: string[] = [];

      for (const file of pending) {
        try {
          if (!file.fileUrl) continue;
          const res = await fetch(file.fileUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = Buffer.from(await res.arrayBuffer());

          const folderChain = file.folderId ? await getFolderPath(file.folderId) : [];
          const folderPath = folderChain.map((f) => slugifyContract(f.name)).join("/");
          const r2Key = `${ctx.siteContract}/${folderPath ? `${folderPath}/` : ""}${file.id}-${file.name}`;

          await uploadToR2(r2Key, buffer, file.mimeType || "application/octet-stream");
          await pointFileToR2(file.id, r2Key);
          await deleteCloudFileFromSupabase(file.fileUrl);
          migrated++;
        } catch (error) {
          console.error(`[migrateLegacyToR2] Falha em "${file.name}":`, error);
          failed.push(file.name);
        }
      }

      void logActivity({
        username: ctx.siteAdminUsername,
        role: ctx.siteRole,
        action: "cloud.migrateLegacy",
        details: `${migrated} migrado(s), ${failed.length} falha(s)`,
      });

      return { total: pending.length, migrated, failed } as const;
    }),
  }),

  // Notas Fiscais e recibos — separados por contrato.
  invoices: router({
    list: requirePermission('viewInvoices').query(async ({ ctx }) => {
      return listInvoices(ctx.siteContract ?? undefined);
    }),

    // Reatribuir nota fiscal para outro contrato — SOMENTE o administrador.
    changeContract: masterAdminProcedure
      .input(z.object({ id: z.string(), contractSlug: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const contract = await getContractBySlug(input.contractSlug);
        if (!contract || contract.deleted) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato inválido ou excluído." });
        }
        await setInvoiceContract(input.id, input.contractSlug);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "invoice.update",
          targetType: "invoice",
          targetId: input.id,
          details: `movido para ${contract.name}`,
        });
        return { success: true } as const;
      }),

    upsertOne: requirePermission('manageInvoices')
      .input(
        z.object({
          id: z.string().optional(),
          docType: z.enum(INVOICE_DOC_TYPES).default("nota_fiscal"),
          number: z.string().trim().optional(),
          supplier: z.string().trim().optional(),
          cnpj: z.string().trim().optional(),
          issueDate: z.string().min(1, "Informe a data de emissão"),
          value: z.number().min(0, "Informe o valor total"),
          taxes: z.number().min(0).default(0),
          products: z
            .array(
              z.object({
                name: z.string(),
                qty: z.number(),
                unit_price: z.number(),
                total: z.number(),
              })
            )
            .default([]),
          category: z.string().trim().optional(),
          costCenter: z.string().trim().optional(),
          paymentMethod: z.enum(INVOICE_PAYMENT_METHODS).optional(),
          description: z.string().trim().optional(),
          fileName: z.string().optional(),
          fileData: z.string().optional(),
          status: z.enum(INVOICE_STATUSES).default("processado"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.siteRole === "admin" && !ctx.siteContract) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Escolha um contrato no cabeçalho antes de cadastrar uma nota fiscal.",
          });
        }

        let fileUrl: string | undefined;
        let fileSize: number | undefined;
        let fileName: string | undefined;

        if (input.fileData && input.fileName) {
          const fileBuffer = Buffer.from(input.fileData, "base64");

          const MAX_INVOICE_BYTES = 10 * 1024 * 1024;
          if (fileBuffer.length > MAX_INVOICE_BYTES) {
            throw new TRPCError({
              code: "PAYLOAD_TOO_LARGE",
              message: "O arquivo excede o limite de 10MB.",
            });
          }

          const ext = input.fileName.split(".").pop()?.toLowerCase();
          const mimeType =
            ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg";

          const upload = await uploadInvoiceFileToSupabase(
            fileBuffer,
            input.fileName,
            mimeType,
            ctx.siteContract ?? DEFAULT_CONTRACT_SLUG
          );
          fileUrl = upload.url;
          fileSize = fileBuffer.length;
          fileName = input.fileName;
        }

        const contract = ctx.siteContract ?? DEFAULT_CONTRACT_SLUG;

        if (input.id) {
          const existing = await getInvoiceById(input.id);
          if (!existing) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada." });
          }
          await updateInvoice(input.id, {
            docType: input.docType,
            number: input.number,
            supplier: input.supplier,
            cnpj: input.cnpj,
            issueDate: input.issueDate,
            value: input.value,
            taxes: input.taxes,
            products: input.products,
            category: input.category,
            costCenter: input.costCenter,
            paymentMethod: input.paymentMethod,
            description: input.description,
            status: input.status,
            ...(fileUrl ? { fileUrl, fileSize, fileName } : {}),
          });

          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "invoice.update",
            targetType: "invoice",
            targetId: input.id,
            targetName: input.supplier ?? input.number,
          });

          return (await getInvoiceById(input.id))!;
        }

        const created = await createInvoice({
          id: uuidv4(),
          contract,
          docType: input.docType,
          number: input.number,
          supplier: input.supplier,
          cnpj: input.cnpj,
          issueDate: input.issueDate,
          value: input.value,
          taxes: input.taxes,
          products: input.products,
          category: input.category,
          costCenter: input.costCenter,
          paymentMethod: input.paymentMethod,
          description: input.description,
          fileName,
          fileUrl,
          fileSize,
          status: input.status,
        });

        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "invoice.create",
          targetType: "invoice",
          targetId: created.id,
          targetName: created.supplier ?? created.number ?? undefined,
        });

        return created;
      }),

    delete: requirePermission('manageInvoices')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getInvoiceById(input.id);
        if (!existing) return { success: true } as const;

        if (existing.fileUrl) {
          await deleteInvoiceFileFromSupabase(existing.fileUrl);
        }
        await deleteInvoice(input.id);

        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "invoice.delete",
          targetType: "invoice",
          targetId: input.id,
          targetName: existing.supplier ?? existing.number ?? undefined,
        });

        return { success: true } as const;
      }),

    // Categorias — compartilhadas entre contratos.
    categories: router({
      list: requirePermission('viewInvoices').query(async () => {
        return listInvoiceCategories();
      }),

      create: requirePermission('manageInvoices')
        .input(z.object({ name: z.string().trim().min(1, "Informe o nome da categoria").max(120), color: z.string().min(1) }))
        .mutation(async ({ input }) => {
          return createInvoiceCategory({ id: uuidv4(), name: input.name, color: input.color });
        }),

      update: requirePermission('manageInvoices')
        .input(z.object({ id: z.string(), name: z.string().trim().min(1).max(120), color: z.string().min(1) }))
        .mutation(async ({ input }) => {
          await updateInvoiceCategory(input.id, { name: input.name, color: input.color });
          return { success: true } as const;
        }),

      delete: requirePermission('manageInvoices')
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }) => {
          const category = await getInvoiceCategoryById(input.id);
          if (!category) return { success: true } as const;
          if (category.isDefault) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Categorias padrão do sistema não podem ser excluídas.",
            });
          }
          await deleteInvoiceCategory(input.id);
          return { success: true } as const;
        }),
    }),

    // Configurações do módulo — hoje só o limite de gastos mensais.
    settings: router({
      get: requirePermission('viewInvoices').query(async ({ ctx }) => {
        const contract = ctx.siteContract ?? DEFAULT_CONTRACT_SLUG;
        return { monthlyLimit: await getInvoiceMonthlyLimit(contract) };
      }),

      setMonthlyLimit: requirePermission('manageInvoices')
        .input(z.object({ value: z.number().min(0) }))
        .mutation(async ({ input, ctx }) => {
          const contract = ctx.siteContract ?? DEFAULT_CONTRACT_SLUG;
          await setInvoiceMonthlyLimit(contract, input.value);
          return { success: true } as const;
        }),
    }),
  }),

  // FDS — Ficha de Dados de Segurança
  fds: router({
    list: requirePermission('viewCertificates')
      .input(z.object({ type: z.enum(DOCUMENT_TYPES).optional() }).optional())
      .query(async ({ input, ctx }) => {
        return listSafetySheets(input?.type, ctx.siteContract ?? undefined);
      }),

    // Reatribuir documento para outro contrato — SOMENTE o administrador.
    changeContract: masterAdminProcedure
      .input(z.object({ id: z.string(), contractSlug: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const contract = await getContractBySlug(input.contractSlug);
        if (!contract || contract.deleted) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato inválido ou excluído." });
        }
        await setSafetySheetContract(input.id, input.contractSlug);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "fds.update",
          targetType: "document",
          targetId: input.id,
          details: `movido para ${contract.name}`,
        });
        return { success: true } as const;
      }),

    upload: requirePermission('manageCertificates')
      .input(
        z.object({
          type: z.enum(DOCUMENT_TYPES).default('fds'),
          name: z.string().trim().min(1, "Informe o nome do documento").max(255),
          fileName: z.string(),
          fileData: z.string(),
          roles: z.array(z.string()).default([]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.siteRole === "admin" && !ctx.siteContract) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Escolha um contrato no cabeçalho antes de cadastrar um documento.",
          });
        }

        const fileBuffer = Buffer.from(input.fileData, "base64");

        const MAX_FDS_BYTES = 10 * 1024 * 1024;
        if (fileBuffer.length > MAX_FDS_BYTES) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: "O arquivo excede o limite de 10MB.",
          });
        }

        const contract = ctx.siteContract ?? DEFAULT_CONTRACT_SLUG;
        const upload = await uploadFdsToSupabase(fileBuffer, input.fileName, "application/pdf", contract, input.type);

        const sheet = await createSafetySheet({
          id: uuidv4(),
          type: input.type,
          contract,
          name: input.name,
          fileName: input.fileName,
          fileUrl: upload.url,
          fileSize: fileBuffer.length,
          roles: input.roles,
        });

        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "fds.upload",
          targetType: "fds",
          targetId: sheet.id,
          targetName: sheet.name,
          details: input.roles.length ? `${input.roles.length} função(ões)` : "sem função vinculada",
        });

        return sheet;
      }),

    setRoles: requirePermission('manageCertificates')
      .input(z.object({ id: z.string(), roles: z.array(z.string()) }))
      .mutation(async ({ input, ctx }) => {
        const sheet = await getSafetySheetById(input.id);
        if (!sheet) throw new TRPCError({ code: "NOT_FOUND", message: "FDS não encontrada." });

        await updateSafetySheetRoles(input.id, input.roles);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "fds.update",
          targetType: "fds",
          targetId: input.id,
          targetName: sheet.name,
        });
        return { success: true } as const;
      }),

    delete: requirePermission('manageCertificates')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const sheet = await getSafetySheetById(input.id);
        if (!sheet) return { success: true } as const;

        await deleteFdsFromSupabase(sheet.fileUrl);
        await deleteSafetySheet(input.id);

        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "fds.delete",
          targetType: "fds",
          targetId: input.id,
          targetName: sheet.name,
        });
        return { success: true } as const;
      }),
  }),

  // Contratos — SOMENTE o administrador principal gerencia.
  contracts: router({
    list: masterAdminProcedure
      .input(z.object({ includeDeleted: z.boolean().default(false) }).optional())
      .query(async ({ input }) => {
        return listContracts(input?.includeDeleted ?? false);
      }),

    create: masterAdminProcedure
      .input(
        z.object({
          name: z.string().trim().min(2, "Informe o nome do contrato").max(120),
          preposition: z.enum(["do", "da"]),
          alertEmail: z.string().email().optional().or(z.literal("")),
          alertWhatsapp: z.string().optional().or(z.literal("")),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const contract = await createContract({
          id: uuidv4(),
          name: input.name,
          preposition: input.preposition,
          alertEmail: input.alertEmail || null,
          alertWhatsapp: input.alertWhatsapp || null,
        });
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "contract.create",
          targetType: "contract",
          targetId: contract.id,
          targetName: contract.name,
        });
        return contract;
      }),

    update: masterAdminProcedure
      .input(
        z.object({
          id: z.string(),
          name: z.string().trim().min(2, "Informe o nome do contrato").max(120),
          preposition: z.enum(["do", "da"]),
          alertEmail: z.string().email().optional().or(z.literal("")),
          alertWhatsapp: z.string().optional().or(z.literal("")),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const existing = await getContractById(input.id);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
        }
        await updateContract(input.id, {
          name: input.name,
          preposition: input.preposition,
          alertEmail: input.alertEmail || null,
          alertWhatsapp: input.alertWhatsapp || null,
        });
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "contract.update",
          targetType: "contract",
          targetId: input.id,
          targetName: input.name,
        });
        return { success: true } as const;
      }),

    // Move para a lixeira — reversível pelo restore.
    delete: masterAdminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getContractById(input.id);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
        }
        await softDeleteContract(input.id);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "contract.delete",
          targetType: "contract",
          targetId: input.id,
          targetName: existing.name,
        });
        return { success: true } as const;
      }),

    restore: masterAdminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getContractById(input.id);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
        }
        await restoreContract(input.id);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "contract.restore",
          targetType: "contract",
          targetId: input.id,
          targetName: existing.name,
        });
        return { success: true } as const;
      }),

    // Quantos colaboradores/contas/documentos ainda usam este contrato —
    // exibido na tela antes de permitir a exclusão definitiva.
    usage: masterAdminProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const existing = await getContractById(input.id);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
        }
        return countContractUsage(existing.slug);
      }),

    permanentDelete: masterAdminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getContractById(input.id);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
        }
        if (!existing.deleted) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Mova o contrato para a lixeira antes de excluir definitivamente.",
          });
        }
        const usage = await countContractUsage(existing.slug);
        if (usage.total > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Ainda há ${usage.total} registro(s) usando este contrato (${usage.employees} colaborador(es), ${usage.admins} conta(s), ${usage.documents} documento(s)). Reatribua-os antes de excluir definitivamente.`,
          });
        }
        await permanentlyDeleteContract(input.id);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "contract.permanentDelete",
          targetType: "contract",
          targetId: input.id,
          targetName: existing.name,
        });
        return { success: true } as const;
      }),

    // Panorama comparativo entre contratos — colaboradores e situação dos
    // treinamentos lado a lado, só para o administrador principal.
    overview: masterAdminProcedure.query(async () => {
      return getContractsOverview();
    }),

    // Campos personalizados por contrato.
    fields: router({
      // Qualquer pessoa logada — é o que monta o formulário de colaborador.
      // Usa o contrato da sessão por padrão (o próprio do usuário, ou o que
      // o admin escolheu no cabeçalho); o administrador pode informar
      // explicitamente outro contrato (usado na tela de Contratos, ao
      // gerenciar campos de um contrato diferente do que está ativo).
      list: requirePermission('viewEmployees')
        .input(z.object({ contractSlug: z.string().optional() }).optional())
        .query(async ({ input, ctx }) => {
          const slug = ctx.siteRole === "admin" && input?.contractSlug ? input.contractSlug : ctx.siteContract;
          if (!slug) return [];
          return listCustomFields(slug);
        }),

      // Gerenciar quais campos existem — só o administrador principal.
      create: masterAdminProcedure
        .input(
          z.object({
            contractSlug: z.string().min(1),
            label: z.string().trim().min(2, "Informe o nome do campo").max(120),
            fieldType: z.enum(["text", "number", "date"]),
          })
        )
        .mutation(async ({ input, ctx }) => {
          const field = await createCustomField({ ...input, id: uuidv4() });
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "contract.fieldCreate",
            targetType: "contractField",
            targetId: field.id,
            targetName: `${input.contractSlug}: ${field.label}`,
          });
          return field;
        }),

      delete: masterAdminProcedure
        .input(z.object({ id: z.string(), contractSlug: z.string() }))
        .mutation(async ({ input, ctx }) => {
          await deleteCustomField(input.id, input.contractSlug);
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "contract.fieldDelete",
            targetType: "contractField",
            targetId: input.id,
          });
          return { success: true } as const;
        }),
    }),
  }),

  // Catálogo de funções e tipos de treinamento — compartilhado entre
  // contratos. Só o administrador principal cadastra/edita/exclui; qualquer
  // pessoa logada pode listar (é o que preenche os menus do formulário).
  roles: router({
    list: requirePermission('viewEmployees').query(async () => {
      return listCustomRoles();
    }),

    create: masterAdminProcedure
      .input(z.object({ name: z.string().trim().min(2, "Informe o nome da função").max(120) }))
      .mutation(async ({ input, ctx }) => {
        const role = await createCustomRole(uuidv4(), input.name);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "role.create",
          targetType: "role",
          targetId: role.id,
          targetName: role.name,
        });
        return role;
      }),

    delete: masterAdminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await deleteCustomRole(input.id);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "role.delete",
          targetType: "role",
          targetId: input.id,
        });
        return { success: true } as const;
      }),
  }),

  trainingTypes: router({
    list: requirePermission('viewEmployees').query(async () => {
      return listTrainingTypes();
    }),

    create: masterAdminProcedure
      .input(
        z.object({
          name: z.string().trim().min(2, "Informe o nome do treinamento").max(150),
          validityMonths: z.number().int().min(1, "A validade deve ser de pelo menos 1 mês").max(120),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const type = await createTrainingType(uuidv4(), input.name, input.validityMonths);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "trainingType.create",
          targetType: "trainingType",
          targetId: type.id,
          targetName: `${type.name} (${type.validityMonths} meses)`,
        });
        return type;
      }),

    update: masterAdminProcedure
      .input(
        z.object({
          id: z.string(),
          name: z.string().trim().min(2).max(150),
          validityMonths: z.number().int().min(1).max(120),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await updateTrainingType(input.id, input.name, input.validityMonths);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "trainingType.update",
          targetType: "trainingType",
          targetId: input.id,
          targetName: `${input.name} (${input.validityMonths} meses)`,
        });
        return { success: true } as const;
      }),

    delete: masterAdminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await deleteTrainingType(input.id);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "trainingType.delete",
          targetType: "trainingType",
          targetId: input.id,
        });
        return { success: true } as const;
      }),
  }),

  // Almoxarifado — itens em estoque e movimentações, por contrato.
  warehouse: router({
    listItems: requirePermission('viewWarehouse').query(async ({ ctx }) => {
      if (!ctx.siteContract) return [];
      return listWarehouseItems(ctx.siteContract);
    }),

    listMovements: requirePermission('viewWarehouse').query(async ({ ctx }) => {
      if (!ctx.siteContract) return [];
      return listWarehouseMovements(ctx.siteContract);
    }),

    listPriceHistory: requirePermission('viewWarehouse').query(async ({ ctx }) => {
      if (!ctx.siteContract) return [];
      return getPriceHistory(ctx.siteContract);
    }),

    upsertItem: requirePermission('manageWarehouse')
      .input(
        z.object({
          id: z.string().optional(),
          code: z.string().trim().min(1, "Informe o código"),
          name: z.string().trim().min(1, "Informe o nome"),
          type: z.enum(WAREHOUSE_ITEM_TYPES),
          unit: z.string().trim().min(1).default("un"),
          quantity: z.number().min(0),
          ca: z.string().nullish(),
          dataValidadeCa: z.string().nullish(),
          patrimonio: z.string().nullish(),
          estoqueMinimo: z.number().min(0),
          localizacao: z.string().nullish(),
          fornecedor: z.string().nullish(),
          precoUnitario: z.number().min(0),
          dataValidade: z.string().nullish(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Escolha um contrato no cabeçalho antes de cadastrar um item.",
          });
        }
        if (input.type === "epi" && !input.ca) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Para EPI é obrigatório informar o CA." });
        }
        if (input.type === "ferramenta" && !input.patrimonio) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Para Ferramenta é obrigatório informar o Patrimônio.",
          });
        }

        if (input.id) {
          const existing = await getWarehouseItemById(input.id);
          if (!existing || existing.contract !== ctx.siteContract) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado." });
          }
          await updateWarehouseItem(input.id, ctx.siteContract, input);
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "warehouse.itemUpdate",
            targetType: "warehouseItem",
            targetId: input.id,
            targetName: input.name,
          });
          return (await getWarehouseItemById(input.id))!;
        }

        const created = await createWarehouseItem(uuidv4(), ctx.siteContract, input);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "warehouse.itemCreate",
          targetType: "warehouseItem",
          targetId: created.id,
          targetName: created.name,
        });
        return created;
      }),

    deleteItem: requirePermission('manageWarehouse')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        await deleteWarehouseItem(input.id, ctx.siteContract);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "warehouse.itemDelete",
          targetType: "warehouseItem",
          targetId: input.id,
        });
        return { success: true } as const;
      }),

    createMovement: requirePermission('manageWarehouse')
      .input(
        z.object({
          itemId: z.string(),
          movementType: z.enum(WAREHOUSE_MOVEMENT_TYPES),
          quantity: z.number().positive("Informe uma quantidade maior que zero"),
          destination: z.string().nullish(),
          responsible: z.string().nullish(),
          invoiceNumber: z.string().nullish(),
          purchaseOrder: z.string().nullish(),
          supplier: z.string().nullish(),
          unitPrice: z.number().nullish(),
          notes: z.string().nullish(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        try {
          const movement = await createWarehouseMovement(uuidv4(), ctx.siteContract, input);
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: movement.movementType === "entrada" ? "warehouse.stockIn" : "warehouse.stockOut",
            targetType: "warehouseMovement",
            targetId: movement.id,
            targetName: `${movement.itemName} (${movement.quantity})`,
          });
          return movement;
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Erro ao registrar movimentação.",
          });
        }
      }),

    // Entrega e devolução de ferramentas/EPIs — usa o colaborador que já
    // existe no sistema, sem cadastro de funcionário duplicado.
    listDeliveries: requirePermission('viewWarehouse').query(async ({ ctx }) => {
      if (!ctx.siteContract) return [];
      return listToolDeliveries(ctx.siteContract);
    }),

    listActiveDeliveriesForEmployee: requirePermission('viewWarehouse')
      .input(z.object({ employeeId: z.string() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.siteContract) return [];
        return listActiveDeliveriesForEmployee(ctx.siteContract, input.employeeId);
      }),

    deliverItem: requirePermission('manageWarehouse')
      .input(
        z.object({
          employeeId: z.string(),
          employeeName: z.string(),
          itemId: z.string(),
          quantity: z.number().positive("Informe uma quantidade maior que zero"),
          obs: z.string().nullish(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        try {
          const delivery = await createToolDelivery(uuidv4(), ctx.siteContract, {
            ...input,
            deliveredBy: ctx.siteAdminUsername,
          });
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "warehouse.toolDeliver",
            targetType: "toolDelivery",
            targetId: delivery.id,
            targetName: `${delivery.itemName} → ${delivery.employeeName}`,
          });
          return delivery;
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Erro ao registrar entrega.",
          });
        }
      }),

    returnItem: requirePermission('manageWarehouse')
      .input(z.object({ id: z.string(), returnObs: z.string().nullish() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        try {
          const delivery = await returnToolDelivery(input.id, ctx.siteContract, input.returnObs);
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "warehouse.toolReturn",
            targetType: "toolDelivery",
            targetId: delivery.id,
            targetName: `${delivery.itemName} ← ${delivery.employeeName}`,
          });
          return delivery;
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Erro ao registrar devolução.",
          });
        }
      }),

    // Solicitações de compra — podem ter vários itens numa única solicitação.
    listPurchaseRequests: requirePermission('viewWarehouse').query(async ({ ctx }) => {
      if (!ctx.siteContract) return [];
      return listPurchaseRequests(ctx.siteContract);
    }),

    createPurchaseRequest: requirePermission('manageWarehouse')
      .input(
        z.object({
          items: z
            .array(
              z.object({
                name: z.string().trim().min(1),
                quantity: z.number().positive(),
                fornecedor: z.string().nullish(),
                priority: z.enum(PURCHASE_REQUEST_PRIORITIES),
              })
            )
            .min(1, "Adicione pelo menos um item"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const created = await createPurchaseRequest(uuidv4(), ctx.siteContract, input.items, ctx.siteAdminUsername);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "warehouse.purchaseRequestCreate",
          targetType: "purchaseRequest",
          targetId: created.id,
          targetName: created.registro,
        });
        return created;
      }),

    updatePurchaseRequestStatus: requirePermission('manageWarehouse')
      .input(z.object({ id: z.string(), status: z.enum(PURCHASE_REQUEST_STATUSES) }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        await updatePurchaseRequestStatus(input.id, ctx.siteContract, input.status);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "warehouse.purchaseRequestUpdate",
          targetType: "purchaseRequest",
          targetId: input.id,
          details: `status → ${input.status}`,
        });
        return { success: true } as const;
      }),

    cancelPurchaseRequest: requirePermission('manageWarehouse')
      .input(z.object({ id: z.string(), reason: z.string().trim().min(1, "Informe o motivo") }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        await cancelPurchaseRequest(input.id, ctx.siteContract, input.reason);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "warehouse.purchaseRequestUpdate",
          targetType: "purchaseRequest",
          targetId: input.id,
          details: `cancelada: ${input.reason}`,
        });
        return { success: true } as const;
      }),

    deletePurchaseRequest: requirePermission('manageWarehouse')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        await deletePurchaseRequest(input.id, ctx.siteContract);
        return { success: true } as const;
      }),

    // Migração única dos dados do almoxarifado antigo (Supabase) — só o
    // administrador principal, e só roda se o almoxarifado deste contrato
    // ainda estiver vazio (evita duplicar dado migrando duas vezes).
    migrateFromSupabase: masterAdminProcedure
      .input(
        z.object({
          supabaseUrl: z.string().url(),
          supabaseServiceKey: z.string().min(20),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Escolha o contrato de destino no cabeçalho antes de migrar.",
          });
        }
        try {
          const result = await migrateWarehouseFromSupabase(
            { url: input.supabaseUrl, serviceKey: input.supabaseServiceKey },
            ctx.siteContract
          );
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "warehouse.migration",
            details: `${result.items} itens, ${result.movements} movimentações, ${result.deliveries} entregas, ${result.purchaseRequests} solicitações`,
          });
          return result;
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Erro na migração.",
          });
        }
      }),
  }),

  employees: router({
    // Nomes de treinamento já cadastrados, para sugerir ao digitar um novo e
    // evitar variações do mesmo treinamento espalhadas pelo sistema.
    trainingNames: requirePermission('viewEmployees').query(async ({ ctx }) => {
      return getDistinctTrainingNames(ctx.siteContract ?? undefined);
    }),

    // Renovar o mesmo treinamento para vários colaboradores de uma vez —
    // útil quando uma turma inteira faz a reciclagem no mesmo dia. Para cada
    // colaborador: se ele já tinha um treinamento com esse nome, atualiza as
    // datas; senão, cadastra um novo.
    renewTrainingBulk: requirePermission('editEmployees')
      .input(
        z.object({
          employeeIds: z.array(z.string()).min(1),
          trainingName: z.string().trim().min(1),
          completionDate: z.string(),
          expirationDate: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        let updated = 0;
        let created = 0;

        for (const employeeId of input.employeeIds) {
          const existingTrainings = await getTrainingsByEmployeeId(employeeId);
          const match = existingTrainings.find(
            (t) => t.name.trim().toLowerCase() === input.trainingName.trim().toLowerCase()
          );

          await upsertTraining({
            id: match?.id ?? uuidv4(),
            employeeId,
            name: input.trainingName.trim(),
            completionDate: input.completionDate,
            expirationDate: input.expirationDate,
          });

          if (match) updated++;
          else created++;
        }

        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "training.renewBulk",
          details: `"${input.trainingName}" — ${updated} renovado(s), ${created} novo(s), de ${input.employeeIds.length} colaborador(es)`,
        });

        return { updated, created, total: input.employeeIds.length } as const;
      }),

    // Reatribuir colaborador para outro contrato — SOMENTE o administrador
    // principal. Não é uma edição normal: move o registro inteiro para outra
    // "gaveta", então fica separado do upsertOne e sempre exige o admin
    // estar trabalhando naquele contrato específico (não em "Todos").
    changeContract: masterAdminProcedure
      .input(z.object({ employeeId: z.string(), contractSlug: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const contract = await getContractBySlug(input.contractSlug);
        if (!contract || contract.deleted) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato inválido ou excluído." });
        }
        await setEmployeeContract(input.employeeId, input.contractSlug);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "employee.changeContract",
          targetType: "employee",
          targetId: input.employeeId,
          details: `movido para ${contract.name}`,
        });
        return { success: true } as const;
      }),

    upsertOne: requirePermission('editEmployees')
      .input(
        z.object({
          id: z.string(),
          name: z.string(),
          // .nullish() (não .optional()): mesmo motivo do sync — essas
          // colunas são anuláveis no banco, então um valor já salvo pode
          // voltar como null (não undefined) e derrubar a validação.
          registration: z.string().nullish(),
          educationLevel: z.string().nullish(),
          age: z.number().nullish(),
          birthDate: z.string().nullish(),
          role: z.string(),
          phone: z.string().nullish(),
          customFields: z.record(z.string(), z.string()).optional(),
          trainings: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              completionDate: z.string(),
              // Opcional: a data de vencimento é sempre calculada aqui a
              // partir da validade cadastrada no catálogo de treinamentos
              // (data de realização + X meses) — só é usada como reserva
              // quando o treinamento não bate com nenhum tipo do catálogo
              // (nome livre, de antes dessa mudança).
              expirationDate: z.string().optional(),
            })
          ),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.siteRole === "admin" && !ctx.siteContract) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Escolha um contrato no cabeçalho antes de cadastrar.",
          });
        }

        try {
            await upsertEmployee({
              id: input.id,
              name: input.name,
              registration: input.registration,
              educationLevel: input.educationLevel,
              age: input.age,
              birthDate: input.birthDate,
              role: input.role,
              phone: input.phone,
              customFields: input.customFields ? JSON.stringify(input.customFields) : undefined,
              // O contrato vem sempre da conta que está cadastrando — não é
              // escolhido no formulário, para não haver como errar nem burlar.
              contract: ctx.siteContract ?? DEFAULT_CONTRACT_SLUG,
            });

          const currentTrainingIds = input.trainings.map(t => t.id);
          await deleteTrainingsExcept(input.id, currentTrainingIds);

          for (const training of input.trainings) {
            // A validade vem sempre do catálogo, nunca do que o cliente
            // mandar — fecha qualquer brecha de manipulação e garante que
            // todo mundo usando o mesmo tipo de treinamento tenha a mesma
            // regra de vencimento.
            const trainingType = await getTrainingTypeByName(training.name);
            const expirationDate = trainingType
              ? addMonthsToDate(training.completionDate, trainingType.validityMonths)
              : training.expirationDate || training.completionDate;

            await upsertTraining({
              id: training.id,
              employeeId: input.id,
              name: training.name,
              completionDate: training.completionDate,
              expirationDate,
            });
          }

          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "employee.update",
            targetType: "employee",
            targetId: input.id,
            targetName: input.name,
            details: `${input.trainings.length} treinamento(s)`,
          });

          return { success: true };
        } catch (error) {
          console.error("UpsertOne error:", error);
          throw error;
        }
      }),

    // Demitir/readmitir: tira o colaborador das listas e contagens sem apagar
    // nada. Usa a permissão de edição, não a de exclusão, porque é reversível.
    setDismissed: requirePermission('editEmployees')
      .input(z.object({ id: z.string(), dismissed: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        await setEmployeeDismissed(input.id, input.dismissed);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: input.dismissed ? "employee.dismiss" : "employee.restore",
          targetType: "employee",
          targetId: input.id,
        });
        return { success: true } as const;
      }),

    delete: requirePermission('deleteEmployees')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          await deleteEmployee(input.id);
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "employee.delete",
            targetType: "employee",
            targetId: input.id,
          });
          return { success: true };
        } catch (error) {
          console.error("Delete employee error:", error);
          throw error;
        }
      }),
    sync: requirePermission('editEmployees')
      .input(
        z.object({
          employees: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              // .nullish() (não .optional()): esses campos são colunas
              // anuláveis no banco. Um colaborador já existente sem, por
              // exemplo, data de nascimento cadastrada volta do banco como
              // null (não undefined) — e null derrubava a validação e
              // travava a importação do contrato inteiro.
              registration: z.string().nullish(),
              educationLevel: z.string().nullish(),
                age: z.number().nullish(),
                birthDate: z.string().nullish(),
                role: z.string(),
              phone: z.string().nullish(),
              trainings: z.array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                  // Opcionais: uma data quebrada ou vazia num único
                  // treinamento não pode reprovar a validação do lote
                  // inteiro e travar a importação do contrato.
                  completionDate: z.string().optional(),
                  expirationDate: z.string().optional(),
                })
              ),
            })
          ),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          if (ctx.siteRole === "admin" && !ctx.siteContract) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Escolha um contrato no cabeçalho antes de importar a planilha.",
            });
          }
          const contract = ctx.siteContract ?? DEFAULT_CONTRACT_SLUG;

          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "employee.import",
            details: `${input.employees.length} colaborador(es) sincronizado(s)`,
          });

          const results = { updated: 0, failed: [] as { name: string; error: string }[] };

          for (const employee of input.employees) {
            try {
              // Upsert employee
              await upsertEmployee({
                id: employee.id,
                name: employee.name,
                registration: employee.registration,
                educationLevel: employee.educationLevel,
                age: employee.age,
                birthDate: employee.birthDate,
                role: employee.role,
                phone: employee.phone,
                contract,
              });

              // Upsert trainings
              const currentTrainingIds = employee.trainings.map(t => t.id);

              // First, remove trainings that are no longer in the list
              await deleteTrainingsExcept(employee.id, currentTrainingIds);

              const todayIso = new Date().toISOString().slice(0, 10);
              for (const training of employee.trainings) {
                const completionDate = training.completionDate || todayIso;
                // Mesma regra do upsertOne: a validade vem do catálogo, não
                // do que a planilha trouxer — a coluna "Data de Vencimento"
                // do modelo de importação é ignorada quando o nome do
                // treinamento bate com um tipo cadastrado.
                const trainingType = await getTrainingTypeByName(training.name);
                const expirationDate = trainingType
                  ? addMonthsToDate(completionDate, trainingType.validityMonths)
                  : training.expirationDate || todayIso;

                await upsertTraining({
                  id: training.id,
                  employeeId: employee.id,
                  name: training.name,
                  completionDate,
                  expirationDate,
                });
              }
              results.updated++;
            } catch (employeeError) {
              // Um colaborador com problema (ex: dado inválido) não pode travar
              // todo mundo depois dele na lista — registra e segue para o
              // próximo, devolvendo no final quem falhou e por quê.
              console.error(`[sync] Falha ao salvar "${employee.name}":`, employeeError);
              results.failed.push({
                name: employee.name,
                error: employeeError instanceof Error ? employeeError.message : String(employeeError),
              });
            }
          }
          return {
            success: true,
            count: input.employees.length,
            updated: results.updated,
            failed: results.failed,
          };
        } catch (error) {
          console.error("Sync error:", error);
          throw error;
        }
      }),
    list: requirePermission('viewEmployees').query(async ({ ctx }) => {
      // Três operações no total, independente do número de colaboradores:
      // 1 consulta de colaboradores, 1 de treinamentos e 1 listagem de fotos.
      // Antes eram 2 chamadas POR colaborador (uma ao banco e uma de rede ao
      // Supabase), o que deixava a abertura da lista muito lenta.
      const [employeeList, trainingsByEmployee, photoUrls] = await Promise.all([
        // Usuário comum recebe só o próprio contrato; administrador recebe tudo.
        getAllEmployees(ctx.siteContract ?? undefined),
        getTrainingsGroupedByEmployee(),
        getAllPhotoUrls(),
      ]);

      return employeeList.map((emp) => ({
        ...emp,
        photoUrl: photoUrls.get(emp.id) ?? null,
        trainings: trainingsByEmployee.get(emp.id) ?? [],
        customFields: parseCustomFieldValues(emp.customFields),
      }));
    }),

    uploadPhoto: requirePermission('editEmployees')
      .input(
        z.object({
          employeeId: z.string(),
          fileData: z.string(),
          mimeType: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const fileBuffer = Buffer.from(input.fileData, "base64");

          const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB
          if (fileBuffer.length > MAX_PHOTO_BYTES) {
            throw new TRPCError({
              code: "PAYLOAD_TOO_LARGE",
              message: "A foto excede o limite de 5MB.",
            });
          }

          const ALLOWED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
          if (input.mimeType && !ALLOWED_PHOTO_MIME_TYPES.includes(input.mimeType)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Tipo de imagem não suportado. Permitidos: JPG, PNG, WEBP.",
            });
          }

          const uploadResult = await uploadPhotoToSupabase(
            fileBuffer,
            input.employeeId,
            input.mimeType || "image/jpeg"
          );
          return { url: uploadResult.url };
        } catch (error) {
          console.error("Photo upload error:", error);
          throw error;
        }
      }),
  }),

  trainings: router({
    delete: requirePermission('editEmployees')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          await deleteTraining(input.id);
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "training.delete",
            targetType: "training",
            targetId: input.id,
          });
          return { success: true };
        } catch (error) {
          console.error("Delete training error:", error);
          throw error;
        }
      }),
  }),

  emailHistory: router({
    list: requirePermission('viewEmployees').query(async () => {
      const db = await getDb();
      if (!db) {
        return [];
      }

      try {
        const history = await db
          .select({
            id: emailNotifications.id,
            trainingId: emailNotifications.trainingId,
            employeeId: emailNotifications.employeeId,
            lastSentAt: emailNotifications.lastSentAt,
            createdAt: emailNotifications.createdAt,
            trainingName: trainings.name,
            employeeName: employees.name,
            expirationDate: trainings.expirationDate,
          })
          .from(emailNotifications)
          .leftJoin(trainings, eq(emailNotifications.trainingId, trainings.id))
          .leftJoin(employees, eq(emailNotifications.employeeId, employees.id));

        // Sort by lastSentAt descending (most recent first)
        return history.sort((a, b) => {
          const dateA = new Date(a.lastSentAt).getTime();
          const dateB = new Date(b.lastSentAt).getTime();
          return dateB - dateA;
        });
      } catch (error) {
        console.error("Error fetching email history:", error);
        return [];
      }
    }),
  }),

  certificates: router({
    upload: requirePermission('manageCertificates')
      .input(
        z.object({
          trainingId: z.string(),
          employeeId: z.string(),
          fileName: z.string(),
          fileData: z.string().or(z.instanceof(Buffer)),
          mimeType: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const fileBuffer = typeof input.fileData === "string" 
            ? Buffer.from(input.fileData, "base64")
            : input.fileData;

          // Reforça no servidor os mesmos limites já validados no client
          // (tamanho máximo e tipos permitidos), já que o client pode ser
          // contornado por quem chamar a API diretamente.
          const MAX_CERTIFICATE_BYTES = 10 * 1024 * 1024; // 10MB
          if (fileBuffer.length > MAX_CERTIFICATE_BYTES) {
            throw new TRPCError({
              code: "PAYLOAD_TOO_LARGE",
              message: "O arquivo excede o limite de 10MB.",
            });
          }

          const ALLOWED_CERTIFICATE_MIME_TYPES = [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ];
          if (input.mimeType && !ALLOWED_CERTIFICATE_MIME_TYPES.includes(input.mimeType)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Tipo de arquivo não suportado. Permitidos: PDF, JPG, PNG, DOC, DOCX.",
            });
          }

          // Upload to Supabase
          const uploadResult = await uploadCertificateToSupabase(
            fileBuffer,
            input.fileName,
            input.mimeType || "application/octet-stream"
          );

          // Save to database
          const certificate = await uploadCertificate({
            id: uuidv4(),
            trainingId: input.trainingId,
            employeeId: input.employeeId,
            fileName: input.fileName,
            fileUrl: uploadResult.url,
            fileSize: uploadResult.size,
            mimeType: input.mimeType || "application/octet-stream",
          });

          return certificate;
        } catch (error) {
          console.error("Certificate upload error:", error);
          throw error;
        }
      }),

    getByTraining: requirePermission('viewCertificates')
      .input(z.object({ trainingId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await getCertificatesByTrainingId(input.trainingId);
        } catch (error) {
          console.error("Error fetching certificates by training:", error);
          return [];
        }
      }),

    getByEmployee: requirePermission('viewCertificates')
      .input(z.object({ employeeId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await getCertificatesByEmployeeId(input.employeeId);
        } catch (error) {
          console.error("Error fetching certificates by employee:", error);
          return [];
        }
      }),

    delete: requirePermission('manageCertificates')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const certificate = await getCertificateById(input.id);
          if (!certificate) {
            throw new Error("Certificate not found");
          }

          // Delete from Supabase
          await deleteCertificateFromSupabase(certificate.fileUrl);

          // Delete from database
          await deleteCertificate(input.id);

          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "certificate.delete",
            targetType: "certificate",
            targetId: input.id,
            targetName: certificate.fileName,
          });

          return { success: true };
        } catch (error) {
          console.error("Certificate deletion error:", error);
          throw error;
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
