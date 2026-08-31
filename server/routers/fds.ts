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


export const fdsRouter = router({
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
  });
