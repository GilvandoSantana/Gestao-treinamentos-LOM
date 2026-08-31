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


export const emailHistoryRouter = router({
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
  });
