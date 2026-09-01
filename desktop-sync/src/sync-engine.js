/**
 * Sincronização de pasta local com a Nuvem — versão para o programa de
 * desktop (Node.js puro, sem navegador). É a mesma lógica, testada antes,
 * de client/src/lib/cloud-local-sync.ts — só troca a forma de ler/escrever
 * arquivo (File System Access API do navegador → fs nativo do Node), já
 * que aqui não tem aba nem navegador nenhum rodando.
 *
 * Limitações conhecidas, por design (mesmas da versão do navegador):
 * - Não sincroniza exclusão: apagar local ou na nuvem não apaga do outro
 *   lado (evita perda de dado por engano)
 * - Não desce em subpastas nesta primeira versão — só os arquivos direto
 *   dentro da pasta escolhida
 * - Em caso de conflito (mudou dos dois lados ao mesmo tempo), o
 *   computador vence — mas nada se perde de verdade, porque a Nuvem já
 *   guarda o conteúdo anterior no histórico de versões
 */

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

// Mesma regra de expiração usada no servidor (server/db-cloud.ts) — mantida
// em espelho aqui só pra decidir se vale a pena nem tentar enviar; o
// servidor sempre valida de novo antes de aceitar.
const LOCK_DURATION_MS = 2 * 60 * 60 * 1000;
function isLockActiveClient(lockedBy, lockedAt) {
  if (!lockedBy || !lockedAt) return false;
  return Date.now() - new Date(lockedAt).getTime() < LOCK_DURATION_MS;
}

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
 * @property {number|null} fileSize
 * @property {string|null} mimeType
 * @property {string} updatedAt
 * @property {string|null} lockedBy
 * @property {string|null} lockedAt
 */

/**
 * @typedef {Object} SyncCallbacks
 * @property {() => Promise<CloudFileForSync[]>} listCloudFiles
 * @property {(fileId: string) => Promise<Buffer>} downloadCloudFile
 * @property {(name: string, buffer: Buffer) => Promise<{id: string, updatedAt: string}>} uploadNewFile
 * @property {(fileId: string, buffer: Buffer) => Promise<{updatedAt: string}>} uploadNewVersion
 */

/**
 * Roda uma passada de sincronização entre a pasta local e a pasta da nuvem.
 * @param {string} localDirPath - caminho absoluto da pasta local escolhida
 * @param {Map<string, SyncedFileState>} knownFiles
 * @param {SyncCallbacks} callbacks
 * @param {string} [currentUsername]
 * @returns {Promise<{knownFiles: Map<string, SyncedFileState>, log: Array}>}
 */
async function runSyncTick(localDirPath, knownFiles, callbacks, currentUsername) {
  const log = [];
  const nextKnown = new Map(knownFiles);

  const addLog = (message, kind) => {
    log.push({ id: crypto.randomUUID(), time: new Date(), message, kind });
  };

  let cloudFiles;
  try {
    cloudFiles = await callbacks.listCloudFiles();
  } catch (error) {
    addLog(`Falha ao consultar a Nuvem: ${error instanceof Error ? error.message : "erro desconhecido"}`, "error");
    return { knownFiles: nextKnown, log };
  }
  const cloudByName = new Map(cloudFiles.map((f) => [f.name, f]));

  // Lê a pasta local inteira (só arquivos, ignora subpastas — a
  // sincronização não desce em subpastas nesta primeira versão).
  let localNames;
  try {
    const entries = await fs.readdir(localDirPath, { withFileTypes: true });
    localNames = entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch (error) {
    addLog(`Falha ao ler a pasta local: ${error instanceof Error ? error.message : "erro desconhecido"}`, "error");
    return { knownFiles: nextKnown, log };
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
      nextKnown.set(name, {
        cloudFileId: cloudFile.id,
        cloudUpdatedAt: cloudFile.updatedAt,
        localLastModified: stat.mtimeMs,
      });
      addLog(`Baixado "${name}" (novo na Nuvem).`, "download");
    } catch (error) {
      addLog(`Erro ao baixar "${name}": ${error instanceof Error ? error.message : "erro desconhecido"}`, "error");
    }
  }

  // --- 2. Arquivos que só existem localmente → enviar ---
  for (const name of localNames) {
    if (cloudByName.has(name)) continue;
    const filePath = path.join(localDirPath, name);
    try {
      const buffer = await fs.readFile(filePath);
      const result = await callbacks.uploadNewFile(name, buffer);
      const stat = await fs.stat(filePath);
      nextKnown.set(name, {
        cloudFileId: result.id,
        cloudUpdatedAt: result.updatedAt,
        localLastModified: stat.mtimeMs,
      });
      addLog(`Enviado "${name}" (novo no computador).`, "upload");
    } catch (error) {
      addLog(`Erro ao enviar "${name}": ${error instanceof Error ? error.message : "erro desconhecido"}`, "error");
    }
  }

  // --- 3. Arquivos que existem nos dois lados → comparar e decidir ---
  for (const name of localNames) {
    const cloudFile = cloudByName.get(name);
    if (!cloudFile) continue;
    const filePath = path.join(localDirPath, name);

    const known = nextKnown.get(name);
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch (error) {
      addLog(`Erro ao ler "${name}" localmente: ${error instanceof Error ? error.message : "erro"}`, "error");
      continue;
    }

    if (!known) {
      // Primeira vez que vemos esse nome nos dois lados ao mesmo tempo —
      // assume que já são a mesma coisa, só registra a partir de agora
      // (evita sobrescrever algo sem necessidade logo no primeiro ciclo).
      nextKnown.set(name, {
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
          `"${name}" está sendo editado por ${cloudFile.lockedBy} — a edição local não foi enviada. Tente de novo depois que a pessoa concluir.`,
          "conflict"
        );
        continue;
      }
      try {
        const buffer = await fs.readFile(filePath);
        const result = await callbacks.uploadNewVersion(cloudFile.id, buffer);
        nextKnown.set(name, {
          cloudFileId: cloudFile.id,
          cloudUpdatedAt: result.updatedAt,
          localLastModified: stat.mtimeMs,
        });
        addLog(`Enviada nova versão de "${name}" (editado no computador).`, "upload");
      } catch (error) {
        addLog(`Erro ao enviar "${name}": ${error instanceof Error ? error.message : "erro"}`, "error");
      }
      continue;
    }

    if (cloudChanged && !localChanged) {
      try {
        const buffer = await callbacks.downloadCloudFile(cloudFile.id);
        await fs.writeFile(filePath, buffer);
        const written = await fs.stat(filePath);
        nextKnown.set(name, {
          cloudFileId: cloudFile.id,
          cloudUpdatedAt: cloudFile.updatedAt,
          localLastModified: written.mtimeMs,
        });
        addLog(`Atualizado "${name}" (editado na Nuvem).`, "download");
      } catch (error) {
        addLog(`Erro ao atualizar "${name}": ${error instanceof Error ? error.message : "erro"}`, "error");
      }
      continue;
    }

    if (lockedByOther) {
      addLog(
        `"${name}" mudou nos dois lados e está sendo editado por ${cloudFile.lockedBy} — nada foi enviado por segurança.`,
        "conflict"
      );
      continue;
    }

    // Mudou dos dois lados ao mesmo tempo — o computador vence, mas nada se
    // perde: a versão da nuvem que seria substituída fica guardada no
    // histórico de versões do próprio arquivo.
    try {
      const buffer = await fs.readFile(filePath);
      const result = await callbacks.uploadNewVersion(cloudFile.id, buffer);
      nextKnown.set(name, {
        cloudFileId: cloudFile.id,
        cloudUpdatedAt: result.updatedAt,
        localLastModified: stat.mtimeMs,
      });
      addLog(
        `"${name}" mudou nos dois lados ao mesmo tempo — mantido o do computador (a versão anterior da Nuvem continua salva no histórico de versões).`,
        "conflict"
      );
    } catch (error) {
      addLog(`Erro ao resolver conflito de "${name}": ${error instanceof Error ? error.message : "erro"}`, "error");
    }
  }

  return { knownFiles: nextKnown, log };
}

module.exports = { runSyncTick, isLockActiveClient, LOCK_DURATION_MS };
