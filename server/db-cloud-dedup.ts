/**
 * Limpeza de pastas duplicadas na Nuvem — achado real reportado pelo
 * Gilvando (11/09): antes de cloud.createFolder virar idempotente
 * (server/routers/cloud.ts), o programa de sincronização conseguia criar
 * a mesma pasta duas vezes. Este módulo é a ferramenta de limpeza, pras
 * duplicatas que já existiam quando a correção foi feita — a correção em
 * si não afeta dado já gravado.
 *
 * Desenhado pra ser seguro: a detecção é só leitura (nunca mexe em
 * nada), e a mesclagem manda a pasta duplicada pra LIXEIRA (nunca exclui
 * de vez) — se alguma coisa sair errado, dá pra restaurar e conferir na
 * mão.
 */

import { eq, and, isNull } from "drizzle-orm";
import { cloudFolders } from "../drizzle/schema";
import { getDb } from "./db";
import { listFolderContents, moveFile, moveFolder, softDeleteFolder, getFolderPath } from "./db-cloud";

export interface DuplicateFolderEntry {
  id: string;
  name: string;
  createdAt: Date;
  fileCount: number;
  subfolderCount: number;
}

export interface DuplicateFolderGroup {
  parentId: string | null;
  /** Caminho da pasta-pai, pra mostrar onde essa duplicata está (ex:
   * "Meus arquivos / SSMA"). Vazio = raiz do contrato. */
  parentPath: string;
  name: string;
  /** Mais antiga primeiro — é a que a mesclagem mantém por padrão. */
  entries: DuplicateFolderEntry[];
}

/**
 * Varre todas as pastas ativas de um contrato e agrupa as que têm o
 * MESMO nome (sem diferenciar maiúscula/minúscula) dentro do MESMO pai —
 * exatamente a condição que causava a duplicata. Só leitura.
 */
export async function findDuplicateFolderGroups(contractSlug: string): Promise<DuplicateFolderGroup[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(cloudFolders)
    .where(and(eq(cloudFolders.contractSlug, contractSlug), isNull(cloudFolders.deletedAt)));

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.parentId ?? "__root__"}::${row.name.trim().toLowerCase()}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const result: DuplicateFolderGroup[] = [];
  for (const group of Array.from(groups.values())) {
    if (group.length < 2) continue;

    const sorted = [...group].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const entries: DuplicateFolderEntry[] = [];
    for (const row of sorted) {
      const contents = await listFolderContents(contractSlug, row.id);
      entries.push({
        id: row.id,
        name: row.name,
        createdAt: row.createdAt,
        fileCount: contents.files.length,
        subfolderCount: contents.folders.length,
      });
    }

    const parentPath = sorted[0].parentId
      ? (await getFolderPath(sorted[0].parentId)).map((f) => f.name).join(" / ")
      : "";

    result.push({ parentId: sorted[0].parentId, parentPath, name: sorted[0].name, entries });
  }

  // Mais próximo da raiz primeiro, pra ficar mais fácil de conferir na tela.
  result.sort((a, b) => a.parentPath.length - b.parentPath.length || a.name.localeCompare(b.name));
  return result;
}

/**
 * Move todo o conteúdo de sourceFolderId pra dentro de targetFolderId, e
 * manda sourceFolderId (agora vazia) pra lixeira. Arquivo com nome igual
 * simplesmente move (nome repetido de arquivo é normal no sistema,
 * diferente de pasta) — subpasta com nome igual mescla recursivamente
 * em vez de mover, senão criaria outra duplicata um nível mais pra
 * dentro.
 */
export async function mergeFolderInto(
  sourceFolderId: string,
  targetFolderId: string,
  contractSlug: string,
  username: string | null
): Promise<{ filesMoved: number; foldersMoved: number; foldersMerged: number }> {
  if (sourceFolderId === targetFolderId) {
    return { filesMoved: 0, foldersMoved: 0, foldersMerged: 0 };
  }

  const stats = { filesMoved: 0, foldersMoved: 0, foldersMerged: 0 };

  const [sourceContents, targetContents] = await Promise.all([
    listFolderContents(contractSlug, sourceFolderId),
    listFolderContents(contractSlug, targetFolderId),
  ]);

  for (const file of sourceContents.files) {
    await moveFile(file.id, contractSlug, targetFolderId);
    stats.filesMoved++;
  }

  const targetSubfoldersByName = new Map(targetContents.folders.map((f) => [f.name.trim().toLowerCase(), f]));

  for (const subfolder of sourceContents.folders) {
    const existingMatch = targetSubfoldersByName.get(subfolder.name.trim().toLowerCase());
    if (existingMatch) {
      const nested = await mergeFolderInto(subfolder.id, existingMatch.id, contractSlug, username);
      stats.filesMoved += nested.filesMoved;
      stats.foldersMoved += nested.foldersMoved;
      stats.foldersMerged += nested.foldersMerged + 1;
    } else {
      await moveFolder(subfolder.id, contractSlug, targetFolderId);
      stats.foldersMoved++;
    }
  }

  await softDeleteFolder(sourceFolderId, contractSlug, username);

  return stats;
}
