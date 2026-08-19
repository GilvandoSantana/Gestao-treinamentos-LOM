/**
 * Nuvem de arquivos por contrato — pastas, arquivos, lixeira, favoritos e
 * compartilhamento. Conteúdo físico no Cloudflare R2 (server/r2-storage.ts);
 * aqui só ficam os metadados.
 */

import { eq, and, isNull, isNotNull, desc, sql } from "drizzle-orm";
import {
  cloudFolders,
  cloudFiles,
  cloudFavorites,
  cloudShares,
  cloudStorageConfig,
} from "../drizzle/schema";
import { getDb } from "./db";

export interface CloudFolderInfo {
  id: string;
  contractSlug: string;
  parentId: string | null;
  name: string;
  createdBy: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface CloudFileInfo {
  id: string;
  contractSlug: string;
  folderId: string | null;
  name: string;
  fileUrl: string | null;
  r2Key: string | null;
  fileSize: number | null;
  mimeType: string | null;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CloudFavoriteInfo {
  id: string;
  fileId: string | null;
  folderId: string | null;
  createdAt: string;
}

export interface CloudShareInfo {
  id: string;
  contractSlug: string;
  fileId: string | null;
  folderId: string | null;
  itemName: string;
  sharedBy: string;
  sharedWith: string;
  permission: "view" | "download" | "edit";
  expiresAt: string | null;
  createdAt: string;
}

function toFolderInfo(row: typeof cloudFolders.$inferSelect): CloudFolderInfo {
  return {
    id: row.id,
    contractSlug: row.contractSlug,
    parentId: row.parentId,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

function toFileInfo(row: typeof cloudFiles.$inferSelect): CloudFileInfo {
  return {
    id: row.id,
    contractSlug: row.contractSlug,
    folderId: row.folderId,
    name: row.name,
    fileUrl: row.fileUrl,
    r2Key: row.r2Key,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

function toShareInfo(row: typeof cloudShares.$inferSelect): CloudShareInfo {
  return {
    id: row.id,
    contractSlug: row.contractSlug,
    fileId: row.fileId,
    folderId: row.folderId,
    itemName: row.itemName,
    sharedBy: row.sharedBy,
    sharedWith: row.sharedWith,
    permission: row.permission as "view" | "download" | "edit",
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------
// Pastas e arquivos
// ---------------------------------------------------------------------

/** Conteúdo de uma pasta (ou da raiz, quando folderId é null). Nunca inclui itens na lixeira. */
export async function listFolderContents(
  contractSlug: string,
  folderId: string | null
): Promise<{ folders: CloudFolderInfo[]; files: CloudFileInfo[] }> {
  const db = await getDb();
  if (!db) return { folders: [], files: [] };

  const folderCondition = and(
    eq(cloudFolders.contractSlug, contractSlug),
    folderId ? eq(cloudFolders.parentId, folderId) : isNull(cloudFolders.parentId),
    isNull(cloudFolders.deletedAt)
  );
  const fileCondition = and(
    eq(cloudFiles.contractSlug, contractSlug),
    folderId ? eq(cloudFiles.folderId, folderId) : isNull(cloudFiles.folderId),
    isNull(cloudFiles.deletedAt)
  );

  const [folders, files] = await Promise.all([
    db.select().from(cloudFolders).where(folderCondition),
    db.select().from(cloudFiles).where(fileCondition),
  ]);

  return {
    folders: folders.map(toFolderInfo).sort((a, b) => a.name.localeCompare(b.name)),
    files: files.map(toFileInfo).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function getFolderById(id: string): Promise<CloudFolderInfo | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(cloudFolders).where(eq(cloudFolders.id, id));
  return rows[0] ? toFolderInfo(rows[0]) : undefined;
}

export async function getFileById(id: string): Promise<CloudFileInfo | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(cloudFiles).where(eq(cloudFiles.id, id));
  return rows[0] ? toFileInfo(rows[0]) : undefined;
}

/** Caminho (breadcrumb) da raiz até esta pasta. */
export async function getFolderPath(id: string): Promise<CloudFolderInfo[]> {
  const path: CloudFolderInfo[] = [];
  let current = await getFolderById(id);
  let guard = 0;
  while (current && guard < 20) {
    path.unshift(current);
    current = current.parentId ? await getFolderById(current.parentId) : undefined;
    guard++;
  }
  return path;
}

export async function createFolder(input: {
  id: string;
  contractSlug: string;
  parentId: string | null;
  name: string;
  createdBy: string | null;
}): Promise<CloudFolderInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(cloudFolders).values(input);
  return { ...input, createdAt: new Date().toISOString(), deletedAt: null };
}

export async function renameFolder(id: string, contractSlug: string, name: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(cloudFolders)
    .set({ name: name.trim() })
    .where(and(eq(cloudFolders.id, id), eq(cloudFolders.contractSlug, contractSlug)));
}

export async function createFileRecord(input: {
  id: string;
  contractSlug: string;
  folderId: string | null;
  name: string;
  fileUrl?: string | null;
  r2Key?: string | null;
  fileSize: number;
  mimeType: string;
  uploadedBy: string | null;
}): Promise<CloudFileInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(cloudFiles).values({
    id: input.id,
    contractSlug: input.contractSlug,
    folderId: input.folderId,
    name: input.name,
    fileUrl: input.fileUrl ?? null,
    r2Key: input.r2Key ?? null,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
    uploadedBy: input.uploadedBy,
  });
  const created = await getFileById(input.id);
  if (!created) throw new Error("Failed to read back created file");
  return created;
}

export async function renameFile(id: string, contractSlug: string, name: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(cloudFiles)
    .set({ name: name.trim() })
    .where(and(eq(cloudFiles.id, id), eq(cloudFiles.contractSlug, contractSlug)));
}

export async function moveFile(id: string, contractSlug: string, folderId: string | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(cloudFiles)
    .set({ folderId })
    .where(and(eq(cloudFiles.id, id), eq(cloudFiles.contractSlug, contractSlug)));
}

// ---------------------------------------------------------------------
// Lixeira — exclusão nunca é imediata: marca deletedAt, some da listagem
// normal, e some do R2 só na exclusão definitiva.
// ---------------------------------------------------------------------

export async function softDeleteFile(id: string, contractSlug: string, username: string | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(cloudFiles)
    .set({ deletedAt: new Date(), deletedBy: username })
    .where(and(eq(cloudFiles.id, id), eq(cloudFiles.contractSlug, contractSlug)));
}

export async function restoreFile(id: string, contractSlug: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(cloudFiles)
    .set({ deletedAt: null, deletedBy: null })
    .where(and(eq(cloudFiles.id, id), eq(cloudFiles.contractSlug, contractSlug)));
}

/** Exclui de vez: some do banco. Quem chama é responsável por apagar do R2 antes. */
export async function permanentlyDeleteFile(id: string, contractSlug: string): Promise<CloudFileInfo | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const file = await getFileById(id);
  if (!file || file.contractSlug !== contractSlug) return undefined;
  await db.delete(cloudFiles).where(eq(cloudFiles.id, id));
  await db.delete(cloudFavorites).where(eq(cloudFavorites.fileId, id));
  await db.delete(cloudShares).where(eq(cloudShares.fileId, id));
  return file;
}

export async function softDeleteFolder(id: string, contractSlug: string, username: string | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(cloudFolders)
    .set({ deletedAt: new Date(), deletedBy: username })
    .where(and(eq(cloudFolders.id, id), eq(cloudFolders.contractSlug, contractSlug)));
}

export async function restoreFolder(id: string, contractSlug: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(cloudFolders)
    .set({ deletedAt: null, deletedBy: null })
    .where(and(eq(cloudFolders.id, id), eq(cloudFolders.contractSlug, contractSlug)));
}

/** Tudo que está na lixeira do contrato (pastas e arquivos), mais recente primeiro. */
export async function listTrash(
  contractSlug: string
): Promise<{ folders: CloudFolderInfo[]; files: CloudFileInfo[] }> {
  const db = await getDb();
  if (!db) return { folders: [], files: [] };

  const [folders, files] = await Promise.all([
    db
      .select()
      .from(cloudFolders)
      .where(and(eq(cloudFolders.contractSlug, contractSlug), isNotNull(cloudFolders.deletedAt)))
      .orderBy(desc(cloudFolders.deletedAt)),
    db
      .select()
      .from(cloudFiles)
      .where(and(eq(cloudFiles.contractSlug, contractSlug), isNotNull(cloudFiles.deletedAt)))
      .orderBy(desc(cloudFiles.deletedAt)),
  ]);

  return { folders: folders.map(toFolderInfo), files: files.map(toFileInfo) };
}

/**
 * Exclui uma pasta e tudo dentro dela, recursivamente. `permanent = true`
 * apaga de vez (usado a partir da lixeira); caso contrário só move pra
 * lixeira. Devolve as chaves/URLs dos arquivos removidos de verdade, para
 * apagar do R2/Supabase por fora.
 */
export async function deleteFolderRecursive(
  id: string,
  contractSlug: string,
  username: string | null,
  permanent: boolean
): Promise<{ r2Keys: string[]; fileUrls: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const removed = { r2Keys: [] as string[], fileUrls: [] as string[] };

  const subfolders = await db
    .select()
    .from(cloudFolders)
    .where(and(eq(cloudFolders.parentId, id), eq(cloudFolders.contractSlug, contractSlug)));
  for (const sub of subfolders) {
    const inner = await deleteFolderRecursive(sub.id, contractSlug, username, permanent);
    removed.r2Keys.push(...inner.r2Keys);
    removed.fileUrls.push(...inner.fileUrls);
  }

  const files = await db
    .select()
    .from(cloudFiles)
    .where(and(eq(cloudFiles.folderId, id), eq(cloudFiles.contractSlug, contractSlug)));

  if (permanent) {
    for (const f of files) {
      if (f.r2Key) removed.r2Keys.push(f.r2Key);
      else if (f.fileUrl) removed.fileUrls.push(f.fileUrl);
    }
    if (files.length > 0) {
      await db.delete(cloudFiles).where(and(eq(cloudFiles.folderId, id), eq(cloudFiles.contractSlug, contractSlug)));
    }
    await db.delete(cloudFolders).where(and(eq(cloudFolders.id, id), eq(cloudFolders.contractSlug, contractSlug)));
  } else {
    const now = new Date();
    if (files.length > 0) {
      await db
        .update(cloudFiles)
        .set({ deletedAt: now, deletedBy: username })
        .where(and(eq(cloudFiles.folderId, id), eq(cloudFiles.contractSlug, contractSlug)));
    }
    await db
      .update(cloudFolders)
      .set({ deletedAt: now, deletedBy: username })
      .where(and(eq(cloudFolders.id, id), eq(cloudFolders.contractSlug, contractSlug)));
  }

  return removed;
}

// ---------------------------------------------------------------------
// Favoritos
// ---------------------------------------------------------------------

export interface CloudFavoriteItem extends CloudFavoriteInfo {
  name: string;
  isFolder: boolean;
  size: number | null;
}

/** Favoritos já com nome/tamanho resolvidos — o que a tela precisa pra
 * mostrar, sem obrigar o cliente a cruzar dado nenhum por fora. */
export async function listFavorites(contractSlug: string, username: string): Promise<CloudFavoriteItem[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(cloudFavorites)
    .where(and(eq(cloudFavorites.contractSlug, contractSlug), eq(cloudFavorites.username, username)));

  const result: CloudFavoriteItem[] = [];
  for (const r of rows) {
    const base = { id: r.id, fileId: r.fileId, folderId: r.folderId, createdAt: r.createdAt.toISOString() };
    if (r.fileId) {
      const file = await getFileById(r.fileId);
      if (!file || file.deletedAt) continue; // favorito de item já excluído — ignora
      result.push({ ...base, name: file.name, isFolder: false, size: file.fileSize });
    } else if (r.folderId) {
      const folder = await getFolderById(r.folderId);
      if (!folder || folder.deletedAt) continue;
      result.push({ ...base, name: folder.name, isFolder: true, size: null });
    }
  }
  return result;
}

export async function toggleFavorite(
  id: string,
  contractSlug: string,
  username: string,
  target: { fileId?: string; folderId?: string }
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const condition = target.fileId
    ? and(eq(cloudFavorites.contractSlug, contractSlug), eq(cloudFavorites.username, username), eq(cloudFavorites.fileId, target.fileId))
    : and(eq(cloudFavorites.contractSlug, contractSlug), eq(cloudFavorites.username, username), eq(cloudFavorites.folderId, target.folderId!));

  const existing = await db.select().from(cloudFavorites).where(condition);
  if (existing.length > 0) {
    await db.delete(cloudFavorites).where(eq(cloudFavorites.id, existing[0].id));
    return false;
  }

  await db.insert(cloudFavorites).values({
    id,
    contractSlug,
    username,
    fileId: target.fileId ?? null,
    folderId: target.folderId ?? null,
  });
  return true;
}

// ---------------------------------------------------------------------
// Compartilhamento
// ---------------------------------------------------------------------

export async function createShare(input: {
  id: string;
  contractSlug: string;
  fileId?: string | null;
  folderId?: string | null;
  itemName: string;
  sharedBy: string;
  sharedWith: string;
  permission: "view" | "download" | "edit";
  expiresAt?: Date | null;
}): Promise<CloudShareInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(cloudShares).values({
    id: input.id,
    contractSlug: input.contractSlug,
    fileId: input.fileId ?? null,
    folderId: input.folderId ?? null,
    itemName: input.itemName,
    sharedBy: input.sharedBy,
    sharedWith: input.sharedWith,
    permission: input.permission,
    expiresAt: input.expiresAt ?? null,
  });
  return {
    id: input.id,
    contractSlug: input.contractSlug,
    fileId: input.fileId ?? null,
    folderId: input.folderId ?? null,
    itemName: input.itemName,
    sharedBy: input.sharedBy,
    sharedWith: input.sharedWith,
    permission: input.permission,
    expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
    createdAt: new Date().toISOString(),
  };
}

export async function listSharedWithMe(contractSlug: string, username: string): Promise<CloudShareInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(cloudShares)
    .where(and(eq(cloudShares.contractSlug, contractSlug), eq(cloudShares.sharedWith, username)))
    .orderBy(desc(cloudShares.createdAt));
  return rows.map(toShareInfo);
}

export async function listSharedByMe(contractSlug: string, username: string): Promise<CloudShareInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(cloudShares)
    .where(and(eq(cloudShares.contractSlug, contractSlug), eq(cloudShares.sharedBy, username)))
    .orderBy(desc(cloudShares.createdAt));
  return rows.map(toShareInfo);
}

/** Compartilhamentos que dão acesso a este arquivo específico, pra checar permissão. */
export async function getSharesForFile(fileId: string, username: string): Promise<CloudShareInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(cloudShares)
    .where(and(eq(cloudShares.fileId, fileId), eq(cloudShares.sharedWith, username)));
  return rows.map(toShareInfo);
}

export async function revokeShare(id: string, contractSlug: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(cloudShares).where(and(eq(cloudShares.id, id), eq(cloudShares.contractSlug, contractSlug)));
}

// ---------------------------------------------------------------------
// Controle de espaço
// ---------------------------------------------------------------------

export interface StorageInfo {
  limitBytes: number;
  usedBytes: number;
}

const DEFAULT_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

async function ensureStorageConfig(contractSlug: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(cloudStorageConfig).where(eq(cloudStorageConfig.contractSlug, contractSlug));
  if (rows.length === 0) {
    await db.insert(cloudStorageConfig).values({ contractSlug, limitBytes: DEFAULT_LIMIT_BYTES, usedBytes: 0 });
  }
}

export async function getStorageInfo(contractSlug: string): Promise<StorageInfo> {
  const db = await getDb();
  if (!db) return { limitBytes: DEFAULT_LIMIT_BYTES, usedBytes: 0 };
  await ensureStorageConfig(contractSlug);
  const rows = await db.select().from(cloudStorageConfig).where(eq(cloudStorageConfig.contractSlug, contractSlug));
  const row = rows[0];
  return { limitBytes: row?.limitBytes ?? DEFAULT_LIMIT_BYTES, usedBytes: row?.usedBytes ?? 0 };
}

export async function adjustStorageUsed(contractSlug: string, deltaBytes: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await ensureStorageConfig(contractSlug);
  await db
    .update(cloudStorageConfig)
    .set({ usedBytes: sql`GREATEST(0, ${cloudStorageConfig.usedBytes} + ${deltaBytes})` })
    .where(eq(cloudStorageConfig.contractSlug, contractSlug));
}

export async function setStorageLimit(contractSlug: string, limitBytes: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await ensureStorageConfig(contractSlug);
  await db.update(cloudStorageConfig).set({ limitBytes }).where(eq(cloudStorageConfig.contractSlug, contractSlug));
}

/** Recalcula usedBytes somando os arquivos reais (não deletados) — rotina
 * de segurança caso o contador fique dessincronizado por algum motivo. */
export async function recalculateStorageUsed(contractSlug: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await ensureStorageConfig(contractSlug);

  const rows = await db
    .select({ total: sql<number>`COALESCE(SUM(${cloudFiles.fileSize}), 0)` })
    .from(cloudFiles)
    .where(and(eq(cloudFiles.contractSlug, contractSlug), isNull(cloudFiles.deletedAt)));

  const total = Number(rows[0]?.total ?? 0);
  await db.update(cloudStorageConfig).set({ usedBytes: total }).where(eq(cloudStorageConfig.contractSlug, contractSlug));
  return total;
}

// ---------------------------------------------------------------------
// Recentes e busca
// ---------------------------------------------------------------------

/** Arquivos enviados/modificados mais recentemente (não inclui a lixeira). */
export async function listRecentFiles(contractSlug: string, limit = 30): Promise<CloudFileInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(cloudFiles)
    .where(and(eq(cloudFiles.contractSlug, contractSlug), isNull(cloudFiles.deletedAt)))
    .orderBy(desc(cloudFiles.updatedAt))
    .limit(limit);
  return rows.map(toFileInfo);
}

/** Busca por nome — não entra na lixeira, e quem chama já filtrou por permissão de acesso. */
export async function searchFiles(contractSlug: string, query: string): Promise<CloudFileInfo[]> {
  const db = await getDb();
  if (!db || !query.trim()) return [];
  const rows = await db
    .select()
    .from(cloudFiles)
    .where(
      and(
        eq(cloudFiles.contractSlug, contractSlug),
        isNull(cloudFiles.deletedAt),
        sql`LOWER(${cloudFiles.name}) LIKE ${`%${query.trim().toLowerCase()}%`}`
      )
    )
    .limit(50);
  return rows.map(toFileInfo);
}
