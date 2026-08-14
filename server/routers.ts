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
  deleteFolderRecursive,
  createFileRecord,
  deleteFileRecord,
} from "./db-cloud";
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

    deleteFolder: requirePermission('manageCloud')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const fileUrls = await deleteFolderRecursive(input.id, ctx.siteContract);
        for (const url of fileUrls) {
          await deleteCloudFileFromSupabase(url);
        }
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.folderDelete",
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
        const MAX_CLOUD_BYTES = 20 * 1024 * 1024;
        if (fileBuffer.length > MAX_CLOUD_BYTES) {
          throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "O arquivo excede o limite de 20MB." });
        }

        // Espelha as pastas do sistema no caminho salvo no Supabase, para o
        // arquivo aparecer organizado também olhando direto lá (não só pela
        // navegação do site) — ex: cloud/lom/contratos/assinados/arquivo.pdf
        const folderChain = input.folderId ? await getFolderPath(input.folderId) : [];
        const folderPath = folderChain.map((f) => slugifyContract(f.name)).join("/");

        const upload = await uploadCloudFileToSupabase(
          fileBuffer,
          input.fileName,
          input.mimeType,
          ctx.siteContract,
          folderPath
        );

        const file = await createFileRecord({
          id: uuidv4(),
          contractSlug: ctx.siteContract,
          folderId: input.folderId,
          name: input.name,
          fileUrl: upload.url,
          fileSize: fileBuffer.length,
          mimeType: input.mimeType,
          uploadedBy: ctx.siteAdminUsername,
        });

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

    deleteFile: requirePermission('manageCloud')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const file = await deleteFileRecord(input.id, ctx.siteContract);
        if (file) await deleteCloudFileFromSupabase(file.fileUrl);
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
          registration: z.string().optional(),
          educationLevel: z.string().optional(),
          age: z.number().optional(),
          birthDate: z.string().optional(),
          role: z.string(),
          phone: z.string().optional(),
          customFields: z.record(z.string(), z.string()).optional(),
          trainings: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              completionDate: z.string(),
              expirationDate: z.string(),
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
            await upsertTraining({
              id: training.id,
              employeeId: input.id,
              name: training.name,
              completionDate: training.completionDate,
              expirationDate: training.expirationDate,
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
              registration: z.string().optional(),
              educationLevel: z.string().optional(),
                age: z.number().optional(),
                birthDate: z.string().optional(),
                role: z.string(),
              phone: z.string().optional(),
              trainings: z.array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                  completionDate: z.string(),
                  expirationDate: z.string(),
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

          for (const employee of input.employees) {
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

            for (const training of employee.trainings) {
              await upsertTraining({
                id: training.id,
                employeeId: employee.id,
                name: training.name,
                completionDate: training.completionDate,
                expirationDate: training.expirationDate,
              });
            }
          }
          return { success: true, count: input.employees.length };
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
