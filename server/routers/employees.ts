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


export const employeesRouter = router({
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
          admissionDate: z.string().nullish(),
          role: z.string(),
          phone: z.string().nullish(),
          gerencia: z.string().nullish(),
          cnhNumero: z.string().nullish(),
          cnhValidade: z.string().nullish(),
          cnhCategoria: z.string().nullish(),
          cpf: z.string().nullish(),
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
              admissionDate: input.admissionDate,
              role: input.role,
              phone: input.phone,
              gerencia: input.gerencia,
              cnhNumero: input.cnhNumero,
              cnhValidade: input.cnhValidade,
              cnhCategoria: input.cnhCategoria,
              cpf: input.cpf,
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
  });
