const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
// path.win32 explicitamente (não o "path" padrão, que muda de
// comportamento dependendo do sistema operacional que roda o código) —
// este programa só roda no Windows e todo caminho aqui é no formato
// Windows (barra invertida), então força esse comportamento sempre, não
// importa onde o código é executado.
const path = require("path").win32;
// Exceção: walkLocalTree (abaixo) faz LEITURA DE DISCO DE VERDADE —
// pra isso funcionar certo também quando testado fora do Windows (este
// projeto testa em Linux), a resolução do caminho real no disco usa o
// path NATIVO da plataforma, não o win32 forçado acima. O valor
// RELATIVO retornado continua sempre no formato win32 (backslash),
// igual o resto do arquivo espera — só a parte que toca o disco de
// verdade é diferente.
const nativePath = require("path");
const { isIgnoredFileName } = require("./sync-engine");

const { safeLocalPath, safeRelative, isWithin, readJson, writeJsonAtomic } = require("./sync-safety");
const { createDeletionQueue } = require("./deletion-queue");
const DEBOUNCE_MS = 2000;

// "Freio de emergência" contra exclusão em massa — se muita coisa for
// apagada de uma vez num intervalo curto (por exemplo, a pessoa apaga a
// pasta inteira sem querer, ou move ela pra outro lugar), o Windows
// dispara um aviso de exclusão pra cada arquivo lá dentro. Sem essa
// proteção, isso viraria uma exclusão em massa automática na Nuvem — o
// mesmo tipo de risco do incidente de upload em massa (01/09), só que
// pior, porque é exclusão. Passado o limite, para de apagar sozinho até
// a pessoa confirmar clicando em "Sincronizar agora".
const DELETE_BURST_LIMIT = 5;
const DELETE_BURST_WINDOW_MS = 10_000;

/**
 * Decide se mais uma exclusão pode passar, ou se o freio de emergência
 * deve travar por causa de exclusão em massa — função pura (sem estado
 * escondido, sem tocar em disco/rede), pra dar pra testar isolado essa
 * parte mais crítica de toda a funcionalidade de exclusão.
 * @param {number[]} recentTimestamps - horários (Date.now()) das exclusões recentes já processadas
 * @param {number} now - Date.now() da exclusão que está sendo avaliada agora
 * @param {number} [limit] - quantas exclusões tolerar dentro da janela
 * @param {number} [windowMs] - tamanho da janela de tempo, em ms
 * @returns {{allowed: boolean, updatedTimestamps: number[]}}
 */
function checkDeletionBurst(recentTimestamps, now, limit = DELETE_BURST_LIMIT, windowMs = DELETE_BURST_WINDOW_MS) {
  const withinWindow = recentTimestamps.filter((t) => now - t < windowMs);
  withinWindow.push(now);
  const allowed = withinWindow.length <= limit;
  return { allowed, updatedTimestamps: withinWindow };
}

/**
 * Decide o que fazer com um arquivo local que acabou de mudar, a partir
 * do que já se sabe sobre ele na Nuvem. Função pura, sem tocar em disco
 * nem rede — só a regra de decisão, pra dar pra testar isolado.
 * @param {number} localSize
 * @param {{fileId: string, fileSize: number} | undefined} knownCloudEntry
 * @returns {{action: "new"} | {action: "update", fileId: string} | {action: "skip"}}
 */
/**
 * Monta o nome do arquivo de conflito — insere a marcação antes da
 * extensão (ex: "relatorio.docx" -> "relatorio (conflito - PC-JOAO -
 * 2026-09-12 1430).docx"), assim ainda abre certo no programa que
 * normalmente abriria esse tipo de arquivo.
 */
function buildConflictFileName(name) {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  const stamp = new Date()
    .toISOString()
    .slice(0, 23)
    .replace("T", " ")
    .replace(/[:.]/g, "") + "-" + require("crypto").randomUUID().slice(0,8);
  return `${base} (conflito - ${os.hostname()} - ${stamp})${ext}`;
}

/**
 * @param {number} localSize
 * @param {{fileId: string, fileSize: number, updatedAt?: string} | undefined} knownCloudEntry
 * @param {string | undefined} baselineUpdatedAt - o updatedAt que a gente
 *   viu da ÚLTIMA vez que sincronizou este arquivo (upload, ou só uma
 *   observação sem mudança) — usado só pra detectar conflito.
 */
function decideUploadAction(localSize, knownCloudEntry, baselineUpdatedAt, contentChanged = false) {
  if (!knownCloudEntry) {
    return { action: "new" };
  }
  if (localSize === knownCloudEntry.fileSize && !contentChanged) {
    // Mesmo tamanho que a Nuvem já tinha — quase certamente foi o próprio
    // mecanismo de placeholder que acabou de criar ou hidratar esse
    // arquivo, não uma edição de verdade da pessoa.
    return { action: "skip" };
  }
  // Achado real: se alguém (ou o programa em outro computador) editou
  // esse MESMO arquivo pela Nuvem enquanto a pessoa editava localmente,
  // subir por cima sem avisar apagaria uma das duas edições sem
  // ninguém perceber. Detecta isso comparando o "updatedAt" que a
  // Nuvem tinha da ÚLTIMA vez que a gente olhou pra esse arquivo
  // (baselineUpdatedAt) contra o mais recente conhecido agora — se
  // mudou sem ter sido a gente que mudou, é conflito de verdade.
  if (baselineUpdatedAt && knownCloudEntry.updatedAt && baselineUpdatedAt !== knownCloudEntry.updatedAt) {
    return { action: "conflict", fileId: knownCloudEntry.fileId };
  }
  return { action: "update", fileId: knownCloudEntry.fileId };
}

/**
 * Garante que uma pasta (e todos os pais dela que ainda não existirem)
 * exista de verdade na Nuvem, criando o que faltar — sobe recursivamente
 * até achar um ancestral que já existe (ou a raiz). Usa um "cache" de
 * criações em andamento pra nunca criar a mesma pasta duas vezes se dois
 * arquivos dentro dela aparecerem quase ao mesmo tempo.
 * @param {string} relativeFolderPath - caminho com "/" (não separador do SO)
 * @param {{apiClient: import('./api-client').ApiClient, knownCloudFolders: Map<string, string>, inFlight: Map<string, Promise<string|null>>, onLog: (message: string, kind: string) => void}} deps
 * @returns {Promise<string|null>} o id da pasta na Nuvem (null = raiz)
 */
/**
 * Varre a pasta local inteira (recursivamente) e devolve o caminho
 * relativo de cada arquivo e pasta encontrado — usada como rede de
 * segurança periódica, chamada bem menos vezes que o vigia reativo
 * (fs.watch), pra pegar qualquer mudança que ele tenha perdido. Achado
 * real (Gilvando, 14/09): copiar uma pasta com arquivo dentro de uma vez
 * só fez só a pasta aparecer na Nuvem, não o arquivo — o fs.watch com
 * recursive:true é conhecido por, às vezes, não disparar evento pro
 * conteúdo de uma pasta nova criada de uma vez só no Windows (limitação
 * documentada do próprio Node, não bug deste programa). Ignora o mesmo
 * tipo de arquivo/pasta que o vigia reativo já ignora.
 */
async function walkLocalTree(rootPath, currentRelative = "") {
  const results = [];
  // Resolve o caminho de disco de verdade com o path NATIVO da
  // plataforma (ver comentário no topo do arquivo) — currentRelative
  // pode ter backslash (formato win32, vindo de uma chamada recursiva),
  // então separa em segmentos antes de juntar de novo, em vez de deixar
  // o path nativo tentar interpretar a barra invertida sozinho (no
  // Linux/Mac, isso é só um caractere comum, não um separador).
  const segments = currentRelative ? currentRelative.split(path.sep) : [];
  const fullPath = segments.length ? nativePath.join(rootPath, ...segments) : rootPath;
  let entries;
  try {
    entries = await fsp.readdir(fullPath, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (isIgnoredFileName(entry.name) || entry.isSymbolicLink()) continue;
    const relPath = currentRelative ? path.join(currentRelative, entry.name) : entry.name;
    results.push(relPath);
    if (entry.isDirectory()) {
      const nested = await walkLocalTree(rootPath, relPath);
      for (const p of nested) results.push(p);
    }
  }
  return results;
}

async function ensureCloudFolder(relativeFolderPath, deps) {
  const { apiClient, knownCloudFolders, inFlight, onLog } = deps;

  if (!relativeFolderPath || relativeFolderPath === "." || relativeFolderPath === "/") {
    return null; // raiz do contrato — sempre existe
  }
  if (knownCloudFolders.has(relativeFolderPath)) {
    return knownCloudFolders.get(relativeFolderPath);
  }
  const windowsKey = relativeFolderPath.toLowerCase();
  for (const [knownPath, id] of knownCloudFolders) {
    if (knownPath.toLowerCase() === windowsKey) return id;
  }
  if (inFlight.has(windowsKey)) {
    return inFlight.get(windowsKey);
  }

  const parentPath = path.dirname(relativeFolderPath).split(path.sep).join("/");
  const folderName = path.basename(relativeFolderPath);

  const creationPromise = (async () => {
    const parentId = await ensureCloudFolder(parentPath, deps);
    const created = await apiClient.createRemoteFolder(parentId, folderName);
    knownCloudFolders.set(relativeFolderPath, created.id);
    onLog(`Criada a pasta "${relativeFolderPath}" na Nuvem (nova no computador).`, "upload");
    return created.id;
  })();

  inFlight.set(windowsKey, creationPromise);
  try {
    return await creationPromise;
  } finally {
    inFlight.delete(windowsKey);
  }
}

/**
 * Faz a chamada de upload certa (arquivo novo ou nova versão) a partir da
 * decisão já tomada — separado do resto (leitura de arquivo, vigia de
 * mudança) só pra dar pra testar com um apiClient fictício, sem precisar
 * de sistema de arquivos de verdade. Foi assim que achei o bug real
 * (Gilvando, 01/09) de esquecer de passar o nome do arquivo no envio de
 * nova versão — a chamada de "arquivo novo" já passava certo, só a de
 * "nova versão" que ficou faltando.
 * @param {"new" | "update"} action
 * @param {object} params
 * @param {string} params.name
 * @param {Buffer} params.buffer
 * @param {string | null} [params.folderId]
 * @param {string} [params.fileId]
 * @param {import('./api-client').ApiClient} apiClient
 * @returns {Promise<{fileId: string}>}
 */
async function performUpload(action, { name, buffer, localPath, folderId, fileId, expectedRevision }, apiClient) {
  if (localPath && apiClient.uploadLocalFile) {
    const result = await apiClient.uploadLocalFile(localPath, { fileId: action === 'new' ? undefined : fileId, folderId, name, expectedRevision });
    return { fileId: result.id || fileId, updatedAt: result.updatedAt, revisionToken: result.revisionToken };
  }
  if (action === "new") {
    const result = await apiClient.uploadNewFile(folderId ?? null, name, buffer);
    return { fileId: result.id, updatedAt: result.updatedAt, revisionToken: result.revisionToken };
  }
  const result = await apiClient.uploadNewVersion(fileId, buffer, name, undefined, expectedRevision);
  return { fileId, updatedAt: result.updatedAt, revisionToken: result.revisionToken };
}

/**
 * @param {object} opts
 * @param {string} opts.folderPath
 * @param {import('./api-client').ApiClient} opts.apiClient
 * @param {() => Map<string, {fileId: string, fileSize: number}>} opts.getKnownCloudFiles
 * @param {() => Map<string, string>} opts.getKnownCloudFolders
 * @param {(relativePath: string, fileId: string, fileSize: number) => void} opts.onUploaded
 * @param {(message: string, kind: string) => void} opts.onLog
 * @returns {() => void} função pra parar de vigiar
 */
function startUploadWatcher({ folderPath, apiClient, getKnownCloudFiles, getKnownCloudFolders, onUploaded, onLog, journalPath, materializedPath, isSuppressed = () => false }) {
  const timers = new Map();
  const uploading = new Set();
  const folderCreationInFlight = new Map();
  // "updatedAt" da Nuvem que a gente viu da última vez que olhou pra
  // cada arquivo (upload feito pela gente, ou só uma observação sem
  // mudança) — usado só pra detectar conflito (ver decideUploadAction).
  const baselinePath = journalPath ? journalPath + '.baseline.json' : null;
  const baseline = baselinePath ? readJson(baselinePath, {}) : {};
  const conflictPending = new Set(Object.entries(baseline).filter(([,v]) => v.conflict).map(([k]) => k));
  const lastKnownUpdatedAt = new Map(Object.entries(baseline).map(([k,v]) => [k,v.updatedAt]));
  function markSynced(key, entry, stat) {
    conflictPending.delete(key);
    baseline[key] = { ...entry, mtimeMs: stat.mtimeMs, size: stat.size };
    if (entry.updatedAt) lastKnownUpdatedAt.set(key, entry.updatedAt);
    if (baselinePath) writeJsonAtomic(baselinePath, baseline);
  }
  let stopped = false;
  const queue = createDeletionQueue({ journalPath, apiClient, onLog,
    onDeleted: ({ key, id, isFolder }) => {
      const currentId = isFolder ? getKnownCloudFolders().get(key) : getKnownCloudFiles().get(key)?.fileId;
      if (currentId && currentId !== id) return;
      for (const map of [getKnownCloudFiles(), getKnownCloudFolders()]) {
        for (const candidate of map.keys()) {
          if (candidate === key || (isFolder && isWithin(candidate, key))) map.delete(candidate);
        }
      }
    },
  });
  function handleDeletion(relativePath) {
    const key = safeRelative(relativePath);
    if (stopped || isSuppressed(key)) return;
    if (!fs.lstatSync(folderPath).isDirectory()) throw new Error('Pasta sincronizada indisponível; exclusões suspensas.');
    // One folder operation includes its children, including Windows bursts.
    const missing = [...getKnownCloudFolders().keys()].filter(parent => isWithin(key, parent));
    for (const parent of missing.sort((a, b) => a.length - b.length)) {
      try { fs.lstatSync(safeLocalPath(folderPath, parent)); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        queue.enqueue(parent, getKnownCloudFolders().get(parent), true);
        return;
      }
    }
    const file = getKnownCloudFiles().get(key);
    if (file) queue.enqueue(key, file.fileId, false);
    else if (getKnownCloudFolders().has(key)) queue.enqueue(key, getKnownCloudFolders().get(key), true);
  }
  const resumeDeletions = () => queue.retry();
  const retryTimer = setInterval(() => queue.drain().catch(e => onLog(e.message, 'error')), 5000);

  async function handleChange(relativePath) {
    if (stopped) return;
    const key = safeRelative(relativePath);
    if (conflictPending.has(key) || isSuppressed(key) || queue.contains(key) || key.split('/').some(isIgnoredFileName)) return;
    const name = path.basename(relativePath);
    if (isIgnoredFileName(name)) return;
    if (uploading.has(relativePath)) return; // já está subindo esse mesmo arquivo

    const fullPath = safeLocalPath(folderPath, relativePath);
    let stat;
    try {
      stat = await fsp.lstat(fullPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      // Não existe mais no disco — a pessoa apagou (ou moveu) de
      // verdade. Reflete isso na Nuvem também (protegido pelo freio de
      // exclusão em massa acima).
      await handleDeletion(relativePath);
      return;
    }

    if (stat.isDirectory()) {
      // Pasta nova criada direto no computador — garante que ela (e
      // qualquer pai que também falte) existam na Nuvem. Os arquivos que
      // forem colocados dentro dela disparam seus próprios eventos, que
      // agora acham a pasta já resolvida.
      if (getKnownCloudFolders().has(key)) return;
      try {
        await ensureCloudFolder(key, {
          apiClient,
          knownCloudFolders: getKnownCloudFolders(),
          inFlight: folderCreationInFlight,
          onLog,
        });
      } catch (error) {
        onLog(`Erro ao criar a pasta "${key}" na Nuvem: ${error?.message || "erro desconhecido"}`, "error");
      }
      return;
    }

    if (!stat.isFile()) return;

    const known = getKnownCloudFiles().get(key);
    const previous = baseline[key];
    const expectedMtime = previous?.mtimeMs ?? (known?.updatedAt ? new Date(known.updatedAt).getTime() : stat.mtimeMs);
    const changed = Math.abs(stat.mtimeMs - expectedMtime) > 2;
    const decision = decideUploadAction(stat.size, known, previous?.updatedAt, changed);

    if (decision.action === "skip") {
      // Mantém a linha de base em dia mesmo sem upload — é o que permite
      // detectar conflito na PRÓXIMA edição, mesmo que esta seja a
      // primeira vez que a gente olha pra esse arquivo.
      if (known && !previous) markSynced(key, known, stat);
      return;
    }

    uploading.add(relativePath);
    try {
      if (decision.action === "new") {
        // Garante a pasta pai (e os pais dela, recursivamente) antes de
        // enviar — cobre tanto uma pasta que já existia (não faz nada) 
        // quanto uma pasta nova criada junto do arquivo (cria a cadeia
        // inteira automaticamente, em vez de recusar o envio).
        const parentPath = path.dirname(relativePath).split(path.sep).join("/");
        const folderId = await ensureCloudFolder(parentPath, {
          apiClient,
          knownCloudFolders: getKnownCloudFolders(),
          inFlight: folderCreationInFlight,
          onLog,
        });
        const buffer = apiClient.uploadLocalFile ? { length: stat.size } : await fsp.readFile(fullPath);
        const { fileId, updatedAt, revisionToken } = await performUpload("new", { name, buffer, localPath: fullPath, folderId }, apiClient);
        getKnownCloudFiles().set(key, { fileId, fileSize: buffer.length, updatedAt, revisionToken });
        if (updatedAt) lastKnownUpdatedAt.set(key, updatedAt);
        markSynced(key, getKnownCloudFiles().get(key), stat);
        onUploaded(key, fileId, buffer.length);
        onLog(`Enviado "${key}" (novo no computador).`, "upload");
      } else if (decision.action === "update") {
        const buffer = apiClient.uploadLocalFile ? { length: stat.size } : await fsp.readFile(fullPath);
        const { updatedAt, revisionToken } = await performUpload("update", { name, buffer, localPath: fullPath, fileId: decision.fileId, expectedRevision: previous?.revisionToken ?? known?.revisionToken }, apiClient);
        getKnownCloudFiles().set(key, { fileId: decision.fileId, fileSize: buffer.length, updatedAt, revisionToken });
        if (updatedAt) lastKnownUpdatedAt.set(key, updatedAt);
        markSynced(key, getKnownCloudFiles().get(key), stat);
        onUploaded(key, decision.fileId, buffer.length);
        onLog(`Enviada nova versão de "${key}" (editado no computador).`, "upload");
      } else if (decision.action === "conflict") {
        // Achado real: alguém (ou a mesma pessoa, em outro computador)
        // editou este MESMO arquivo pela Nuvem enquanto havia uma edição
        // local pendente aqui — nenhuma das duas edições é "menos
        // importante", então NENHUMA é apagada silenciosamente. A
        // edição local vira um arquivo novo, separado, com o conflito
        // marcado no nome; o nome original volta a refletir a versão da
        // Nuvem no próximo ciclo (a mesma lógica que já materializa
        // arquivo novo vindo de lá).
        const conflictName = buildConflictFileName(name);
        const conflictPath = path.join(path.dirname(fullPath), conflictName);
        await fsp.copyFile(fullPath, conflictPath, fs.constants.COPYFILE_EXCL);

        const parentPath = path.dirname(relativePath).split(path.sep).join("/");
        const folderId = await ensureCloudFolder(parentPath, {
          apiClient,
          knownCloudFolders: getKnownCloudFolders(),
          inFlight: folderCreationInFlight,
          onLog,
        });
        const buffer = apiClient.uploadLocalFile ? { length: stat.size } : await fsp.readFile(conflictPath);
        const { fileId, updatedAt, revisionToken } = await performUpload("new", { name: conflictName, buffer, localPath: conflictPath, folderId }, apiClient);
        const conflictKey = parentPath ? `${parentPath}/${conflictName}` : conflictName;
        getKnownCloudFiles().set(conflictKey, { fileId, fileSize: buffer.length, updatedAt, revisionToken });
        if (updatedAt) lastKnownUpdatedAt.set(conflictKey, updatedAt);
        onUploaded(conflictKey, fileId, buffer.length);
        baseline[key] = { ...known, mtimeMs: stat.mtimeMs, size: stat.size, conflict: true };
        conflictPending.add(key);
        if (baselinePath) writeJsonAtomic(baselinePath, baseline);
        onLog(
          `Conflito em "${key}": alguém mudou esse arquivo na Nuvem ao mesmo tempo que você editava aqui. ` +
            `Sua versão foi salva como "${conflictName}" — a versão da Nuvem volta a aparecer com o nome original.`,
          "conflict"
        );
      }
    } catch (error) {
      onLog(`Erro ao enviar "${key}": ${error?.message || "erro desconhecido"}`, "error");
    } finally {
      uploading.delete(relativePath);
    }
  }

  // Migration baseline: do not upload every pre-existing hydrated file merely
  // because the previous client used creation-time rather than cloud-time metadata.
  // Contents remain untouched; future edits are compared with this persisted stat.
  for (const [key, known] of getKnownCloudFiles()) {
    if (baseline[key]) continue;
    try {
      const stat = fs.lstatSync(safeLocalPath(folderPath, key));
      if (stat.isFile() && stat.size === known.fileSize) {
        baseline[key] = { ...known, mtimeMs: stat.mtimeMs, size: stat.size };
      }
    } catch (error) { if (error.code !== 'ENOENT') onLog(`Não foi possível catalogar "${key}": ${error.message}`, 'error'); }
  }
  if (baselinePath) writeJsonAtomic(baselinePath, baseline);

  let watcher;
  try {
    watcher = fs.watch(folderPath, { recursive: true }, (_eventType, filename) => {
      if (!filename || stopped) return;
      try {
        const key = safeRelative(String(filename));
        if (isSuppressed(key) || key.split('/').some(isIgnoredFileName)) return;
        // Observe absence NOW. A later disk check loses short-lived delete events.
        try { fs.lstatSync(safeLocalPath(folderPath, key)); }
        catch (error) { if (error.code !== 'ENOENT') throw error; handleDeletion(key); }
      } catch (error) { onLog(error.message, 'error'); return; }
      // Debounce por caminho — o Windows costuma disparar vários avisos
      // pra uma única gravação de arquivo; espera as coisas assentarem
      // antes de agir.
      if (timers.has(filename)) clearTimeout(timers.get(filename));
      timers.set(
        filename,
        setTimeout(() => {
          timers.delete(filename);
          handleChange(filename).catch((error) => {
            onLog(`Erro ao verificar "${filename}": ${error?.message || "erro desconhecido"}`, "error");
          });
        }, DEBOUNCE_MS)
      );
    });
  } catch (error) {
    onLog(`Não foi possível vigiar a pasta por mudanças: ${error?.message || "erro desconhecido"}`, "error");
    clearInterval(retryTimer);
    queue.stop();
    return { stop: () => {}, resumeDeletions: () => {}, rescanNow: async () => {} };
  }

  return {
    stop: () => {
      stopped = true;
      clearInterval(retryTimer);
      queue.stop();
      apiClient.cancelTransfers?.();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      watcher.close();
    },
    resumeDeletions,
    hasPendingDeletion: key => queue.contains(key),
    markSynced,
    needsRemoteRefresh: key => conflictPending.has(key),
    isUploading: key => uploading.has(key.split("/").join(path.sep)),
    // Rede de segurança periódica — varre a pasta local inteira e
    // processa qualquer caminho que o vigia reativo (fs.watch) talvez
    // tenha perdido (ver comentário de walkLocalTree). Reaproveita o
    // MESMO handleChange que cada evento normal já usa — sem duplicar
    // nenhuma lógica de decisão (skip/new/update/conflict).
    rescanNow: async () => {
      if (stopped) return;
      // Only materialized paths can imply deletion; not-yet-created placeholders cannot.
      const materialized = materializedPath ? readJson(materializedPath, {}) : {};
      for (const key of Object.keys(materialized)) {
        try { fs.lstatSync(safeLocalPath(folderPath, key)); }
        catch (error) { if (error.code === 'ENOENT') handleDeletion(key); else onLog(error.message, 'error'); }
      }
      await queue.drain();
      const allPaths = await walkLocalTree(folderPath);
      for (const relPath of allPaths) {
        try {
          await handleChange(relPath);
        } catch (error) {
          onLog(`Erro ao verificar "${relPath}" na varredura periódica: ${error?.message || "erro desconhecido"}`, "error");
        }
      }
    },
  };
}

module.exports = {
  decideUploadAction,
  ensureCloudFolder,
  performUpload,
  checkDeletionBurst,
  startUploadWatcher,
  buildConflictFileName,
  walkLocalTree,
};
