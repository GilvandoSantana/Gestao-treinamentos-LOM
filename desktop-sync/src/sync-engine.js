/**
 * Sincronização de pasta local com a Nuvem — versão para o programa de
 * desktop (Node.js puro, sem navegador). Espelha a ESTRUTURA INTEIRA de
 * pastas da Nuvem no computador (igual ao Google Drive: a pasta local é
 * literalmente a Nuvem, navegada pelo Explorador do Windows normal — não
 * tem uma tela própria dentro do programa pra ver pasta por pasta).
 *
 * Limitações conhecidas, por design:
 * - Não sincroniza exclusão: apagar local ou na nuvem não apaga do outro
 *   lado (evita perda de dado por engano)
 * - Não sincroniza renomear pasta/arquivo (aparece como um novo + um órfão)
 * - Pastas restritas a um grupo que a pessoa não participa não descem
 *   (mesma regra de permissão que já existe no navegador)
 * - Em caso de conflito (mudou dos dois lados ao mesmo tempo), o
 *   computador vence — mas nada se perde de verdade, porque a Nuvem já
 *   guarda o conteúdo anterior no histórico de versões
 */

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

// Arquivos que o próprio Windows (ou outros programas) cria sozinho
// dentro de qualquer pasta — nunca fazem sentido subir pra Nuvem, e
// achado real (Gilvando, 01/09): o programa chegou a subir um
// "desktop.ini" pra Nuvem sem ninguém pedir isso.
const IGNORED_FILE_NAMES = new Set(["desktop.ini", "thumbs.db", ".ds_store"]);
function isIgnoredFileName(name) {
  if (IGNORED_FILE_NAMES.has(name.toLowerCase())) return true;
  if (name.startsWith("~$")) return true; // arquivo temporário do Office
  if (name.endsWith(".tmp") || name.endsWith(".temp")) return true;
  return false;
}

const LOCK_DURATION_MS = 2 * 60 * 60 * 1000;
function isLockActiveClient(lockedBy, lockedAt) {
  if (!lockedBy || !lockedAt) return false;
  return Date.now() - new Date(lockedAt).getTime() < LOCK_DURATION_MS;
}

const MAX_FOLDER_DEPTH = 30; // proteção contra loop, não deveria acontecer de verdade

/**
 * @typedef {Object} SyncedFileState
 * @property {string} cloudFileId
 * @property {string} cloudUpdatedAt
 * @property {number} localLastModified
 */

/**
 * @typedef {Object} CloudFileForSync
 * @property {string} id
 * @property {string} name
 * @property {string} updatedAt
 * @property {string|null} lockedBy
 * @property {string|null} lockedAt
 */

/**
 * @typedef {Object} CloudFolderForSync
 * @property {string} id
 * @property {string} name
 * @property {boolean} hasAccess
 */

/**
 * @typedef {Object} SyncCallbacks
 * @property {(folderId: string|null) => Promise<{folders: CloudFolderForSync[], files: CloudFileForSync[]}>} listFolder
 * @property {(fileId: string) => Promise<Buffer>} downloadCloudFile
 * @property {(folderId: string|null, name: string, buffer: Buffer) => Promise<{id: string, updatedAt: string}>} uploadNewFile
 * @property {(fileId: string, buffer: Buffer) => Promise<{updatedAt: string}>} uploadNewVersion
 * @property {(folderId: string|null, name: string) => Promise<{id: string}>} createRemoteFolder
 */

/**
 * Sincroniza só os ARQUIVOS de um nível de pasta (não desce em subpastas —
 * isso é papel de `syncFolderTree`, que chama esta função pra cada pasta).
 * @param {string} localDirPath
 * @param {string} relativePrefix - ex: "" na raiz, "Contratos/2026" numa subpasta
 * @param {string|null} cloudFolderId
 * @param {CloudFileForSync[]} cloudFiles
 * @param {Map<string, SyncedFileState>} knownFiles
 * @param {SyncCallbacks} callbacks
 * @param {string} [currentUsername]
 * @param {Array} log
 */
async function syncFilesInFolder(
  localDirPath,
  relativePrefix,
  cloudFolderId,
  cloudFiles,
  knownFiles,
  callbacks,
  currentUsername,
  log
) {
  const addLog = (message, kind) => {
    log.push({ id: crypto.randomUUID(), time: new Date(), message, kind });
  };
  const keyFor = (name) => (relativePrefix ? `${relativePrefix}/${name}` : name);
  const displayFor = (name) => (relativePrefix ? `${relativePrefix}/${name}` : name);

  const cloudByName = new Map(cloudFiles.map((f) => [f.name, f]));

  let localNames;
  try {
    const entries = await fs.readdir(localDirPath, { withFileTypes: true });
    localNames = entries.filter((e) => e.isFile() && !isIgnoredFileName(e.name)).map((e) => e.name);
  } catch (error) {
    addLog(
      `Falha ao ler a pasta local "${relativePrefix || "/"}": ${error instanceof Error ? error.message : "erro desconhecido"}`,
      "error"
    );
    return;
  }
  const localNameSet = new Set(localNames);

  // --- 1. Arquivos que só existem na nuvem → baixar ---
  for (const [name, cloudFile] of Array.from(cloudByName)) {
    if (localNameSet.has(name)) continue;
    const filePath = path.join(localDirPath, name);
    try {
      const buffer = await callbacks.downloadCloudFile(cloudFile.id);
      await fs.writeFile(filePath, buffer);
      const stat = await fs.stat(filePath);
      knownFiles.set(keyFor(name), {
        cloudFileId: cloudFile.id,
        cloudUpdatedAt: cloudFile.updatedAt,
        localLastModified: stat.mtimeMs,
      });
      addLog(`Baixado "${displayFor(name)}" (novo na Nuvem).`, "download");
    } catch (error) {
      addLog(`Erro ao baixar "${displayFor(name)}": ${error instanceof Error ? error.message : "erro desconhecido"}`, "error");
    }
  }

  // --- 2. Arquivos que só existem localmente → enviar ---
  for (const name of localNames) {
    if (cloudByName.has(name)) continue;
    const filePath = path.join(localDirPath, name);
    try {
      const buffer = await fs.readFile(filePath);
      const result = await callbacks.uploadNewFile(cloudFolderId, name, buffer);
      const stat = await fs.stat(filePath);
      knownFiles.set(keyFor(name), {
        cloudFileId: result.id,
        cloudUpdatedAt: result.updatedAt,
        localLastModified: stat.mtimeMs,
      });
      addLog(`Enviado "${displayFor(name)}" (novo no computador).`, "upload");
    } catch (error) {
      addLog(`Erro ao enviar "${displayFor(name)}": ${error instanceof Error ? error.message : "erro desconhecido"}`, "error");
    }
  }

  // --- 3. Arquivos que existem nos dois lados → comparar e decidir ---
  for (const name of localNames) {
    const cloudFile = cloudByName.get(name);
    if (!cloudFile) continue;
    const filePath = path.join(localDirPath, name);
    const key = keyFor(name);

    const known = knownFiles.get(key);
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch (error) {
      addLog(`Erro ao ler "${displayFor(name)}" localmente: ${error instanceof Error ? error.message : "erro"}`, "error");
      continue;
    }

    if (!known) {
      knownFiles.set(key, {
        cloudFileId: cloudFile.id,
        cloudUpdatedAt: cloudFile.updatedAt,
        localLastModified: stat.mtimeMs,
      });
      continue;
    }

    const localChanged = stat.mtimeMs > known.localLastModified;
    const cloudChanged = cloudFile.updatedAt !== known.cloudUpdatedAt;

    if (!localChanged && !cloudChanged) continue;

    const lockedByOther =
      isLockActiveClient(cloudFile.lockedBy, cloudFile.lockedAt) && cloudFile.lockedBy !== currentUsername;

    if (localChanged && !cloudChanged) {
      if (lockedByOther) {
        addLog(
          `"${displayFor(name)}" está sendo editado por ${cloudFile.lockedBy} — a edição local não foi enviada. Tente de novo depois que a pessoa concluir.`,
          "conflict"
        );
        continue;
      }
      try {
        const buffer = await fs.readFile(filePath);
        const result = await callbacks.uploadNewVersion(cloudFile.id, buffer);
        knownFiles.set(key, {
          cloudFileId: cloudFile.id,
          cloudUpdatedAt: result.updatedAt,
          localLastModified: stat.mtimeMs,
        });
        addLog(`Enviada nova versão de "${displayFor(name)}" (editado no computador).`, "upload");
      } catch (error) {
        addLog(`Erro ao enviar "${displayFor(name)}": ${error instanceof Error ? error.message : "erro"}`, "error");
      }
      continue;
    }

    if (cloudChanged && !localChanged) {
      try {
        const buffer = await callbacks.downloadCloudFile(cloudFile.id);
        await fs.writeFile(filePath, buffer);
        const written = await fs.stat(filePath);
        knownFiles.set(key, {
          cloudFileId: cloudFile.id,
          cloudUpdatedAt: cloudFile.updatedAt,
          localLastModified: written.mtimeMs,
        });
        addLog(`Atualizado "${displayFor(name)}" (editado na Nuvem).`, "download");
      } catch (error) {
        addLog(`Erro ao atualizar "${displayFor(name)}": ${error instanceof Error ? error.message : "erro"}`, "error");
      }
      continue;
    }

    if (lockedByOther) {
      addLog(
        `"${displayFor(name)}" mudou nos dois lados e está sendo editado por ${cloudFile.lockedBy} — nada foi enviado por segurança.`,
        "conflict"
      );
      continue;
    }

    try {
      const buffer = await fs.readFile(filePath);
      const result = await callbacks.uploadNewVersion(cloudFile.id, buffer);
      knownFiles.set(key, {
        cloudFileId: cloudFile.id,
        cloudUpdatedAt: result.updatedAt,
        localLastModified: stat.mtimeMs,
      });
      addLog(
        `"${displayFor(name)}" mudou nos dois lados ao mesmo tempo — mantido o do computador (a versão anterior da Nuvem continua salva no histórico de versões).`,
        "conflict"
      );
    } catch (error) {
      addLog(`Erro ao resolver conflito de "${displayFor(name)}": ${error instanceof Error ? error.message : "erro"}`, "error");
    }
  }
}

/**
 * Sincroniza uma pasta e desce recursivamente em todas as subpastas —
 * tanto as que existem na Nuvem (baixa a estrutura) quanto as que a
 * pessoa criou localmente (sobem como pasta nova na Nuvem).
 * @param {string} localDirPath
 * @param {string|null} cloudFolderId
 * @param {string} relativePrefix
 * @param {Map<string, SyncedFileState>} knownFiles
 * @param {SyncCallbacks} callbacks
 * @param {string} [currentUsername]
 * @param {Array} log
 * @param {number} depth
 */
async function syncFolderTree(
  localDirPath,
  cloudFolderId,
  relativePrefix,
  knownFiles,
  callbacks,
  currentUsername,
  log,
  depth = 0
) {
  const addLog = (message, kind) => {
    log.push({ id: crypto.randomUUID(), time: new Date(), message, kind });
  };

  if (depth > MAX_FOLDER_DEPTH) {
    addLog(`Parei de descer em "${relativePrefix}" — estrutura de pastas fundo demais.`, "error");
    return;
  }

  await fs.mkdir(localDirPath, { recursive: true });

  let listing;
  try {
    listing = await callbacks.listFolder(cloudFolderId);
  } catch (error) {
    addLog(
      `Falha ao consultar a Nuvem em "${relativePrefix || "/"}": ${error instanceof Error ? error.message : "erro desconhecido"}`,
      "error"
    );
    return;
  }

  const cloudFolders = listing.folders;

  await syncFilesInFolder(
    localDirPath,
    relativePrefix,
    cloudFolderId,
    listing.files,
    knownFiles,
    callbacks,
    currentUsername,
    log
  );

  let localEntries;
  try {
    localEntries = await fs.readdir(localDirPath, { withFileTypes: true });
  } catch (error) {
    addLog(`Falha ao ler subpastas de "${relativePrefix || "/"}": ${error instanceof Error ? error.message : "erro"}`, "error");
    return;
  }
  const localFolderNames = localEntries.filter((e) => e.isDirectory()).map((e) => e.name);
  const cloudFolderByName = new Map(cloudFolders.map((f) => [f.name, f]));

  // --- Pastas que já existem na Nuvem → garante que existem localmente e desce ---
  for (const folder of cloudFolders) {
    const childLocalPath = path.join(localDirPath, folder.name);
    const childRelative = relativePrefix ? `${relativePrefix}/${folder.name}` : folder.name;

    if (folder.hasAccess === false) {
      // Mesmo comportamento do site: a pasta restrita a um grupo que a
      // pessoa não participa APARECE na listagem, só não dá pra entrar e
      // ver o conteúdo. Cria a pasta vazia, mas nunca desce nela.
      try {
        await fs.mkdir(childLocalPath, { recursive: true });
      } catch (error) {
        addLog(`Erro ao criar a pasta "${childRelative}": ${error instanceof Error ? error.message : "erro"}`, "error");
      }
      continue;
    }

    await syncFolderTree(
      childLocalPath,
      folder.id,
      childRelative,
      knownFiles,
      callbacks,
      currentUsername,
      log,
      depth + 1
    );
  }

  // --- Pastas novas criadas só localmente → cria na Nuvem e sobe o conteúdo ---
  for (const name of localFolderNames) {
    if (cloudFolderByName.has(name)) continue;
    const childLocalPath = path.join(localDirPath, name);
    const childRelative = relativePrefix ? `${relativePrefix}/${name}` : name;
    try {
      const created = await callbacks.createRemoteFolder(cloudFolderId, name);
      addLog(`Criada a pasta "${childRelative}" na Nuvem (nova no computador).`, "upload");
      await syncFolderTree(
        childLocalPath,
        created.id,
        childRelative,
        knownFiles,
        callbacks,
        currentUsername,
        log,
        depth + 1
      );
    } catch (error) {
      addLog(`Erro ao criar a pasta "${childRelative}" na Nuvem: ${error instanceof Error ? error.message : "erro"}`, "error");
    }
  }
}

/**
 * Roda uma passada completa de sincronização, começando na raiz.
 * @param {string} localRootPath
 * @param {Map<string, SyncedFileState>} knownFiles
 * @param {SyncCallbacks} callbacks
 * @param {string} [currentUsername]
 * @returns {Promise<{knownFiles: Map<string, SyncedFileState>, log: Array}>}
 */
async function runSyncTick(localRootPath, knownFiles, callbacks, currentUsername) {
  const log = [];
  const nextKnown = new Map(knownFiles);
  await syncFolderTree(localRootPath, null, "", nextKnown, callbacks, currentUsername, log, 0);
  return { knownFiles: nextKnown, log };
}

module.exports = {
  runSyncTick,
  syncFolderTree,
  syncFilesInFolder,
  isLockActiveClient,
  LOCK_DURATION_MS,
  isIgnoredFileName,
};
