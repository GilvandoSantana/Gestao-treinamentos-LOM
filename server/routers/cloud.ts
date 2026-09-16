import { isSafeCloudName } from "../../shared/cloud-path";
import { v4 as uuidv4 } from "uuid";
import { organizationAdminProcedure, masterAdminProcedure, requirePermission, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { deleteCloudFileFromSupabase } from "../supabase-storage";
import { listSetores } from "../db-admins";
import { slugifyContract } from "@shared/contracts";
import {
  addGroupMember,
  adjustStorageUsed,
  reserveStorageCapacity,
  releaseStorageReservation,
  canAccessFile,
  canAccessFolder,
  createFileRecord,
  createFolder,
  getFolderByNameInParent,
  createGroup,
  createShare,
  deleteFolderRecursive,
  deleteGroup,
  getFileById,
  getFolderPath,
  getStorageInfo,
  getStorageByTopFolder,
  getVersionContentInfo,
  isLockActive,
  listEffectiveGroupMembers,
  listFavorites,
  listFileVersions,
  listFilesNeedingR2Migration,
  listFolderContents,
  getFullFolderTree,
  listGroupMembers,
  listGroups,
  listRecentFiles,
  listSharedByMe,
  listSharedWithMe,
  listTrash,
  lockFile,
  moveFile,
  moveFolder,
  permanentlyDeleteFile,
  pointFileToR2,
  recalculateStorageUsed,
  removeGroupMember,
  renameFile,
  renameFolder,
  restoreFile,
  restoreFileVersion,
  restoreFolder,
  revokeShare,
  getShareById,
  searchFiles,
  setStorageLimit,
  softDeleteFile,
  toggleFavorite,
  unlockFile,
  updateGroupAutoSetor,
  uploadNewVersion,
} from "../db-cloud";
import { findDuplicateFolderGroups, mergeFolderInto } from "../db-cloud-dedup";
import { deleteFromR2, getR2DownloadUrl, getR2PreviewUrl, isR2Configured, uploadToR2 } from "../r2-storage";
import { logActivity } from "../db-activity";

export const cloudRouter = router({
    list: requirePermission('viewCloud')
      .input(z.object({ folderId: z.string().nullable() }).optional())
      .query(async ({ input, ctx }) => {
        if (!ctx.siteContract) return { folders: [], files: [], path: [] };
        const folderId = input?.folderId ?? null;
        const accessCtx = { username: ctx.siteAdminUsername ?? '', isMasterAdmin: ctx.siteRole === 'admin' };

        if (folderId) {
          const allowed = await canAccessFolder(ctx.siteContract, folderId, accessCtx);
          if (!allowed) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Você não tem permissão para acessar esta pasta.",
            });
          }
        }

        const [contents, path] = await Promise.all([
          listFolderContents(ctx.siteContract, folderId, accessCtx),
          folderId ? getFolderPath(folderId) : Promise.resolve([]),
        ]);
        return { ...contents, path };
      }),

    // Árvore inteira (todas as pastas e arquivos) de uma vez só — usada
    // pelo programa de sincronização (Windows), que antes precisava de
    // uma chamada de rede POR PASTA pra montar essa mesma lista (lento
    // pra contratos com muitas pastas). Aqui é uma consulta só, resolvida
    // inteira do lado do servidor.
    getFullTree: requirePermission('viewCloud').query(async ({ ctx }) => {
      if (!ctx.siteContract) return { folders: [], files: [] };
      const accessCtx = { username: ctx.siteAdminUsername ?? '', isMasterAdmin: ctx.siteRole === 'admin' };
      return getFullFolderTree(ctx.siteContract, accessCtx);
    }),

    // Espaço usado/limite do contrato — mostrado no topo da Nuvem.
    storageInfo: requirePermission('viewCloud').query(async ({ ctx }) => {
      if (!ctx.siteContract) return { limitBytes: 0, usedBytes: 0 };
      return getStorageInfo(ctx.siteContract);
    }),

    // Ideia 6 do Gilvando (indicador de espaço por pasta): quais pastas
    // de nível raiz estão ocupando mais espaço. Administrador da
    // organização (não conta comum) — soma o tamanho de TODO arquivo,
    // mesmo dentro de área restrita que uma conta comum não teria acesso
    // pra ver.
    storageByFolder: organizationAdminProcedure.query(async ({ ctx }) => {
      if (!ctx.siteContract) return [];
      const accessCtx = { username: ctx.siteAdminUsername ?? '', isMasterAdmin: true };
      return getStorageByTopFolder(ctx.siteContract, accessCtx);
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
      .input(
        z.object({
          parentId: z.string().nullable(),
          name: z.string().trim().min(1).max(255).refine(isSafeCloudName, "Nome inválido para sincronização Windows"),
          restrictedToGroupId: z.string().nullish(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Escolha um contrato no cabeçalho antes de criar uma pasta.",
          });
        }
        const accessCtx = { username: ctx.siteAdminUsername ?? '', permission: 'edit' as const, isMasterAdmin: ctx.siteRole === 'admin' };
        if (input.parentId) {
          const allowed = await canAccessFolder(ctx.siteContract, input.parentId, accessCtx);
          if (!allowed) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta pasta." });
          }
        }

        // Idempotente de propósito (achado real reportado pelo Gilvando,
        // 11/09: o programa de sincronização duplicava pasta inteira ao
        // sincronizar) — se já existe uma pasta ativa com esse nome no
        // mesmo lugar, devolve ela em vez de criar outra igual. Cobre
        // tanto o clique repetido de "Nova pasta" quanto qualquer chamada
        // automática (como o programa de sincronização) que tente criar
        // de novo algo que já existe.
        const existing = await getFolderByNameInParent(ctx.siteContract, input.parentId, input.name);
        if (existing) {
          return { ...existing, alreadyExisted: true } as const;
        }

        const folder = await createFolder({
          id: uuidv4(),
          contractSlug: ctx.siteContract,
          parentId: input.parentId,
          name: input.name,
          createdBy: ctx.siteAdminUsername,
          restrictedToGroupId: input.restrictedToGroupId,
        });
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.folderCreate",
          targetType: "cloudFolder",
          targetId: folder.id,
          targetName: folder.name,
        });
        return { ...folder, alreadyExisted: false } as const;
      }),

    renameFolder: requirePermission('manageCloud')
      .input(z.object({ id: z.string(), name: z.string().trim().min(1).max(255).refine(isSafeCloudName, "Nome inválido para sincronização Windows") }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const accessCtx = { username: ctx.siteAdminUsername ?? '', permission: 'edit' as const, isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFolder(ctx.siteContract, input.id, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta pasta." });
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
        const accessCtx = { includeTrash: true, username: ctx.siteAdminUsername ?? '', permission: 'edit' as const, isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFolder(ctx.siteContract, input.id, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta pasta." });
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
        const accessCtx = { includeTrash: true, username: ctx.siteAdminUsername ?? '', permission: 'edit' as const, isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFolder(ctx.siteContract, input.id, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta pasta." });
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
          name: z.string().trim().min(1).max(255).refine(isSafeCloudName, "Nome inválido para sincronização Windows"),
          fileName: z.string().refine(isSafeCloudName, "Nome inválido para sincronização Windows"),
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

        if (input.folderId) {
          const accessCtx = { username: ctx.siteAdminUsername ?? '', permission: 'edit' as const, isMasterAdmin: ctx.siteRole === 'admin' };
          const allowed = await canAccessFolder(ctx.siteContract, input.folderId, accessCtx);
          if (!allowed) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta pasta." });
          }
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

        const reservationId = uuidv4();
        await reserveStorageCapacity(ctx.siteContract, fileBuffer.length, reservationId);
        await uploadToR2(r2Key, fileBuffer, input.mimeType).catch(async error => { await releaseStorageReservation(reservationId); throw error; });

        const file = await createFileRecord({
          id: fileId,
          contractSlug: ctx.siteContract,
          folderId: input.folderId,
          name: input.name,
          r2Key,
          fileSize: fileBuffer.length,
          reservationId,
          mimeType: input.mimeType,
          uploadedBy: ctx.siteAdminUsername,
        }).catch(async error => { await releaseStorageReservation(reservationId); await deleteFromR2(r2Key); throw error; });



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

    // Enviar uma nova versao de um arquivo ja existente - a versao anterior
    // vai pro historico, nao e apagada. Mesmas regras de tamanho/espaco do
    // upload normal.
    uploadNewVersion: requirePermission('manageCloud')
      .input(
        z.object({
          fileId: z.string(),
          expectedRevision: z.string().optional(),
          fileName: z.string().refine(isSafeCloudName, "Nome inválido para sincronização Windows"),
          fileData: z.string(),
          mimeType: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const existing = await getFileById(input.fileId);
        if (!existing || existing.contractSlug !== ctx.siteContract) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo nao encontrado." });
        }
        const accessCtx = { username: ctx.siteAdminUsername ?? '', permission: 'edit' as const, isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFile(ctx.siteContract, input.fileId, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Voce nao tem acesso a este arquivo." });
        }
        if (
          existing.lockedBy &&
          existing.lockedBy !== ctx.siteAdminUsername &&
          isLockActive(existing.lockedBy, existing.lockedAt)
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Este arquivo esta sendo editado por ${existing.lockedBy}. Aguarde a pessoa concluir a edicao antes de enviar uma nova versao.`,
          });
        }

        const fileBuffer = Buffer.from(input.fileData, "base64");
        const MAX_CLOUD_BYTES = 200 * 1024 * 1024;
        if (fileBuffer.length > MAX_CLOUD_BYTES) {
          throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "O arquivo excede o limite de 200MB." });
        }

        const storage = await getStorageInfo(ctx.siteContract);
        if (storage.usedBytes + fileBuffer.length > storage.limitBytes) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Espaco de armazenamento insuficiente." });
        }
        if (!isR2Configured) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Armazenamento nao configurado." });
        }

        const folderChain = existing.folderId ? await getFolderPath(existing.folderId) : [];
        const folderPath = folderChain.map((f) => slugifyContract(f.name)).join("/");
        const newVersionKey = `${ctx.siteContract}/${folderPath ? `${folderPath}/` : ""}${uuidv4()}-${input.fileName}`;
        const reservationId = uuidv4();
        await reserveStorageCapacity(ctx.siteContract, fileBuffer.length, reservationId);
        await uploadToR2(newVersionKey, fileBuffer, input.mimeType).catch(async error => { await releaseStorageReservation(reservationId); throw error; });

        const updated = await uploadNewVersion(uuidv4(), input.fileId, ctx.siteContract, {
          expectedRevision: input.expectedRevision ?? existing.revisionToken,
          r2Key: newVersionKey,
          fileSize: fileBuffer.length,
          reservationId,
          mimeType: input.mimeType,
          uploadedBy: ctx.siteAdminUsername,
        }).catch(async error => { await releaseStorageReservation(reservationId); await deleteFromR2(newVersionKey); throw error; });

        // O conteudo antigo continua no R2 (agora como versao) - soma o
        // tamanho novo, sem descontar o antigo.


        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.fileNewVersion",
          targetType: "cloudFile",
          targetId: updated.id,
          targetName: updated.name,
        });

        return updated;
      }),

    // Marca um arquivo como "em edicao" pra evitar que duas pessoas
    // enviem versoes conflitantes ao mesmo tempo. Expira sozinha depois de
    // 2 horas caso a pessoa esqueca de liberar.
    lockFile: requirePermission('manageCloud')
      .input(z.object({ fileId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const accessCtx = { username: ctx.siteAdminUsername ?? '', permission: 'edit' as const, isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFile(ctx.siteContract, input.fileId, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Voce nao tem acesso a este arquivo." });
        }
        const username = ctx.siteAdminUsername ?? '';
        const result = await lockFile(input.fileId, ctx.siteContract, username);
        if (!result.ok) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Este arquivo ja esta sendo editado por ${result.lockedBy}.`,
          });
        }
        return result.file;
      }),

    // Libera a trava de edicao de um arquivo.
    unlockFile: requirePermission('manageCloud')
      .input(z.object({ fileId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const username = ctx.siteAdminUsername ?? '';
        const isAdmin = ctx.siteRole === 'admin';
        try {
          return await unlockFile(input.fileId, ctx.siteContract, username, isAdmin);
        } catch (error) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error instanceof Error ? error.message : "Nao foi possivel liberar o arquivo.",
          });
        }
      }),

    // Detalhe de um único arquivo (usado no modal de versões/edição pra
    // saber o estado de trava atual).
    getFileInfo: requirePermission('viewCloud')
      .input(z.object({ fileId: z.string() }))
      .query(async ({ input, ctx }) => {
        const file = await getFileById(input.fileId);
        if (!file || file.contractSlug !== ctx.siteContract) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo nao encontrado." });
        }
        const accessCtx = { username: ctx.siteAdminUsername ?? '', isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFile(ctx.siteContract!, input.fileId, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Voce nao tem acesso a este arquivo." });
        }
        return file;
      }),

    listFileVersions: requirePermission('viewCloud')
      .input(z.object({ fileId: z.string() }))
      .query(async ({ input, ctx }) => {
        const file = await getFileById(input.fileId);
        if (!file || file.contractSlug !== ctx.siteContract) return [];
        const accessCtx = { username: ctx.siteAdminUsername ?? '', isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFile(ctx.siteContract!, input.fileId, accessCtx))) return [];
        return listFileVersions(input.fileId);
      }),

    getVersionDownloadUrl: requirePermission('viewCloud')
      .input(z.object({ fileId: z.string(), versionId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const file = await getFileById(input.fileId);
        if (!file || file.contractSlug !== ctx.siteContract) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo nao encontrado." });
        }
        const accessCtx = { username: ctx.siteAdminUsername ?? '', isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFile(ctx.siteContract!, input.fileId, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Voce nao tem acesso a este arquivo." });
        }
        const content = await getVersionContentInfo(input.fileId, input.versionId);
        if (!content) throw new TRPCError({ code: "NOT_FOUND", message: "Versao nao encontrada." });
        if (content.r2Key) {
          if (!isR2Configured) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Armazenamento nao configurado." });
          }
          return { url: await getR2DownloadUrl(content.r2Key, content.name) };
        }
        if (content.fileUrl) return { url: content.fileUrl };
        throw new TRPCError({ code: "NOT_FOUND", message: "Versao sem conteudo associado." });
      }),

    restoreFileVersion: requirePermission('manageCloud')
      .input(z.object({ fileId: z.string(), versionId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const accessCtx = { username: ctx.siteAdminUsername ?? '', permission: 'edit' as const, isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFile(ctx.siteContract, input.fileId, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Voce nao tem acesso a este arquivo." });
        }
        try {
          await restoreFileVersion(input.fileId, ctx.siteContract, input.versionId);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Erro ao restaurar versao.",
          });
        }
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.fileRestoreVersion",
          targetType: "cloudFile",
          targetId: input.fileId,
        });
        return { success: true } as const;
      }),

    renameFile: requirePermission('manageCloud')
      .input(z.object({ id: z.string(), name: z.string().trim().min(1).max(255).refine(isSafeCloudName, "Nome inválido para sincronização Windows") }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const accessCtx = { username: ctx.siteAdminUsername ?? '', permission: 'edit' as const, isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFile(ctx.siteContract, input.id, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a este arquivo." });
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
        const accessCtx = { username: ctx.siteAdminUsername ?? '', permission: 'edit' as const, isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFile(ctx.siteContract, input.id, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a este arquivo." });
        }
        if (input.folderId && !(await canAccessFolder(ctx.siteContract, input.folderId, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso à pasta de destino." });
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
        const accessCtx = { username: ctx.siteAdminUsername ?? '', permission: 'edit' as const, isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFolder(ctx.siteContract, input.id, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta pasta." });
        }
        if (
          input.targetFolderId &&
          !(await canAccessFolder(ctx.siteContract, input.targetFolderId, accessCtx))
        ) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso à pasta de destino." });
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
        const accessCtx = { username: ctx.siteAdminUsername ?? '', isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFile(ctx.siteContract!, file.id, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a este arquivo." });
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
        const accessCtx = { username: ctx.siteAdminUsername ?? '', isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFile(ctx.siteContract!, file.id, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a este arquivo." });
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
        const accessCtx = { includeTrash: true, username: ctx.siteAdminUsername ?? '', permission: 'edit' as const, isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFile(ctx.siteContract, input.id, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a este arquivo." });
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
        // Só pode restaurar o que a pessoa teria acesso — sem isso, dava
        // pra restaurar um arquivo de área restrita mesmo sem acesso à
        // pasta original dele (achado de auditoria de segurança, 07/09).
        const accessCtx = { includeTrash: true, username: ctx.siteAdminUsername ?? '', permission: 'edit' as const, isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFile(ctx.siteContract, input.id, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a este arquivo." });
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

    // Lixeira — pastas e arquivos marcados como excluídos. Filtra pelos
    // que a pessoa realmente pode acessar — sem isso, um item de área
    // restrita aparecia na lixeira de qualquer um do contrato, mesmo
    // sem acesso à pasta original dele (achado de auditoria de
    // segurança, 07/09).
    listTrash: requirePermission('viewCloud').query(async ({ ctx }) => {
      if (!ctx.siteContract) return { folders: [], files: [] };
      const accessCtx = { includeTrash: true, username: ctx.siteAdminUsername ?? '', isMasterAdmin: ctx.siteRole === 'admin' };
      const { folders, files } = await listTrash(ctx.siteContract);
      const [folderChecks, fileChecks] = await Promise.all([
        Promise.all(folders.map((f) => canAccessFolder(ctx.siteContract!, f.id, accessCtx))),
        Promise.all(files.map((f) => canAccessFile(ctx.siteContract!, f.id, accessCtx))),
      ]);
      return {
        folders: folders.filter((_, i) => folderChecks[i]),
        files: files.filter((_, i) => fileChecks[i]),
      };
    }),

    // Exclusão definitiva — some do banco e do R2, nunca mais volta.
    permanentlyDeleteFile: requirePermission('manageCloud')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const accessCtx = { includeTrash: true, username: ctx.siteAdminUsername ?? '', permission: 'edit' as const, isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFile(ctx.siteContract, input.id, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a este arquivo." });
        }
        const result = await permanentlyDeleteFile(input.id, ctx.siteContract);
        if (result) {
          const { file, versions } = result;
          let freedBytes = file.fileSize ?? 0;
          if (file.r2Key) await deleteFromR2(file.r2Key);
          else if (file.fileUrl) await deleteCloudFileFromSupabase(file.fileUrl);
          for (const v of versions) {
            freedBytes += v.fileSize ?? 0;
            if (v.r2Key) await deleteFromR2(v.r2Key);
            else if (v.fileUrl) await deleteCloudFileFromSupabase(v.fileUrl);
          }
          await adjustStorageUsed(ctx.siteContract, -freedBytes);
        }
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.filePermanentDelete",
          targetType: "cloudFile",
          targetId: input.id,
          targetName: result?.file.name,
        });
        return { success: true } as const;
      }),

    permanentlyDeleteFolder: requirePermission('manageCloud')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const accessCtx = { includeTrash: true, username: ctx.siteAdminUsername ?? '', permission: 'edit' as const, isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFolder(ctx.siteContract, input.id, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta pasta." });
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

    // Esvazia a lixeira inteira de uma vez — mesma lógica das exclusões
    // individuais acima, só que em laço. Seguro mesmo processando
    // pasta e arquivo "redundantes" (uma pasta na lixeira já leva
    // junto tudo que tem dentro, incluindo subpastas/arquivos que
    // TAMBÉM aparecem na lixeira como itens próprios) — excluir de novo
    // algo que já não existe simplesmente não faz nada, não dá erro.
    //
    // SÓ administrador da ORGANIZAÇÃO (não conta comum com manageCloud)
    // — é uma ação destrutiva demais pra deixar qualquer conta com
    // manageCloud apagar de vez a lixeira do contrato inteiro, incluindo
    // item de área restrita que ela nem devia enxergar (achado de
    // auditoria de segurança, 07/09). Achado real (Gilvando, 14/09):
    // antes disto, tinha ficado restrito demais — exigia
    // masterAdminProcedure (só o login de recuperação da PLATAFORMA
    // inteira, siteOrganizationId null), bloqueando até a própria conta
    // administradora normal da organização. organizationAdminProcedure é
    // o nível certo: exige "admin" (não conta comum), mas não exige ser
    // o login de emergência da plataforma.
    emptyTrash: organizationAdminProcedure.mutation(async ({ ctx }) => {
      if (!ctx.siteContract) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
      }
      const { folders, files } = await listTrash(ctx.siteContract);

      for (const folder of folders) {
        const removed = await deleteFolderRecursive(folder.id, ctx.siteContract, ctx.siteAdminUsername, true);
        for (const key of removed.r2Keys) await deleteFromR2(key);
        for (const url of removed.fileUrls) await deleteCloudFileFromSupabase(url);
      }

      for (const file of files) {
        const result = await permanentlyDeleteFile(file.id, ctx.siteContract);
        if (result) {
          const { file: deletedFile, versions } = result;
          if (deletedFile.r2Key) await deleteFromR2(deletedFile.r2Key);
          else if (deletedFile.fileUrl) await deleteCloudFileFromSupabase(deletedFile.fileUrl);
          for (const v of versions) {
            if (v.r2Key) await deleteFromR2(v.r2Key);
            else if (v.fileUrl) await deleteCloudFileFromSupabase(v.fileUrl);
          }
        }
      }

      await recalculateStorageUsed(ctx.siteContract);
      void logActivity({
        username: ctx.siteAdminUsername,
        role: ctx.siteRole,
        action: "cloud.emptyTrash",
        targetType: "cloudFile",
        targetId: "trash",
        targetName: `${folders.length} pasta(s), ${files.length} arquivo(s)`,
      });
      return { success: true, foldersRemoved: folders.length, filesRemoved: files.length } as const;
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

    // Recentes — últimos enviados/modificados. Filtra pelos que a pessoa
    // realmente pode acessar — sem isso, nome/metadado de arquivo dentro
    // de pasta restrita aparecia pra quem não deveria ver (achado de
    // auditoria de segurança, 07/09).
    listRecent: requirePermission('viewCloud').query(async ({ ctx }) => {
      if (!ctx.siteContract) return [];
      const accessCtx = { username: ctx.siteAdminUsername ?? '', isMasterAdmin: ctx.siteRole === 'admin' };
      const files = await listRecentFiles(ctx.siteContract);
      const checks = await Promise.all(files.map((f) => canAccessFile(ctx.siteContract!, f.id, accessCtx)));
      return files.filter((_, i) => checks[i]);
    }),

    // Busca por nome, dentro do contrato do usuário. Mesma filtragem de
    // acesso do listRecent acima — a busca não pode ser uma forma de
    // "espiar" nome de arquivo de pasta restrita.
    search: requirePermission('viewCloud')
      .input(z.object({ query: z.string() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.siteContract) return [];
        const accessCtx = { username: ctx.siteAdminUsername ?? '', isMasterAdmin: ctx.siteRole === 'admin' };
        const files = await searchFiles(ctx.siteContract, input.query);
        const checks = await Promise.all(files.map((f) => canAccessFile(ctx.siteContract!, f.id, accessCtx)));
        return files.filter((_, i) => checks[i]);
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
        // Só quem já tem acesso ao arquivo pode compartilhá-lo — sem isso,
        // alguém com manageCloud e o UUID de um arquivo restrito conseguia
        // compartilhar algo que nem ele mesmo deveria conseguir ver
        // (achado de auditoria de segurança, 07/09).
        const accessCtx = { username: ctx.siteAdminUsername, permission: 'edit' as const, isMasterAdmin: ctx.siteRole === 'admin' };
        if (!(await canAccessFile(ctx.siteContract, input.fileId, accessCtx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a este arquivo." });
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
        // Só quem compartilhou (ou o administrador principal) pode revogar
        // — sem isso, qualquer conta com manageCloud podia desfazer um
        // compartilhamento que nem foi ela quem criou (achado de auditoria
        // de segurança, 07/09).
        const share = await getShareById(input.id);
        if (!share || share.contractSlug !== ctx.siteContract) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Compartilhamento não encontrado." });
        }
        const isOwner = share.sharedBy === ctx.siteAdminUsername;
        const isMasterAdmin = ctx.siteRole === 'admin';
        if (!isOwner && !isMasterAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Só quem compartilhou pode revogar." });
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
      .input(
        z.object({
          name: z.string().trim().min(2, "Informe o nome do grupo").max(120),
          autoSetor: z.string().trim().max(100).nullish(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const group = await createGroup(uuidv4(), ctx.siteContract, input.name, input.autoSetor);
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

    updateGroupAutoSetor: masterAdminProcedure
      .input(z.object({ id: z.string(), autoSetor: z.string().trim().max(100).nullable() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        await updateGroupAutoSetor(input.id, ctx.siteContract, input.autoSetor);
        return { success: true } as const;
      }),

    // Setores já em uso neste contrato, pra sugerir na hora de criar um
    // grupo automático (em vez de precisar digitar o nome exato de cabeça).
    listSetores: organizationAdminProcedure.query(async ({ ctx }) => {
      if (!ctx.siteContract) return [];
      return listSetores(ctx.siteContract);
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
      .query(async ({ input, ctx }) => {
        if (!ctx.siteContract) return [];
        return listEffectiveGroupMembers(input.groupId, ctx.siteContract);
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

    // Limpeza de pastas duplicadas — ferramenta pontual pra corrigir
    // duplicata já existente (de antes de createFolder virar idempotente
    // — achado reportado pelo Gilvando, 11/09). Administrador da
    // organização (não conta comum): mexe em pastas de qualquer área do
    // contrato, inclusive as que a conta comum não teria acesso pra ver.
    // Achado real (Gilvando, 14/09): eu mesmo tinha colocado
    // masterAdminProcedure aqui na hora de construir esta ferramenta,
    // confundindo "administrador principal" (um PAPEL, que qualquer
    // conta admin da organização já tem) com o procedimento
    // masterAdminProcedure de verdade (que exige o login de recuperação
    // da PLATAFORMA inteira, muito mais restrito) — corrigido pro nível
    // que eu realmente pretendia.
    findDuplicateFolders: organizationAdminProcedure.query(async ({ ctx }) => {
      if (!ctx.siteContract) return [];
      return findDuplicateFolderGroups(ctx.siteContract);
    }),

    mergeDuplicateFolders: organizationAdminProcedure
      .input(z.object({ keepId: z.string().min(1), duplicateIds: z.array(z.string().min(1)).min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        const totals = { filesMoved: 0, foldersMoved: 0, foldersMerged: 0 };
        for (const duplicateId of input.duplicateIds) {
          const result = await mergeFolderInto(duplicateId, input.keepId, ctx.siteContract, ctx.siteAdminUsername);
          totals.filesMoved += result.filesMoved;
          totals.foldersMoved += result.foldersMoved;
          totals.foldersMerged += result.foldersMerged;
        }
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "cloud.mergeDuplicateFolders",
          targetType: "cloudFolder",
          targetId: input.keepId,
          details: `mesclou ${input.duplicateIds.length} pasta(s) duplicada(s) — ${totals.filesMoved} arquivo(s) e ${totals.foldersMoved} subpasta(s) movidos`,
        });
        return totals;
      }),
  });


