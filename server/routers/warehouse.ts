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


export const warehouseRouter = router({
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
          marca: z.string().nullish(),
          modelo: z.string().nullish(),
          categoria: z.string().nullish(),
          observacoes: z.string().nullish(),
          ca: z.string().nullish(),
          dataValidadeCa: z.string().nullish(),
          tamanho: z.string().nullish(),
          periodicidadeTrocaMeses: z.number().min(0).nullish(),
          patrimonio: z.string().nullish(),
          numeroSerie: z.string().nullish(),
          dataAquisicao: z.string().nullish(),
          estadoConservacao: z.enum(WAREHOUSE_ITEM_CONDITIONS).nullish(),
          estoqueMinimo: z.number().min(0),
          estoqueMaximo: z.number().min(0).nullish(),
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
        if (input.estoqueMaximo != null && input.estoqueMaximo < input.estoqueMinimo) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O estoque máximo não pode ser menor que o estoque mínimo.",
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
  });
