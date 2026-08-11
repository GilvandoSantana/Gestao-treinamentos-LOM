/**
 * Nuvem de arquivos por contrato — pastas e arquivos.
 */

import { eq, and, isNull } from "drizzle-orm";
import { cloudFolders, cloudFiles } from "../drizzle/schema";
import { getDb } from "./db";

export interface CloudFolderInfo {
  id: string;
  contractSlug: string;
  parentId: string | null;
  name: string;
  createdBy: string | null;
  createdAt: string;
}

export interface CloudFileInfo {
  id: string;
  contractSlug: string;
  folderId: string | null;
  name: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  uploadedBy: string | null;
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
  };
}

function toFileInfo(row: typeof cloudFiles.$inferSelect): CloudFileInfo {
  return {
    id: row.id,
    contractSlug: row.contractSlug,
    folderId: row.folderId,
    name: row.name,
    fileUrl: row.fileUrl,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Conteúdo de uma pasta (ou da raiz, quando folderId é null). */
export async function listFolderContents(
  contractSlug: string,
  folderId: string | null
): Promise<{ folders: CloudFolderInfo[]; files: CloudFileInfo[] }> {
  const db = await getDb();
  if (!db) return { folders: [], files: [] };

  const folderCondition = folderId
    ? and(eq(cloudFolders.contractSlug, contractSlug), eq(cloudFolders.parentId, folderId))
    : and(eq(cloudFolders.contractSlug, contractSlug), isNull(cloudFolders.parentId));
  const fileCondition = folderId
    ? and(eq(cloudFiles.contractSlug, contractSlug), eq(cloudFiles.folderId, folderId))
    : and(eq(cloudFiles.contractSlug, contractSlug), isNull(cloudFiles.folderId));

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

/** Caminho (breadcrumb) da raiz até esta pasta. */
export async function getFolderPath(id: string): Promise<CloudFolderInfo[]> {
  const path: CloudFolderInfo[] = [];
  let current = await getFolderById(id);
  // Limite de segurança para nunca entrar em loop caso os dados fiquem inconsistentes.
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
  return { ...input, createdAt: new Date().toISOString() };
}

export async function createFileRecord(input: {
  id: string;
  contractSlug: string;
  folderId: string | null;
  name: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string | null;
}): Promise<CloudFileInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(cloudFiles).values(input);
  return { ...input, createdAt: new Date().toISOString() };
}

export async function deleteFileRecord(id: string, contractSlug: string): Promise<CloudFileInfo | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(cloudFiles)
    .where(and(eq(cloudFiles.id, id), eq(cloudFiles.contractSlug, contractSlug)));
  const file = rows[0];
  if (!file) return undefined;
  await db.delete(cloudFiles).where(eq(cloudFiles.id, id));
  return toFileInfo(file);
}

/**
 * Exclui uma pasta e tudo dentro dela (subpastas e arquivos), recursivamente.
 * Devolve as URLs dos arquivos removidos, para apagar do Supabase também.
 */
export async function deleteFolderRecursive(id: string, contractSlug: string): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const deletedFileUrls: string[] = [];

  const subfolders = await db
    .select()
    .from(cloudFolders)
    .where(and(eq(cloudFolders.parentId, id), eq(cloudFolders.contractSlug, contractSlug)));
  for (const sub of subfolders) {
    const urls = await deleteFolderRecursive(sub.id, contractSlug);
    deletedFileUrls.push(...urls);
  }

  const files = await db
    .select()
    .from(cloudFiles)
    .where(and(eq(cloudFiles.folderId, id), eq(cloudFiles.contractSlug, contractSlug)));
  deletedFileUrls.push(...files.map((f) => f.fileUrl));
  if (files.length > 0) {
    await db.delete(cloudFiles).where(and(eq(cloudFiles.folderId, id), eq(cloudFiles.contractSlug, contractSlug)));
  }

  await db.delete(cloudFolders).where(and(eq(cloudFolders.id, id), eq(cloudFolders.contractSlug, contractSlug)));

  return deletedFileUrls;
}
