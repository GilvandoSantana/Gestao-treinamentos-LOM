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


export const invoicesRouter = router({
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
  });
