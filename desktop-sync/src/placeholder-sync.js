/**
 * Ponte entre o programa Electron e o CloudFilterHost.exe (o programa
 * auxiliar em C# que fala com a API de "unidade de sincronização" do
 * Windows). O Electron gera a lista de arquivos/pastas da Nuvem (usando o
 * mesmo api-client.js de sempre) e entrega pro CloudFilterHost.exe criar
 * os placeholders — o próprio CloudFilterHost.exe busca o conteúdo de
 * verdade na Nuvem quando o Windows avisa que alguém abriu um arquivo.
 *
 * Cobre os dois lados agora: DOWNLOAD (arquivo aparece, baixa quando
 * abre — CloudFilterHost.exe) e ENVIAR (criar/editar arquivo direto na
 * pasta sobe sozinho — upload-watcher.js, vigiando mudança de arquivo em
 * vez de checar data de modificação periodicamente).
 */

const { spawn } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { startUploadWatcher } = require("./upload-watcher");
const { ApiError } = require("./api-client");

let child = null;
let refreshTimer = null;
let uploadWatcherHandle = null;
// Mapa relativePath -> {fileId, fileSize} do que já se sabe sobre a
// Nuvem — atualizado a cada ciclo de atualização (30s) E logo depois de
// qualquer envio bem-sucedido, e consultado pelo upload-watcher pra
// decidir se um arquivo que mudou é edição de verdade ou só o próprio
// mecanismo de placeholder mexendo.
let knownCloudFiles = new Map();
let knownCloudFolders = new Map();
const MANIFEST_REFRESH_INTERVAL_MS = 30_000;

/** Escreve o manifesto de forma segura contra leitura no meio do
 * caminho: grava num arquivo à parte e troca de nome no fim (operação
 * atômica do sistema de arquivos) — o CloudFilterHost.exe relê esse
 * mesmo arquivo periodicamente, e sem isso poderia pegar um conteúdo
 * incompleto bem na hora de uma reescrita. */
async function writeManifestAtomic(manifestPath, entries) {
  const tempPath = `${manifestPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify({ entries }), "utf-8");
  await fs.rename(tempPath, manifestPath);
}

/** Roda um comando do CloudFilterHost.exe e espera terminar (pro comando
 * "register", que precisa rodar e concluir ANTES de conectar — diferente
 * do "sync-tree", que fica rodando pra sempre). */
function runOneShotCommand(exePath, args, diagLog) {
  return new Promise((resolve) => {
    diagLog(`Executando: ${exePath} ${args.map((a) => `"${a}"`).join(" ")}`);
    const proc = spawn(exePath, args, { windowsHide: true });
    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });
    proc.stderr.on("data", (data) => {
      output += data.toString();
    });
    proc.on("error", (err) => {
      diagLog(`Falha ao executar: ${err.message}`);
      resolve({ success: false, output: err.message });
    });
    proc.on("exit", (code) => {
      for (const line of output.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) diagLog(`(registro) ${trimmed}`);
      }
      resolve({ success: code === 0, output });
    });
  });
}

/** Percorre a Nuvem inteira (todas as subpastas) e monta a lista no mesmo
 * formato que o CloudFilterHost.exe espera no manifesto. */
async function generateManifestEntries(apiClient) {
  const entries = [];

  async function walk(folderId, relativePath) {
    const listing = await apiClient.listFolder(folderId);
    for (const file of listing.files) {
      entries.push({
        relativePath: relativePath ? `${relativePath}\\${file.name}` : file.name,
        fileId: file.id,
        fileSize: file.fileSize || 0,
      });
    }
    for (const folder of listing.folders) {
      const childPath = relativePath ? `${relativePath}\\${folder.name}` : folder.name;
      // Marca a pasta em si (mesmo sem nenhum arquivo direto dentro dela)
      // — sem isso, uma pasta vazia (ou uma pasta cheia de OUTRAS pastas
      // vazias) nunca aparecia no computador, porque o programa só
      // "descobria" uma pasta ao ver um arquivo dentro dela. Achado real
      // (Gilvando, 01/09): a pasta "Pública" sumia por causa disso.
      entries.push({ relativePath: childPath, isFolder: true, folderId: folder.id });

      // Pasta restrita a um grupo que a pessoa não participa: no site,
      // ela APARECE na listagem (meio apagada), só não dá pra entrar e
      // ver o que tem dentro. Replica isso aqui — cria a pasta vazia,
      // mas nunca desce nela pra buscar o conteúdo.
      if (folder.hasAccess === false) continue;
      await walk(folder.id, childPath);
    }
  }

  await walk(null, "");
  return entries;
}

/** Constrói o mapa relativePath -> {fileId, fileSize} a partir das
 * entradas do manifesto (só os arquivos, pastas não têm fileId) — usado
 * pelo upload-watcher pra saber se um arquivo que mudou é edição de
 * verdade ou só o próprio mecanismo de placeholder mexendo. */
function buildKnownCloudFilesMap(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (!entry.isFolder) {
      map.set(entry.relativePath.split("\\").join("/"), { fileId: entry.fileId, fileSize: entry.fileSize });
    }
  }
  return map;
}

/** Constrói o mapa relativePath -> folderId a partir das entradas de
 * pasta do manifesto — usado pelo upload-watcher pra saber se a pasta
 * onde um arquivo novo apareceu já existe de verdade na Nuvem (e, se
 * existir, pra qual ID enviar), em vez de simplesmente assumir "está numa
 * subpasta, então deve ser nova" (bug real: toda subpasta, mesmo as que
 * já existem há tempos, caía nesse caso por engano). */
function buildKnownCloudFoldersMap(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (entry.isFolder) {
      map.set(entry.relativePath.split("\\").join("/"), entry.folderId);
    }
  }
  return map;
}

/** Acha o CloudFilterHost.exe — tanto rodando em desenvolvimento (várias
 * pastas de build possíveis, dependendo de como foi compilado) quanto já
 * empacotado dentro do instalador final. */
function findCloudFilterHostExe() {
  const { app } = require("electron");
  const candidates = [];

  if (app.isPackaged) {
    // Empacotado: vai junto como recurso extra do instalador (configurado
    // no package.json#build.extraResources).
    candidates.push(path.join(process.resourcesPath, "CloudFilterHost", "CloudFilterHost.exe"));
  } else {
    // Desenvolvimento: procura nas pastas de saída mais prováveis do
    // dotnet build/publish, sem assumir qual foi usada.
    const base = path.join(__dirname, "..", "native", "CloudFilterHost", "bin");
    candidates.push(
      path.join(base, "Release", "net8.0-windows10.0.19041.0", "win-x64", "publish", "CloudFilterHost.exe"),
      path.join(base, "Release", "net8.0-windows10.0.19041.0", "win-x64", "CloudFilterHost.exe"),
      path.join(base, "Debug", "net8.0-windows10.0.19041.0", "win-x64", "CloudFilterHost.exe")
    );
  }

  return { candidates };
}

async function findExistingExe(onLog) {
  const { candidates } = findCloudFilterHostExe();
  const fsSync = require("fs");
  const log = onLog || ((msg) => console.log(msg));
  log(`Procurando CloudFilterHost.exe em ${candidates.length} lugar(es) possível(is):`);
  for (const candidate of candidates) {
    const exists = fsSync.existsSync(candidate);
    log(`  ${exists ? "[ACHOU]" : "[não achou]"} ${candidate}`);
    if (exists) return candidate;
  }
  return null;
}

/**
 * Inicia a sincronização por placeholder — gera o manifesto e sobe o
 * CloudFilterHost.exe como um processo que fica rodando em segundo plano.
 * @param {object} opts
 * @param {string} opts.folderPath
 * @param {string} opts.serverUrl
 * @param {string} opts.token
 * @param {import('./api-client').ApiClient} opts.apiClient
 * @param {(message: string, kind: string) => void} opts.onLog
 */
async function startPlaceholderSync({ folderPath, serverUrl, token, apiClient, contractName, onLog, onAuthError }) {
  // Sempre manda pro terminal (visível rodando "npm start") E pro log da
  // tela — dobrado de propósito, porque descobrir "por que o modo novo
  // não ativou" só pelo log da tela às vezes corta informação.
  const diagLog = (msg) => {
    console.log(`[placeholder-sync] ${msg}`);
  };

  const exePath = await findExistingExe(diagLog);
  if (!exePath) {
    onLog(
      "Programa auxiliar (CloudFilterHost.exe) não encontrado em nenhuma das pastas esperadas — a sincronização vai continuar no modo antigo (baixa tudo de uma vez), sem o efeito de \"aparece na hora, baixa quando abre\". Veja o terminal (janela do PowerShell onde rodou \"npm start\") para os caminhos exatos que foram checados.",
      "error"
    );
    return false;
  }
  diagLog(`Usando: ${exePath}`);
  onLog(`Programa auxiliar encontrado: ${exePath}`, "info");

  // Passo que faltava (achado depois de investigar o erro 0x80070186 num
  // teste real, 01/09): CfConnectSyncRoot EXIGE que a pasta já esteja
  // registrada como unidade de sincronização antes de conectar — nos
  // testes manuais isso sempre rodava primeiro (comando "register"
  // separado), mas o programa Electron nunca fazia esse passo sozinho.
  onLog("Registrando a pasta como unidade de sincronização...", "info");
  const displayName = contractName || "Gestão de Controle dos Contratos";
  const registerResult = await runOneShotCommand(exePath, ["register", folderPath, displayName], diagLog);
  if (!registerResult.success) {
    onLog(
      `Não foi possível registrar a pasta (${registerResult.output.trim() || "erro desconhecido"}) — ` +
        "a sincronização vai continuar no modo antigo (baixa tudo de uma vez).",
      "error"
    );
    return false;
  }

  onLog("Consultando a Nuvem para montar a lista de pastas e arquivos...", "info");
  const entries = await generateManifestEntries(apiClient);
  onLog(`${entries.length} arquivo(s) encontrado(s) na Nuvem.`, "info");
  knownCloudFiles = buildKnownCloudFilesMap(entries);
  knownCloudFolders = buildKnownCloudFoldersMap(entries);

  const manifestPath = path.join(os.tmpdir(), `gestao-nuvem-manifest-${Date.now()}.json`);
  await writeManifestAtomic(manifestPath, entries);

  // O CloudFilterHost.exe só consulta a Nuvem uma vez, no momento em que
  // cria os placeholders iniciais — sozinho, ele nunca saberia de um
  // arquivo ou pasta adicionado por OUTRA pessoa depois disso. Esse timer
  // busca a lista de novo periodicamente e reescreve o mesmo arquivo de
  // manifesto; o programa auxiliar relê esse arquivo no mesmo ritmo e cria
  // os placeholders que ainda não existem.
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    try {
      const freshEntries = await generateManifestEntries(apiClient);
      await writeManifestAtomic(manifestPath, freshEntries);

      const freshMap = buildKnownCloudFilesMap(freshEntries);
      const freshFolderMap = buildKnownCloudFoldersMap(freshEntries);

      // Descobre o que sumiu da Nuvem desde a última vez (alguém apagou,
      // aqui ou em outro computador) — pra também apagar localmente.
      // Freio de segurança: se sumiu gente demais de uma vez só, é mais
      // provável ser uma instabilidade temporária (rede, permissão) do
      // que uma exclusão de verdade — não arrisca apagar nada local
      // nesse caso, só avisa (a lista se corrige sozinha no próximo
      // ciclo, se for só uma falha passageira).
      const removedFiles = Array.from(knownCloudFiles.keys()).filter((k) => !freshMap.has(k));
      const removedFolders = Array.from(knownCloudFolders.keys()).filter((k) => !freshFolderMap.has(k));
      const totalRemoved = removedFiles.length + removedFolders.length;
      const totalBefore = knownCloudFiles.size + knownCloudFolders.size;

      if (totalRemoved > 0) {
        const suspicious = totalBefore > 0 && totalRemoved > Math.max(10, totalBefore * 0.5);
        if (suspicious) {
          onLog(
            `A Nuvem mostrou ${totalRemoved} item(ns) a menos de uma vez só — pode ser instabilidade ` +
              "temporária, não apaguei nada localmente por segurança.",
            "error"
          );
        } else {
          for (const key of removedFiles) {
            try {
              await fs.unlink(path.join(folderPath, key.split("/").join(path.sep)));
              onLog(`"${key}" apagado localmente (removido da Nuvem).`, "download");
            } catch {
              // Já não existia local (talvez a própria pessoa também
              // tenha apagado aqui) — tudo bem.
            }
            knownCloudFiles.delete(key);
          }
          for (const key of removedFolders) {
            try {
              await fs.rm(path.join(folderPath, key.split("/").join(path.sep)), { recursive: true, force: true });
              onLog(`Pasta "${key}" apagada localmente (removida da Nuvem).`, "download");
            } catch {
              // Idem.
            }
            knownCloudFolders.delete(key);
          }
        }
      }

      // Atualiza o conhecimento sobre a Nuvem sem apagar registros de
      // arquivo que acabaram de subir por upload e ainda não voltaram
      // nesta busca (evita uma corrida rara onde o upload-watcher "esquece"
      // um arquivo que ele mesmo acabou de enviar).
      for (const [key, value] of freshMap) knownCloudFiles.set(key, value);
      for (const [key, value] of freshFolderMap) knownCloudFolders.set(key, value);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // Token de 30 dias expirou (ou foi revogado) — sem isso, o
        // programa ficaria tentando de novo a cada 30s pra sempre, sem
        // nunca avisar a pessoa que precisa entrar de novo. Para tudo e
        // avisa o processo principal, que reabre a tela de login.
        onLog("Sessão expirada — é preciso entrar de novo.", "error");
        if (onAuthError) onAuthError();
        return;
      }
      onLog(`Falha ao atualizar a lista da Nuvem: ${error?.message || "erro desconhecido"}`, "error");
    }
  }, MANIFEST_REFRESH_INTERVAL_MS);

  uploadWatcherHandle = startUploadWatcher({
    folderPath,
    apiClient,
    getKnownCloudFiles: () => knownCloudFiles,
    getKnownCloudFolders: () => knownCloudFolders,
    onUploaded: () => {},
    onLog,
  });

  return new Promise((resolve) => {
    child = spawn(exePath, ["sync-tree", folderPath, manifestPath, serverUrl, token], {
      windowsHide: true,
    });

    let settled = false;
    let stdoutBuffer = "";

    diagLog(`Executando: ${exePath} sync-tree "${folderPath}" "${manifestPath}" ${serverUrl} <token>`);

    child.stdout.on("data", (data) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Tudo vai pro terminal, sem exceção — é o que mais importa pra
        // diagnosticar quando alguma coisa não sai como esperado.
        diagLog(`(saída do programa auxiliar) ${trimmed}`);
        if (trimmed.startsWith("ERRO")) {
          onLog(trimmed, "error");
        } else if (trimmed.includes("FETCH_DATA")) {
          onLog(trimmed, "download");
        }
        // Primeira linha de "OK: N placeholder(s)" confirma que a
        // criação inicial terminou — a partir daqui o processo continua
        // rodando só esperando os callbacks de abertura de arquivo.
        if (!settled && trimmed.startsWith("OK:") && trimmed.includes("placeholder")) {
          settled = true;
          onLog(
            "Pasta sincronizada — os arquivos aparecem na hora e baixam quando você abrir. " +
              "A Nuvem é consultada de novo a cada 30 segundos, pra pegar arquivo ou pasta que outra pessoa adicionar.",
            "info"
          );
          resolve(true);
        }
      }
    });

    child.stderr.on("data", (data) => {
      const trimmed = data.toString().trim();
      diagLog(`(erro do programa auxiliar) ${trimmed}`);
      onLog(`Erro do programa auxiliar: ${trimmed}`, "error");
    });

    child.on("error", (err) => {
      diagLog(`Falha ao iniciar o processo: ${err.message}`);
      onLog(`Falha ao iniciar o programa auxiliar: ${err.message}`, "error");
      if (!settled) {
        settled = true;
        resolve(false);
      }
    });

    child.on("exit", (code, signal) => {
      diagLog(`Processo encerrou (código ${code}, sinal ${signal}).`);
      if (code !== 0 && code !== null) {
        onLog(`Programa auxiliar encerrou de forma inesperada (código ${code}).`, "error");
      }
      child = null;
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      if (uploadWatcherHandle) {
        uploadWatcherHandle.stop();
        uploadWatcherHandle = null;
      }
      if (!settled) {
        settled = true;
        resolve(false);
      }
    });

    // Não fica esperando pra sempre — se em 30s não confirmar que
    // terminou de criar os placeholders, segue em frente mesmo assim (o
    // processo pode continuar rodando normalmente por trás).
    setTimeout(() => {
      if (!settled) {
        diagLog("30s se passaram sem confirmação de \"OK: N placeholder(s)\" — seguindo em frente mesmo assim.");
        settled = true;
        resolve(true);
      }
    }, 30_000);
  });
}

function stopPlaceholderSync() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (uploadWatcherHandle) {
    uploadWatcherHandle.stop();
    uploadWatcherHandle = null;
  }
  knownCloudFiles = new Map();
  knownCloudFolders = new Map();
  if (child) {
    child.kill();
    child = null;
  }
}

function isPlaceholderSyncRunning() {
  return child !== null;
}

/** Retoma exclusões automáticas depois que o "freio de emergência" pausou
 * por causa de exclusão em massa — chamado quando a pessoa clica em
 * "Sincronizar agora", como uma confirmação explícita de que quer
 * continuar. */
function resumeDeletions() {
  if (uploadWatcherHandle) uploadWatcherHandle.resumeDeletions();
}

module.exports = {
  generateManifestEntries,
  startPlaceholderSync,
  stopPlaceholderSync,
  isPlaceholderSyncRunning,
  resumeDeletions,
  findExistingExe,
};
