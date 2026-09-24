/**
 * Nuvem de arquivos por contrato — pastas, arquivos, lixeira, favoritos e
 * compartilhamento. Conteúdo físico no Cloudflare R2 (server/r2-storage.ts);
 * aqui só ficam os metadados.
 */

import { assertSafeCloudName } from "../shared/cloud-path";
import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq, and, inArray, isNull, isNotNull, desc, sql } from "drizzle-orm";
import {
  cloudFolders,
  cloudFiles,
  cloudFileVersions,
  cloudFavorites,
  cloudShares,
  cloudStorageConfig,
  cloudStorageReservations,
  cloudGroups,
  cloudGroupMembers,
} from "../drizzle/schema";
import { getDb } from "./db";
import { getAdminByUsername, listUsernamesBySetor } from "./db-admins";

export interface CloudFolderInfo {
  id: string;
  contractSlug: string;
  parentId: string | null;
  name: string;
  createdBy: string | null;
  createdAt: string;
  deletedAt: string | null;
  restrictedToGroupId: string | null;
  restrictedToGroupName: string | null;
  /** Se a pessoa que pediu a listagem pode ENTRAR nesta pasta (não impede
   * o nome dela aparecer na lista — só controla se dá pra abrir). */
  hasAccess: boolean;
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
  revisionToken?: string;
  deletedAt: string | null;
  lockedBy: string | null;
  lockedAt: string | null;
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
  sharedWith: string | null;
  sharedWithGroupId: string | null;
  sharedWithGroupName: string | null;
  permission: "view" | "download" | "edit";
  expiresAt: string | null;
  createdAt: string;
}

export interface CloudGroupInfo {
  id: string;
  contractSlug: string;
  name: string;
  autoSetor: string | null;
  memberCount: number;
  createdAt: string;
}

export interface CloudGroupMemberInfo {
  username: string;
  source: 'manual' | 'auto';
}

function toFolderInfo(
  row: typeof cloudFolders.$inferSelect,
  hasAccess = true,
  restrictedToGroupName: string | null = null
): CloudFolderInfo {
  return {
    id: row.id,
    contractSlug: row.contractSlug,
    parentId: row.parentId,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    restrictedToGroupId: row.restrictedToGroupId,
    restrictedToGroupName,
    hasAccess,
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
    revisionToken: createHash("sha256").update(JSON.stringify([row.r2Key, row.fileUrl, row.fileSize, row.updatedAt])).digest("hex"),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    lockedBy: row.lockedBy,
    lockedAt: row.lockedAt ? row.lockedAt.toISOString() : null,
  };
}

// Trava expira sozinha depois desse tempo, caso a pessoa esqueca de
// liberar (fechar o navegador sem clicar em "Concluir edicao", etc.)
const LOCK_DURATION_MS = 2 * 60 * 60 * 1000; // 2 horas

export function isLockActive(lockedBy: string | null, lockedAt: string | null): boolean {
  if (!lockedBy || !lockedAt) return false;
  return Date.now() - new Date(lockedAt).getTime() < LOCK_DURATION_MS;
}

/**
 * Marca um arquivo como "em edicao" por um usuario. Falha se ja estiver
 * travado por outra pessoa (e a trava ainda nao tiver expirado).
 */
export async function lockFile(
  fileId: string,
  contractSlug: string,
  username: string
): Promise<{ ok: true; file: CloudFileInfo } | { ok: false; lockedBy: string; lockedAt: string }> {
  const file = await getFileById(fileId);
  if (!file || file.contractSlug !== contractSlug) {
    throw new Error("Arquivo nao encontrado.");
  }
  if (file.lockedBy && file.lockedBy !== username && isLockActive(file.lockedBy, file.lockedAt)) {
    return { ok: false, lockedBy: file.lockedBy, lockedAt: file.lockedAt! };
  }
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponivel.");
  await db
    .update(cloudFiles)
    .set({ lockedBy: username, lockedAt: new Date() })
    .where(eq(cloudFiles.id, fileId));
  const updated = await getFileById(fileId);
  return { ok: true, file: updated! };
}

/**
 * Libera a trava de um arquivo. Só quem travou (ou um admin) pode liberar.
 */
export async function unlockFile(
  fileId: string,
  contractSlug: string,
  username: string,
  isAdmin: boolean
): Promise<CloudFileInfo> {
  const file = await getFileById(fileId);
  if (!file || file.contractSlug !== contractSlug) {
    throw new Error("Arquivo nao encontrado.");
  }
  if (file.lockedBy && file.lockedBy !== username && !isAdmin) {
    throw new Error("Apenas quem travou o arquivo (ou um administrador) pode liberar a edicao.");
  }
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponivel.");
  await db
    .update(cloudFiles)
    .set({ lockedBy: null, lockedAt: null })
    .where(eq(cloudFiles.id, fileId));
  const updated = await getFileById(fileId);
  return updated!;
}

function toShareInfo(row: typeof cloudShares.$inferSelect, groupName: string | null = null): CloudShareInfo {
  return {
    id: row.id,
    contractSlug: row.contractSlug,
    fileId: row.fileId,
    folderId: row.folderId,
    itemName: row.itemName,
    sharedBy: row.sharedBy,
    sharedWith: row.sharedWith,
    sharedWithGroupId: row.sharedWithGroupId,
    sharedWithGroupName: groupName,
    permission: row.permission as "view" | "download" | "edit",
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------
// Pastas e arquivos
// ---------------------------------------------------------------------

/** Conteúdo de uma pasta (ou da raiz, quando folderId é null). Nunca inclui itens na lixeira. */
export interface CloudAccessContext {
  username: string;
  isMasterAdmin: boolean;
  permission?: "view" | "download" | "edit";
  includeTrash?: boolean;
}

/** Verifica, pra quem está pedindo, se dá pra ENTRAR nesta pasta. Não
 * restringe listar o NOME dela num nível acima — só abrir o conteúdo. */
export async function canAccessFolder(
  contractSlug: string,
  folderId: string,
  ctx: CloudAccessContext
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const rows = await db.select().from(cloudFolders).where(eq(cloudFolders.id, folderId));
  const folder = rows[0];
  if (!folder || folder.contractSlug !== contractSlug || (folder.deletedAt && !ctx.includeTrash)) return false;
  if (ctx.isMasterAdmin || !folder.restrictedToGroupId) return true;

  const members = await listEffectiveGroupMembers(folder.restrictedToGroupId, contractSlug);
  if (members.some((m) => m.username === ctx.username)) return true;

  // Exceção: compartilhamento individual/de grupo continua valendo mesmo
  // sem ser membro do grupo dono da pasta.
  const candidates = await db.select().from(cloudShares).where(eq(cloudShares.folderId, folderId));
  const shareRows = candidates.filter(s => s.contractSlug === contractSlug &&
    (!s.expiresAt || s.expiresAt.getTime() > Date.now()) &&
    (ctx.permission !== 'edit' || s.permission === 'edit') &&
    (ctx.permission !== 'download' || s.permission === 'download' || s.permission === 'edit'));
  if (shareRows.some((s) => s.sharedWith === ctx.username)) return true;
  if (shareRows.some((s) => s.sharedWithGroupId)) {
    const myGroupIds = await getGroupIdsForUsername(contractSlug, ctx.username);
    if (shareRows.some((s) => s.sharedWithGroupId && myGroupIds.includes(s.sharedWithGroupId))) return true;
  }

  return false;
}

/** Mesma checagem, mas pra um arquivo — olha a restrição da pasta que o
 * contém (arquivo na raiz nunca tem restrição). */
export async function canAccessFile(
  contractSlug: string,
  fileId: string,
  ctx: CloudAccessContext
): Promise<boolean> {
  const file = await getFileById(fileId);
  if (!file || file.contractSlug !== contractSlug || (file.deletedAt && !ctx.includeTrash)) return false;
  if (!file.folderId) return true;
  return canAccessFolder(contractSlug, file.folderId, ctx);
}

export async function listFolderContents(
  contractSlug: string,
  folderId: string | null,
  ctx?: CloudAccessContext
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

  const [folderRows, files] = await Promise.all([
    db.select().from(cloudFolders).where(folderCondition),
    db.select().from(cloudFiles).where(fileCondition),
  ]);

  // Nomes de grupo, resolvidos uma vez por grupo (não por pasta) antes de
  // paralelizar — evita repetir a mesma consulta quando várias pastas
  // irmãs compartilham a mesma restrição, sem risco de corrida entre
  // chamadas paralelas checando o cache ao mesmo tempo.
  const uniqueGroupIds = Array.from(new Set(folderRows.map((r) => r.restrictedToGroupId).filter((id): id is string => !!id)));
  const groupNameEntries = await Promise.all(
    uniqueGroupIds.map(async (id) => [id, (await getGroupById(id))?.name ?? null] as const)
  );
  const groupNameCache = new Map(groupNameEntries);

  const folders: CloudFolderInfo[] = await Promise.all(
    folderRows.map(async (row) => {
      if (!row.restrictedToGroupId) return toFolderInfo(row, true, null);
      const groupName = groupNameCache.get(row.restrictedToGroupId) ?? null;
      const hasAccess = ctx ? await canAccessFolder(contractSlug, row.id, ctx) : true;
      return toFolderInfo(row, hasAccess, groupName);
    })
  );

  return {
    folders: folders.sort((a, b) => a.name.localeCompare(b.name)),
    files: files.map(toFileInfo).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** TEMP DIAGNOSTIC (remover após uso) — Gilvando contesta com razão: o
 * programa de sincronização (Windows) mostra arquivos numa pasta que eu
 * disse estar vazia, e a barra de espaço usado do site também mostra
 * consumo. Verificando direto, sem adivinhar: pasta por nome (com
 * arquivos e tamanhos) + total de armazenamento usado no contrato x soma
 * real dos tamanhos de arquivo no banco. */
export async function getCloudDiagByName(namePart: string) {
  const db = await getDb();
  if (!db) return { error: "sem conexão com o banco" };

  const matches = await db.select().from(cloudFolders).where(sql`${cloudFolders.name} LIKE ${`%${namePart}%`}`);
  const results = await Promise.all(
    matches.map(async (folder) => {
      const files = await db
        .select({ id: cloudFiles.id, name: cloudFiles.name, fileSize: cloudFiles.fileSize, deletedAt: cloudFiles.deletedAt, createdAt: cloudFiles.createdAt, r2Key: cloudFiles.r2Key, fileUrl: cloudFiles.fileUrl })
        .from(cloudFiles)
        .where(eq(cloudFiles.folderId, folder.id));
      const children = await db.select({ id: cloudFolders.id, name: cloudFolders.name, deletedAt: cloudFolders.deletedAt }).from(cloudFolders).where(eq(cloudFolders.parentId, folder.id));
      return {
        folderId: folder.id,
        folderName: folder.name,
        contractSlug: folder.contractSlug,
        parentId: folder.parentId,
        deletedAt: folder.deletedAt?.toISOString() ?? null,
        directFiles: files.map((f) => ({ ...f, deletedAt: f.deletedAt?.toISOString() ?? null, createdAt: f.createdAt?.toISOString() ?? null })),
        childFolders: children.map((c) => ({ ...c, deletedAt: c.deletedAt?.toISOString() ?? null })),
      };
    })
  );

  const allContracts = Array.from(new Set(matches.map((m) => m.contractSlug)));
  const storageByContract = await Promise.all(
    allContracts.map(async (contractSlug) => {
      const storageRow = await db.select().from(cloudStorageConfig).where(eq(cloudStorageConfig.contractSlug, contractSlug));
      const realSum = await db
        .select({ sum: sql<number>`coalesce(sum(${cloudFiles.fileSize}), 0)` })
        .from(cloudFiles)
        .where(and(eq(cloudFiles.contractSlug, contractSlug), isNull(cloudFiles.deletedAt)));
      return { contractSlug, storedUsedBytes: storageRow[0]?.usedBytes ?? null, realSumOfFileSizes: Number(realSum[0]?.sum ?? 0) };
    })
  );

  return { matchCount: matches.length, folders: results, storageByContract };
}

/** TEMP DIAGNOSTIC (remover após uso) — compara o que o R2 (Cloudflare)
 * tem de verdade pra este contrato com o que o banco (cloudFiles.r2Key)
 * conhece. Se sobrar objeto no R2 sem linha correspondente no banco, a
 * etapa que quebrou foi o registro final (createFileRecord, no
 * /complete do upload em partes) — o conteúdo chegou no destino, só não
 * virou "arquivo" pro site. */
export async function compareR2WithDb(contractSlug: string) {
  const { listObjectsInR2 } = await import("./r2-storage");
  const db = await getDb();
  if (!db) return { error: "sem conexão com o banco" };

  const r2Objects = await listObjectsInR2(`${contractSlug}/`);
  const dbFiles = await db
    .select({ id: cloudFiles.id, name: cloudFiles.name, r2Key: cloudFiles.r2Key, fileSize: cloudFiles.fileSize, deletedAt: cloudFiles.deletedAt })
    .from(cloudFiles)
    .where(eq(cloudFiles.contractSlug, contractSlug));

  const knownKeys = new Set(dbFiles.map((f) => f.r2Key).filter((k): k is string => !!k));
  const orphanedInR2 = r2Objects.filter((o) => !knownKeys.has(o.key));

  return {
    r2ObjectCount: r2Objects.length,
    dbFileRowCount: dbFiles.length,
    orphanedInR2Count: orphanedInR2.length,
    orphanedInR2Sample: orphanedInR2.slice(0, 20).map((o) => ({ key: o.key, size: o.size, lastModified: o.lastModified?.toISOString() ?? null })),
    totalR2Bytes: r2Objects.reduce((sum, o) => sum + o.size, 0),
  };
}

/**
 * Busca a árvore inteira de pastas/arquivos de um contrato de uma vez só
 * — usada pelo programa de sincronização (Windows), que antes fazia uma
 * chamada de rede SEPARADA pra cada pasta (uma "caminhada" sequencial:
 * pasta 1, espera responder, pasta 2, espera responder...). Pra um
 * contrato com muitas pastas, isso significava dezenas de idas-e-voltas
 * pela internet, um atrás do outro — lento (achado real, Gilvando,
 * relatando que "a resposta da Nuvem pro programa" demorava, mas o
 * mesmo não acontecia no site, que só busca uma pasta de cada vez, sob
 * demanda, nunca a árvore inteira). Aqui, é tudo resolvido com só duas
 * consultas simples ao banco (todas as pastas, todos os arquivos do
 * contrato) e a árvore é montada em memória — muito mais rápido, já que
 * fica inteiro do lado do servidor, sem idas-e-voltas pela rede.
 */
export async function getFullFolderTree(
  contractSlug: string,
  ctx?: CloudAccessContext
): Promise<{ folders: (CloudFolderInfo & { parentId: string | null })[]; files: (CloudFileInfo & { folderId: string | null })[] }> {
  const db = await getDb();
  if (!db) return { folders: [], files: [] };

  const [allFolderRows, allFileRows] = await Promise.all([
    db.select().from(cloudFolders).where(and(eq(cloudFolders.contractSlug, contractSlug), isNull(cloudFolders.deletedAt))),
    db.select().from(cloudFiles).where(and(eq(cloudFiles.contractSlug, contractSlug), isNull(cloudFiles.deletedAt))),
  ]);

  // hasAccess por pasta restrita — cache por grupo (não por pasta), já
  // que várias pastas costumam compartilhar o mesmo grupo dono.
  const groupNameCache = new Map<string, string | null>();
  const accessCache = new Map<string, boolean>();
  async function resolveAccess(row: typeof cloudFolders.$inferSelect): Promise<boolean> {
    if (!row.restrictedToGroupId) return true;
    if (!ctx) return true;
    const cacheKey = `${row.restrictedToGroupId}:${row.id}`;
    if (accessCache.has(cacheKey)) return accessCache.get(cacheKey)!;
    const allowed = await canAccessFolder(contractSlug, row.id, ctx);
    accessCache.set(cacheKey, allowed);
    return allowed;
  }

  const childrenByParent = new Map<string | null, typeof allFolderRows>();
  for (const row of allFolderRows) {
    const key = row.parentId ?? null;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(row);
  }
  const filesByFolder = new Map<string | null, typeof allFileRows>();
  for (const row of allFileRows) {
    const key = row.folderId ?? null;
    if (!filesByFolder.has(key)) filesByFolder.set(key, []);
    filesByFolder.get(key)!.push(row);
  }

  const resultFolders: (CloudFolderInfo & { parentId: string | null })[] = [];
  const resultFiles: (CloudFileInfo & { folderId: string | null })[] = [];

  // Caminha a árvore em memória (sem nenhuma chamada de rede aqui dentro)
  // — mesma regra de antes: pasta restrita aparece na listagem, mas não
  // desce nela pra ver o que tem dentro.
  async function walk(parentId: string | null) {
    const files = filesByFolder.get(parentId) ?? [];
    for (const file of files) {
      resultFiles.push({ ...toFileInfo(file), folderId: file.folderId });
    }

    const children = childrenByParent.get(parentId) ?? [];
    for (const folder of children) {
      let groupName: string | null = null;
      let hasAccess = true;
      if (folder.restrictedToGroupId) {
        if (!groupNameCache.has(folder.restrictedToGroupId)) {
          const group = await getGroupById(folder.restrictedToGroupId);
          groupNameCache.set(folder.restrictedToGroupId, group?.name ?? null);
        }
        groupName = groupNameCache.get(folder.restrictedToGroupId) ?? null;
        hasAccess = await resolveAccess(folder);
      }
      resultFolders.push({ ...toFolderInfo(folder, hasAccess, groupName), parentId: folder.parentId });
      if (hasAccess) {
        await walk(folder.id);
      }
    }
  }

  await walk(null);

  return { folders: resultFolders, files: resultFiles };
}

export interface FolderStorageBreakdown {
  folderId: string | null;
  folderName: string;
  totalBytes: number;
  fileCount: number;
}

/**
 * Soma o tamanho de todo arquivo por pasta de NÍVEL RAIZ (recursivamente
 * — inclui subpasta) — parte pura, sem banco, fácil de testar. Separada
 * de getStorageByTopFolder só pra isso.
 */
export function computeStorageByTopFolder(
  folders: { id: string; name: string; parentId: string | null }[],
  files: { folderId: string | null; fileSize: number | null }[]
): FolderStorageBreakdown[] {
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const topAncestorCache = new Map<string, string | null>();

  function findTopAncestor(folderId: string | null): string | null {
    if (folderId === null) return null;
    if (topAncestorCache.has(folderId)) return topAncestorCache.get(folderId)!;
    // Marca ANTES de recursar, mesma proteção contra referência circular
    // usada em outros lugares deste arquivo.
    topAncestorCache.set(folderId, folderId);
    const folder = folderById.get(folderId);
    const result = folder?.parentId ? findTopAncestor(folder.parentId) : folderId;
    topAncestorCache.set(folderId, result);
    return result;
  }

  const totals = new Map<string | null, { bytes: number; count: number }>();
  for (const file of files) {
    const topId = findTopAncestor(file.folderId);
    const current = totals.get(topId) ?? { bytes: 0, count: 0 };
    current.bytes += file.fileSize || 0;
    current.count += 1;
    totals.set(topId, current);
  }

  const result: FolderStorageBreakdown[] = [];
  for (const [folderId, { bytes, count }] of Array.from(totals)) {
    const folderName = folderId === null ? "Meus arquivos (raiz)" : folderById.get(folderId)?.name ?? "(pasta removida)";
    result.push({ folderId, folderName, totalBytes: bytes, fileCount: count });
  }

  result.sort((a, b) => b.totalBytes - a.totalBytes);
  return result;
}

/**
 * Ideia 6 do Gilvando (indicador de espaço por pasta): ajuda a decidir o
 * que arquivar/limpar quando o espaço do contrato está ficando apertado,
 * em vez de só ver o total geral. Reaproveita getFullFolderTree (mesma
 * consulta que a árvore inteira já usa) em vez de bater no banco de novo.
 */
export async function getStorageByTopFolder(
  contractSlug: string,
  ctx: CloudAccessContext
): Promise<FolderStorageBreakdown[]> {
  const { folders, files } = await getFullFolderTree(contractSlug, ctx);
  return computeStorageByTopFolder(folders, files);
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

/**
 * Busca uma pasta ativa (não excluída) pelo nome dentro de um mesmo pai —
 * comparação sem diferenciar maiúscula/minúscula, já que é assim que a
 * maioria das pessoas espera "nome igual" funcionar. Usada por
 * createFolder pra nunca criar duas pastas com o mesmo nome no mesmo
 * lugar (achado real reportado pelo Gilvando, 11/09: o programa de
 * sincronização estava duplicando pasta inteira ao sincronizar — a causa
 * exata do lado do programa Windows é mais profunda e precisa de uma
 * nova versão pra corrigir de vez, mas tornar a criação no servidor
 * idempotente já fecha o problema imediatamente, sem depender de
 * recompilar/redistribuir nada).
 */
export async function getFolderByNameInParent(
  contractSlug: string,
  parentId: string | null,
  name: string
): Promise<CloudFolderInfo | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const parentCondition = parentId === null ? isNull(cloudFolders.parentId) : eq(cloudFolders.parentId, parentId);
  const rows = await db
    .select()
    .from(cloudFolders)
    .where(and(eq(cloudFolders.contractSlug, contractSlug), parentCondition, isNull(cloudFolders.deletedAt)));

  const match = rows.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase());
  return match ? toFolderInfo(match) : undefined;
}

export async function createFolder(input: {
  id: string;
  contractSlug: string;
  parentId: string | null;
  name: string;
  createdBy: string | null;
  /** undefined = herda do pai (se o pai tiver restrição); null = explicitamente sem restrição. */
  restrictedToGroupId?: string | null;
}): Promise<CloudFolderInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  assertSafeCloudName(input.name);
  // The capacity row is a contract-scoped cross-replica mutex, including root folders.
  return withStorageCapacity(input.contractSlug, 0, async tx => {
    let inherited: string | null = null;
    if (input.parentId) {
      const [parent] = await tx.select().from(cloudFolders).where(and(eq(cloudFolders.id, input.parentId), eq(cloudFolders.contractSlug, input.contractSlug))).for('update');
      if (!parent || parent.deletedAt) throw new Error('Pasta pai não encontrada.');
      inherited = parent.restrictedToGroupId;
    }
    const siblings = await tx.select().from(cloudFolders).where(and(eq(cloudFolders.contractSlug, input.contractSlug),
      input.parentId ? eq(cloudFolders.parentId, input.parentId) : isNull(cloudFolders.parentId), isNull(cloudFolders.deletedAt)));
    const existing = siblings.find(f => f.name.trim().toLowerCase() === input.name.trim().toLowerCase());
    if (existing) return toFolderInfo(existing);
    const restrictedToGroupId = input.restrictedToGroupId === undefined ? inherited : input.restrictedToGroupId;
    await tx.insert(cloudFolders).values({ ...input, restrictedToGroupId });
    const [created] = await tx.select().from(cloudFolders).where(eq(cloudFolders.id, input.id));
    return toFolderInfo(created);
  });
}

export async function renameFolder(id: string, contractSlug: string, name: string): Promise<void> {
  assertSafeCloudName(name);
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await withStorageCapacity(contractSlug, 0, async tx => {
    const [folder] = await tx.select().from(cloudFolders).where(and(eq(cloudFolders.id, id), eq(cloudFolders.contractSlug, contractSlug))).for('update');
    if (!folder || folder.deletedAt) throw new Error('Pasta não encontrada.');
    const siblings = await tx.select().from(cloudFolders).where(and(eq(cloudFolders.contractSlug, contractSlug),
      folder.parentId ? eq(cloudFolders.parentId, folder.parentId) : isNull(cloudFolders.parentId), isNull(cloudFolders.deletedAt)));
    if (siblings.some(f => f.id !== id && f.name.trim().toLowerCase() === name.trim().toLowerCase())) {
      throw new Error('Já existe uma pasta com esse nome neste local.');
    }
    await tx.update(cloudFolders).set({ name: name.trim() }).where(eq(cloudFolders.id, id));
  });
}

export async function createFileRecord(input: {
  id: string;
  contractSlug: string;
  folderId: string | null;
  name: string;
  fileUrl?: string | null;
  r2Key?: string | null;
  fileSize: number;
  reservationId?: string;
  mimeType: string;
  uploadedBy: string | null;
}): Promise<CloudFileInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  assertSafeCloudName(input.name);
  return withStorageCapacity(input.contractSlug, input.fileSize, async tx => {
  if (input.folderId) {
    const [parent] = await tx.select().from(cloudFolders).where(and(eq(cloudFolders.id, input.folderId), eq(cloudFolders.contractSlug, input.contractSlug))).for('update');
    if (!parent || parent.deletedAt) throw new Error('Pasta de destino não encontrada.');
  }
  await tx.insert(cloudFiles).values({
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
  const [row] = await tx.select().from(cloudFiles).where(eq(cloudFiles.id, input.id));
  const created = row ? toFileInfo(row) : undefined;
  if (!created) throw new Error("Failed to read back created file");
  return created;
  }, input.reservationId);
}

export async function renameFile(id: string, contractSlug: string, name: string): Promise<void> {
  assertSafeCloudName(name);
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
// Histórico de versões — enviar de novo não substitui na hora: guarda a
// versão anterior, e o "atual" (cloudFiles) passa a apontar pro conteúdo
// novo. Nada é apagado do R2 até a exclusão definitiva do arquivo.
// ---------------------------------------------------------------------

export interface CloudFileVersionInfo {
  id: string;
  fileId: string;
  fileSize: number | null;
  mimeType: string | null;
  uploadedBy: string | null;
  createdAt: string;
  isCurrent: boolean;
}

export async function uploadNewVersion(
  versionId: string,
  fileId: string,
  contractSlug: string,
  input: { expectedRevision?: string; r2Key?: string | null; fileUrl?: string | null; fileSize: number; reservationId?: string; mimeType: string; uploadedBy: string | null }
): Promise<CloudFileInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return withStorageCapacity(contractSlug, input.fileSize, async tx => {
  const [row] = await tx.select().from(cloudFiles).where(and(eq(cloudFiles.id, fileId), eq(cloudFiles.contractSlug, contractSlug))).for('update');
  const current = row ? toFileInfo(row) : undefined;
  if (current?.deletedAt) throw new Error("Arquivo na lixeira.");
  if (current?.lockedBy && current.lockedBy !== input.uploadedBy && isLockActive(current.lockedBy, current.lockedAt)) throw new Error("Arquivo em edição por outra pessoa.");
  if (!current || current.contractSlug !== contractSlug) throw new Error("Arquivo não encontrado.");

  if (input.expectedRevision && input.expectedRevision !== current.revisionToken) {
    throw new TRPCError({ code: 'CONFLICT', message: 'O arquivo mudou na Nuvem. Sua versão local foi preservada; atualize antes de reenviar.' });
  }
  // Guarda o estado atual como uma versão antiga antes de sobrescrever.
  await tx.insert(cloudFileVersions).values({
    id: versionId,
    fileId,
    r2Key: current.r2Key,
    fileUrl: current.fileUrl,
    fileSize: current.fileSize,
    mimeType: current.mimeType,
    uploadedBy: current.uploadedBy,
    createdAt: current.updatedAt ? new Date(current.updatedAt) : new Date(),
  });

  await tx
    .update(cloudFiles)
    .set({
      r2Key: input.r2Key ?? null,
      fileUrl: input.fileUrl ?? null,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      uploadedBy: input.uploadedBy,
    })
    .where(eq(cloudFiles.id, fileId));

  const [updatedRow] = await tx.select().from(cloudFiles).where(eq(cloudFiles.id, fileId));
  const updated = updatedRow ? toFileInfo(updatedRow) : undefined;
  if (!updated) throw new Error("Failed to read back updated file");
  return updated;
  }, input.reservationId);
}

export async function listFileVersions(fileId: string): Promise<CloudFileVersionInfo[]> {
  const current = await getFileById(fileId);
  if (!current) return [];

  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(cloudFileVersions)
    .where(eq(cloudFileVersions.fileId, fileId))
    .orderBy(desc(cloudFileVersions.createdAt));

  const history: CloudFileVersionInfo[] = rows.map((r) => ({
    id: r.id,
    fileId: r.fileId,
    fileSize: r.fileSize,
    mimeType: r.mimeType,
    uploadedBy: r.uploadedBy,
    createdAt: r.createdAt.toISOString(),
    isCurrent: false,
  }));

  return [
    {
      id: "current",
      fileId,
      fileSize: current.fileSize,
      mimeType: current.mimeType,
      uploadedBy: current.uploadedBy,
      createdAt: current.updatedAt,
      isCurrent: true,
    },
    ...history,
  ];
}

/** URL pra baixar/pré-visualizar uma versão específica (ou a atual). */
export async function getVersionContentInfo(
  fileId: string,
  versionId: string
): Promise<{ r2Key: string | null; fileUrl: string | null; name: string } | undefined> {
  const current = await getFileById(fileId);
  if (!current) return undefined;
  if (versionId === "current") {
    return { r2Key: current.r2Key, fileUrl: current.fileUrl, name: current.name };
  }
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(cloudFileVersions).where(eq(cloudFileVersions.id, versionId));
  const version = rows[0];
  if (!version || version.fileId !== fileId) return undefined;
  return { r2Key: version.r2Key, fileUrl: version.fileUrl, name: current.name };
}

/** Restaura uma versão antiga: o que era "atual" vira mais uma versão no
 * histórico, e a versão escolhida passa a ser a atual. Nada se perde. */
export async function restoreFileVersion(fileId: string, contractSlug: string, versionId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const current = await getFileById(fileId);
  if (!current || current.contractSlug !== contractSlug) throw new Error("Arquivo não encontrado.");

  const rows = await db.select().from(cloudFileVersions).where(eq(cloudFileVersions.id, versionId));
  const version = rows[0];
  if (!version || version.fileId !== fileId) throw new Error("Versão não encontrada.");

  // Arquiva o estado atual antes de restaurar.
  await db.insert(cloudFileVersions).values({
    id: `${versionId}-restore-${Date.now()}`,
    fileId,
    r2Key: current.r2Key,
    fileUrl: current.fileUrl,
    fileSize: current.fileSize,
    mimeType: current.mimeType,
    uploadedBy: current.uploadedBy,
  });

  await db
    .update(cloudFiles)
    .set({
      r2Key: version.r2Key,
      fileUrl: version.fileUrl,
      fileSize: version.fileSize,
      mimeType: version.mimeType,
      uploadedBy: version.uploadedBy,
    })
    .where(eq(cloudFiles.id, fileId));
}

/** Move uma pasta pra dentro de outra (ou pra raiz, se destino for null).
 * Bloqueia mover a pasta pra dentro dela mesma ou de uma de suas próprias
 * subpastas — isso criaria um ciclo impossível de navegar. */
export async function moveFolder(
  id: string,
  contractSlug: string,
  targetFolderId: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (targetFolderId) {
    if (targetFolderId === id) {
      throw new Error("Não é possível mover uma pasta para dentro dela mesma.");
    }
    let current = await getFolderById(targetFolderId);
    let guard = 0;
    while (current && guard < 30) {
      if (current.id === id) {
        throw new Error("Não é possível mover uma pasta para dentro de uma subpasta dela mesma.");
      }
      current = current.parentId ? await getFolderById(current.parentId) : undefined;
      guard++;
    }
  }

  await db
    .update(cloudFolders)
    .set({ parentId: targetFolderId })
    .where(and(eq(cloudFolders.id, id), eq(cloudFolders.contractSlug, contractSlug)));
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
    .set({ deletedAt: new Date(), deletedBy: username, trashBatchId: null })
    .where(and(eq(cloudFiles.id, id), eq(cloudFiles.contractSlug, contractSlug)));
}

export async function restoreFile(id: string, contractSlug: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(cloudFiles)
    .set({ deletedAt: null, deletedBy: null, trashBatchId: null })
    .where(and(eq(cloudFiles.id, id), eq(cloudFiles.contractSlug, contractSlug)));
}

/** Exclui de vez: some do banco. Quem chama é responsável por apagar do R2 antes. */
export async function permanentlyDeleteFile(
  id: string,
  contractSlug: string
): Promise<{ file: CloudFileInfo; versions: (typeof cloudFileVersions.$inferSelect)[] } | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const file = await getFileById(id);
  if (!file || file.contractSlug !== contractSlug) return undefined;
  const versions = await db.select().from(cloudFileVersions).where(eq(cloudFileVersions.fileId, id));
  await db.delete(cloudFiles).where(eq(cloudFiles.id, id));
  await db.delete(cloudFavorites).where(eq(cloudFavorites.fileId, id));
  await db.delete(cloudShares).where(eq(cloudShares.fileId, id));
  await db.delete(cloudFileVersions).where(eq(cloudFileVersions.fileId, id));
  return { file, versions };
}

export async function softDeleteFolder(id: string, contractSlug: string, username: string | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(cloudFolders)
    .set({ deletedAt: new Date(), deletedBy: username, trashBatchId: null })
    .where(and(eq(cloudFolders.id, id), eq(cloudFolders.contractSlug, contractSlug)));
}

export async function restoreFolder(id: string, contractSlug: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await withStorageCapacity(contractSlug, 0, async tx => {
    const [root] = await tx.select().from(cloudFolders).where(and(eq(cloudFolders.id, id), eq(cloudFolders.contractSlug, contractSlug))).for('update');
    if (!root || !root.deletedAt) return;
    if (root.parentId) {
      const [parent] = await tx.select().from(cloudFolders).where(and(eq(cloudFolders.id, root.parentId), eq(cloudFolders.contractSlug, contractSlug)));
      if (!parent || parent.deletedAt) throw new Error('Restaure a pasta pai primeiro.');
    }
    if (root.trashBatchId) {
      await tx.update(cloudFiles).set({ deletedAt: null, deletedBy: null, trashBatchId: null })
        .where(and(eq(cloudFiles.contractSlug, contractSlug), eq(cloudFiles.trashBatchId, root.trashBatchId)));
      await tx.update(cloudFolders).set({ deletedAt: null, deletedBy: null, trashBatchId: null })
        .where(and(eq(cloudFolders.contractSlug, contractSlug), eq(cloudFolders.trashBatchId, root.trashBatchId)));
    } else {
      await tx.update(cloudFolders).set({ deletedAt: null, deletedBy: null })
        .where(and(eq(cloudFolders.id, id), eq(cloudFolders.contractSlug, contractSlug)));
    }
  });
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

  return { folders: folders.map((f) => toFolderInfo(f)), files: files.map(toFileInfo) };
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

  if (!permanent) {
    return withStorageCapacity(contractSlug, 0, async tx => {
      const folders = await tx.select().from(cloudFolders).where(eq(cloudFolders.contractSlug, contractSlug)).for('update');
      const root = folders.find(f => f.id === id);
      if (!root || root.deletedAt) return { r2Keys: [], fileUrls: [] };
      const included = new Set([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const folder of folders) {
          if (!folder.deletedAt && folder.parentId && included.has(folder.parentId) && !included.has(folder.id)) {
            included.add(folder.id); grew = true;
          }
        }
      }
      const batch = randomUUID();
      const change = { deletedAt: new Date(), deletedBy: username, trashBatchId: batch };
      await tx.update(cloudFiles).set(change).where(and(eq(cloudFiles.contractSlug, contractSlug), inArray(cloudFiles.folderId, Array.from(included)), isNull(cloudFiles.deletedAt)));
      await tx.update(cloudFolders).set(change).where(and(eq(cloudFolders.contractSlug, contractSlug), inArray(cloudFolders.id, Array.from(included)), isNull(cloudFolders.deletedAt)));
      return { r2Keys: [], fileUrls: [] };
    });
  }

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

      const versions = await db.select().from(cloudFileVersions).where(eq(cloudFileVersions.fileId, f.id));
      for (const v of versions) {
        if (v.r2Key) removed.r2Keys.push(v.r2Key);
        else if (v.fileUrl) removed.fileUrls.push(v.fileUrl);
      }
      await db.delete(cloudFileVersions).where(eq(cloudFileVersions.fileId, f.id));
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
  sharedWith?: string | null;
  sharedWithGroupId?: string | null;
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
    sharedWith: input.sharedWith ?? null,
    sharedWithGroupId: input.sharedWithGroupId ?? null,
    permission: input.permission,
    expiresAt: input.expiresAt ?? null,
  });
  let groupName: string | null = null;
  if (input.sharedWithGroupId) {
    const group = await getGroupById(input.sharedWithGroupId);
    groupName = group?.name ?? null;
  }
  return {
    id: input.id,
    contractSlug: input.contractSlug,
    fileId: input.fileId ?? null,
    folderId: input.folderId ?? null,
    itemName: input.itemName,
    sharedBy: input.sharedBy,
    sharedWith: input.sharedWith ?? null,
    sharedWithGroupId: input.sharedWithGroupId ?? null,
    sharedWithGroupName: groupName,
    permission: input.permission,
    expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
    createdAt: new Date().toISOString(),
  };
}

/** Compartilhados diretamente com a pessoa, MAIS os compartilhados com
 * qualquer grupo do qual ela seja membro. */
export async function listSharedWithMe(contractSlug: string, username: string): Promise<CloudShareInfo[]> {
  const db = await getDb();
  if (!db) return [];

  const myGroupIds = await getGroupIdsForUsername(contractSlug, username);

  const condition = myGroupIds.length > 0
    ? and(
        eq(cloudShares.contractSlug, contractSlug),
        sql`(${cloudShares.sharedWith} = ${username} OR ${cloudShares.sharedWithGroupId} IN (${sql.join(myGroupIds, sql`, `)}))`
      )
    : and(eq(cloudShares.contractSlug, contractSlug), eq(cloudShares.sharedWith, username));

  const rows = await db.select().from(cloudShares).where(condition).orderBy(desc(cloudShares.createdAt));
  return enrichSharesWithGroupNames(rows);
}

export async function listSharedByMe(contractSlug: string, username: string): Promise<CloudShareInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(cloudShares)
    .where(and(eq(cloudShares.contractSlug, contractSlug), eq(cloudShares.sharedBy, username)))
    .orderBy(desc(cloudShares.createdAt));
  return enrichSharesWithGroupNames(rows);
}

async function enrichSharesWithGroupNames(rows: (typeof cloudShares.$inferSelect)[]): Promise<CloudShareInfo[]> {
  const groupIds = Array.from(new Set(rows.map((r) => r.sharedWithGroupId).filter((v): v is string => !!v)));
  const groupNames = new Map<string, string>();
  for (const id of groupIds) {
    const group = await getGroupById(id);
    if (group) groupNames.set(id, group.name);
  }
  return rows.map((r) => toShareInfo(r, r.sharedWithGroupId ? groupNames.get(r.sharedWithGroupId) ?? null : null));
}

/** Compartilhamentos que dão acesso a este arquivo específico (direto ou via
 * grupo), pra checar permissão. */
export async function getSharesForFile(
  fileId: string,
  contractSlug: string,
  username: string
): Promise<CloudShareInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const myGroupIds = await getGroupIdsForUsername(contractSlug, username);

  const condition = myGroupIds.length > 0
    ? and(
        eq(cloudShares.fileId, fileId),
        sql`(${cloudShares.sharedWith} = ${username} OR ${cloudShares.sharedWithGroupId} IN (${sql.join(myGroupIds, sql`, `)}))`
      )
    : and(eq(cloudShares.fileId, fileId), eq(cloudShares.sharedWith, username));

  const rows = await db.select().from(cloudShares).where(condition);
  return enrichSharesWithGroupNames(rows);
}

export async function getShareById(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(cloudShares).where(eq(cloudShares.id, id));
  return rows[0];
}

export async function revokeShare(id: string, contractSlug: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(cloudShares).where(and(eq(cloudShares.id, id), eq(cloudShares.contractSlug, contractSlug)));
}

// ---------------------------------------------------------------------
// Grupos — setor/cargo/equipe. Compartilhar com um grupo dá acesso a
// todos os membros dele de uma vez.
// ---------------------------------------------------------------------

export async function listGroups(contractSlug: string): Promise<CloudGroupInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const groups = await db.select().from(cloudGroups).where(eq(cloudGroups.contractSlug, contractSlug));
  const result: CloudGroupInfo[] = [];
  for (const g of groups) {
    const members = await listEffectiveGroupMembers(g.id, contractSlug);
    result.push({
      id: g.id,
      contractSlug: g.contractSlug,
      name: g.name,
      autoSetor: g.autoSetor,
      memberCount: members.length,
      createdAt: g.createdAt.toISOString(),
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getGroupById(
  id: string
): Promise<{ id: string; contractSlug: string; name: string; autoSetor: string | null } | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(cloudGroups).where(eq(cloudGroups.id, id));
  return rows[0]
    ? { id: rows[0].id, contractSlug: rows[0].contractSlug, name: rows[0].name, autoSetor: rows[0].autoSetor }
    : undefined;
}

export async function createGroup(
  id: string,
  contractSlug: string,
  name: string,
  autoSetor?: string | null
): Promise<CloudGroupInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const cleanSetor = autoSetor?.trim() || null;
  await db.insert(cloudGroups).values({ id, contractSlug, name: name.trim(), autoSetor: cleanSetor });
  return {
    id,
    contractSlug,
    name: name.trim(),
    autoSetor: cleanSetor,
    memberCount: 0,
    createdAt: new Date().toISOString(),
  };
}

export async function updateGroupAutoSetor(id: string, contractSlug: string, autoSetor: string | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(cloudGroups)
    .set({ autoSetor: autoSetor?.trim() || null })
    .where(and(eq(cloudGroups.id, id), eq(cloudGroups.contractSlug, contractSlug)));
}

export async function deleteGroup(id: string, contractSlug: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(cloudGroupMembers).where(eq(cloudGroupMembers.groupId, id));
  await db.delete(cloudGroups).where(and(eq(cloudGroups.id, id), eq(cloudGroups.contractSlug, contractSlug)));
  // Compartilhamentos que apontavam pra esse grupo ficam órfãos e param de
  // valer sozinhos (o filtro em listSharedWithMe já exige o grupo existir
  // entre os do usuário) — não precisa limpar cloudShares manualmente.
}

/** Membros manuais (adicionados um por um) — sem os automáticos por setor. */
export async function listGroupMembers(groupId: string): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(cloudGroupMembers).where(eq(cloudGroupMembers.groupId, groupId));
  return rows.map((r) => r.username);
}

/** Membros de verdade do grupo: manuais + todo mundo do setor automático
 * (se configurado), sem duplicar quem estiver nos dois. */
export async function listEffectiveGroupMembers(
  groupId: string,
  contractSlug: string
): Promise<CloudGroupMemberInfo[]> {
  const group = await getGroupById(groupId);
  const manual = await listGroupMembers(groupId);
  const result = new Map<string, CloudGroupMemberInfo>();
  for (const username of manual) result.set(username, { username, source: 'manual' });

  if (group?.autoSetor) {
    const bySetor = await listUsernamesBySetor(contractSlug, group.autoSetor);
    for (const username of bySetor) {
      if (!result.has(username)) result.set(username, { username, source: 'auto' });
    }
  }

  return Array.from(result.values()).sort((a, b) => a.username.localeCompare(b.username));
}

export async function addGroupMember(id: string, groupId: string, username: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select()
    .from(cloudGroupMembers)
    .where(and(eq(cloudGroupMembers.groupId, groupId), eq(cloudGroupMembers.username, username)));
  if (existing.length > 0) return; // já é membro, não duplica
  await db.insert(cloudGroupMembers).values({ id, groupId, username });
}

export async function removeGroupMember(groupId: string, username: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(cloudGroupMembers)
    .where(and(eq(cloudGroupMembers.groupId, groupId), eq(cloudGroupMembers.username, username)));
}

/** Grupos dos quais o usuário faz parte — manualmente OU por bater o setor
 * com o setor automático de algum grupo. */
async function getGroupIdsForUsername(contractSlug: string, username: string): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const manualGroups = await db
    .select({ id: cloudGroups.id })
    .from(cloudGroupMembers)
    .innerJoin(cloudGroups, eq(cloudGroupMembers.groupId, cloudGroups.id))
    .where(and(eq(cloudGroupMembers.username, username), eq(cloudGroups.contractSlug, contractSlug)));
  const ids = new Set(manualGroups.map((g) => g.id));

  const account = await getAdminByUsername(username);
  if (account?.setor) {
    const autoGroups = await db
      .select({ id: cloudGroups.id })
      .from(cloudGroups)
      .where(and(eq(cloudGroups.contractSlug, contractSlug), eq(cloudGroups.autoSetor, account.setor)));
    for (const g of autoGroups) ids.add(g.id);
  }

  return Array.from(ids);
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
  if (!db) throw new Error("Database not available");
  await db.insert(cloudStorageConfig).values({ contractSlug, limitBytes: DEFAULT_LIMIT_BYTES, usedBytes: 0 })
    .onDuplicateKeyUpdate({ set: { contractSlug } });
}

type CloudTransaction = Parameters<Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>['transaction']>[0]>[0];

/** Locks capacity and commits metadata + usage together across every replica. */
async function withStorageCapacity<T>(contractSlug: string, bytes: number, write: (tx: CloudTransaction) => Promise<T>, reservationId?: string, committing = true): Promise<T> {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("Tamanho de arquivo inválido.");
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await ensureStorageConfig(contractSlug);
  return db.transaction(async tx => {
    const [config] = await tx.select().from(cloudStorageConfig).where(eq(cloudStorageConfig.contractSlug, contractSlug)).for('update');
    // Trash and previous versions still occupy physical storage.
    const [files] = await tx.select({ total: sql<number>`COALESCE(SUM(${cloudFiles.fileSize}), 0)` }).from(cloudFiles).where(eq(cloudFiles.contractSlug, contractSlug));
    const [versions] = await tx.select({ total: sql<number>`COALESCE(SUM(${cloudFileVersions.fileSize}), 0)` }).from(cloudFileVersions)
      .innerJoin(cloudFiles, eq(cloudFiles.id, cloudFileVersions.fileId)).where(eq(cloudFiles.contractSlug, contractSlug));
    const held = await tx.select().from(cloudStorageReservations).where(eq(cloudStorageReservations.contractSlug, contractSlug)).for('update');
    const active = held.filter(r => r.expiresAt.getTime() > Date.now());
    const own = reservationId ? active.find(r => r.id === reservationId) : undefined;
    if (reservationId && (!own || own.bytes !== bytes)) throw new Error("Reserva de armazenamento expirada. Reinicie o envio.");
    const reservedOthers = active.filter(r => r.id !== reservationId).reduce((sum, r) => sum + r.bytes, 0);
    const used = Number(files.total) + Number(versions.total);
    if (bytes > 0 && used + reservedOthers + bytes > config.limitBytes) throw new Error("Espaço de armazenamento insuficiente.");
    const result = await write(tx);
    if (reservationId) await tx.delete(cloudStorageReservations).where(eq(cloudStorageReservations.id, reservationId));
    await tx.update(cloudStorageConfig).set({ usedBytes: used + (committing ? bytes : 0) }).where(eq(cloudStorageConfig.contractSlug, contractSlug));
    return result;
  }, { isolationLevel: 'read committed' });
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
  await withStorageCapacity(contractSlug, 0, async () => undefined);
  return (await getStorageInfo(contractSlug)).usedBytes;
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

// ---------------------------------------------------------------------
// Migração dos arquivos antigos (Supabase Storage) para o R2
// ---------------------------------------------------------------------

/** Arquivos deste contrato que ainda estão só no Supabase (fileUrl
 * preenchido, r2Key vazio) — o que falta migrar pro R2. */
export async function listFilesNeedingR2Migration(contractSlug: string): Promise<CloudFileInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(cloudFiles)
    .where(
      and(
        eq(cloudFiles.contractSlug, contractSlug),
        isNotNull(cloudFiles.fileUrl),
        isNull(cloudFiles.r2Key),
        isNull(cloudFiles.deletedAt)
      )
    );
  return rows.map(toFileInfo);
}

/** Depois que o conteúdo foi copiado pro R2 por fora, só atualiza o
 * apontamento — deixa de usar o link do Supabase, passa a usar o R2. */
export async function pointFileToR2(id: string, r2Key: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(cloudFiles).set({ r2Key, fileUrl: null }).where(eq(cloudFiles.id, id));
}


export async function reserveStorageCapacity(contractSlug: string, bytes: number, id: string): Promise<void> {
  await withStorageCapacity(contractSlug, bytes, async tx => {
    await tx.delete(cloudStorageReservations).where(and(eq(cloudStorageReservations.contractSlug, contractSlug), sql`${cloudStorageReservations.expiresAt} <= NOW()`));
    await tx.insert(cloudStorageReservations).values({ id, contractSlug, bytes, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) });
  }, undefined, false);
}

export async function releaseStorageReservation(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(cloudStorageReservations).where(eq(cloudStorageReservations.id, id));
}
