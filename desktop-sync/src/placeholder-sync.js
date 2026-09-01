/**
 * Ponte entre o programa Electron e o CloudFilterHost.exe (o programa
 * auxiliar em C# que fala com a API de "unidade de sincronização" do
 * Windows). O Electron gera a lista de arquivos/pastas da Nuvem (usando o
 * mesmo api-client.js de sempre) e entrega pro CloudFilterHost.exe criar
 * os placeholders — o próprio CloudFilterHost.exe busca o conteúdo de
 * verdade na Nuvem quando o Windows avisa que alguém abriu um arquivo.
 *
 * Só cobre o lado de DOWNLOAD (arquivo aparece, baixa quando abre). O
 * lado de ENVIAR edições de volta pra Nuvem ainda usa o mecanismo antigo
 * (sync-engine.js, baseado em conferir data de modificação) — são duas
 * responsabilidades diferentes, integradas em etapas separadas de
 * propósito.
 */

const { spawn } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");

let child = null;

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
      if (folder.hasAccess === false) continue;
      const childPath = relativePath ? `${relativePath}\\${folder.name}` : folder.name;
      await walk(folder.id, childPath);
    }
  }

  await walk(null, "");
  return entries;
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
async function startPlaceholderSync({ folderPath, serverUrl, token, apiClient, onLog }) {
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

  onLog("Consultando a Nuvem para montar a lista de pastas e arquivos...", "info");
  const entries = await generateManifestEntries(apiClient);
  onLog(`${entries.length} arquivo(s) encontrado(s) na Nuvem.`, "info");

  const manifestPath = path.join(os.tmpdir(), `gestao-nuvem-manifest-${Date.now()}.json`);
  await fs.writeFile(manifestPath, JSON.stringify({ entries }), "utf-8");

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
          onLog("Pasta sincronizada — os arquivos aparecem na hora e baixam quando você abrir.", "info");
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
  if (child) {
    child.kill();
    child = null;
  }
}

function isPlaceholderSyncRunning() {
  return child !== null;
}

module.exports = {
  generateManifestEntries,
  startPlaceholderSync,
  stopPlaceholderSync,
  isPlaceholderSyncRunning,
  findExistingExe,
};
