/**
 * Fica de olho em mudanças na pasta sincronizada (usando o aviso nativo do
 * Windows de "algo mudou aqui", não checagem periódica de data) e sobe
 * pra Nuvem o que a PESSOA criou ou editou de verdade — sem confundir com
 * o que o próprio mecanismo de placeholder acabou de criar/baixar
 * sozinho, que não deveria "subir de volta".
 *
 * A parte mais delicada: como saber se um arquivo que acabou de mudar foi
 * a pessoa editando, ou só o processo de hidratação (o CloudFilterHost.exe
 * preenchendo o conteúdo de um placeholder que acabou de ser aberto)?
 * Comparação de TAMANHO resolve isso sem precisar de nenhuma comunicação
 * complicada entre os dois programas: se o tamanho do arquivo local bate
 * exatamente com o que já se sabe que está na Nuvem, é hidratação (ou a
 * própria criação do placeholder) — não uma edição de verdade. Só sobe
 * quando o tamanho é diferente do que a Nuvem já tinha.
 */

const fs = require("fs");
const fsp = require("fs/promises");
// path.win32 explicitamente (não o "path" padrão, que muda de
// comportamento dependendo do sistema operacional que roda o código) —
// este programa só roda no Windows e todo caminho aqui é no formato
// Windows (barra invertida), então força esse comportamento sempre, não
// importa onde o código é executado.
const path = require("path").win32;
const { isIgnoredFileName } = require("./sync-engine");

const DEBOUNCE_MS = 2000;

/**
 * Decide o que fazer com um arquivo local que acabou de mudar, a partir
 * do que já se sabe sobre ele na Nuvem. Função pura, sem tocar em disco
 * nem rede — só a regra de decisão, pra dar pra testar isolado.
 * @param {number} localSize
 * @param {{fileId: string, fileSize: number} | undefined} knownCloudEntry
 * @returns {{action: "new"} | {action: "update", fileId: string} | {action: "skip"}}
 */
function decideUploadAction(localSize, knownCloudEntry) {
  if (!knownCloudEntry) {
    return { action: "new" };
  }
  if (localSize === knownCloudEntry.fileSize) {
    // Mesmo tamanho que a Nuvem já tinha — quase certamente foi o próprio
    // mecanismo de placeholder que acabou de criar ou hidratar esse
    // arquivo, não uma edição de verdade da pessoa.
    return { action: "skip" };
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
async function ensureCloudFolder(relativeFolderPath, deps) {
  const { apiClient, knownCloudFolders, inFlight, onLog } = deps;

  if (!relativeFolderPath || relativeFolderPath === "." || relativeFolderPath === "/") {
    return null; // raiz do contrato — sempre existe
  }
  if (knownCloudFolders.has(relativeFolderPath)) {
    return knownCloudFolders.get(relativeFolderPath);
  }
  if (inFlight.has(relativeFolderPath)) {
    return inFlight.get(relativeFolderPath);
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

  inFlight.set(relativeFolderPath, creationPromise);
  try {
    return await creationPromise;
  } finally {
    inFlight.delete(relativeFolderPath);
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
async function performUpload(action, { name, buffer, folderId, fileId }, apiClient) {
  if (action === "new") {
    const result = await apiClient.uploadNewFile(folderId ?? null, name, buffer);
    return { fileId: result.id };
  }
  await apiClient.uploadNewVersion(fileId, buffer, name);
  return { fileId };
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
function startUploadWatcher({ folderPath, apiClient, getKnownCloudFiles, getKnownCloudFolders, onUploaded, onLog }) {
  const timers = new Map();
  const uploading = new Set();
  const folderCreationInFlight = new Map();

  async function handleChange(relativePath) {
    const name = path.basename(relativePath);
    if (isIgnoredFileName(name)) return;
    if (uploading.has(relativePath)) return; // já está subindo esse mesmo arquivo

    const fullPath = path.join(folderPath, relativePath);
    let stat;
    try {
      stat = await fsp.stat(fullPath);
    } catch {
      // Arquivo foi apagado ou não existe mais — não sincroniza exclusão,
      // de propósito (evita perda de dado por engano), então não faz nada.
      return;
    }

    const key = relativePath.split(path.sep).join("/");

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
    const decision = decideUploadAction(stat.size, known);

    if (decision.action === "skip") return;

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
        const buffer = await fsp.readFile(fullPath);
        const { fileId } = await performUpload("new", { name, buffer, folderId }, apiClient);
        getKnownCloudFiles().set(key, { fileId, fileSize: buffer.length });
        onUploaded(key, fileId, buffer.length);
        onLog(`Enviado "${key}" (novo no computador).`, "upload");
      } else if (decision.action === "update") {
        const buffer = await fsp.readFile(fullPath);
        await performUpload("update", { name, buffer, fileId: decision.fileId }, apiClient);
        getKnownCloudFiles().set(key, { fileId: decision.fileId, fileSize: buffer.length });
        onUploaded(key, decision.fileId, buffer.length);
        onLog(`Enviada nova versão de "${key}" (editado no computador).`, "upload");
      }
    } catch (error) {
      onLog(`Erro ao enviar "${key}": ${error?.message || "erro desconhecido"}`, "error");
    } finally {
      uploading.delete(relativePath);
    }
  }

  let watcher;
  try {
    watcher = fs.watch(folderPath, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
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
    return () => {};
  }

  return () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    watcher.close();
  };
}

module.exports = { decideUploadAction, ensureCloudFolder, performUpload, startUploadWatcher };
