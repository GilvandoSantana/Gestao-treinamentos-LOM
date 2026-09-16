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
const { safeLocalPath, safeRelative, validateComponent, RECOVERY_DIRECTORY } = require("./sync-safety");
const crypto = require("crypto");
const { assignWindowsNames } = require('./windows-names');
const { readJson, writeJsonAtomic } = require('./sync-safety');
let generation = 0;
const managedPaths = new Map();
let excludedPaths = [];
function suppress(key) { managedPaths.set(key.toLowerCase(), Date.now() + 30000); }
function isManaged(key) {
  key = key.toLowerCase();
  for (const [p, expiry] of managedPaths) {
    if (expiry < Date.now()) { managedPaths.delete(p); continue; }
    if (key === p || key.startsWith(p + '/')) return true;
  }
  return excludedPaths.some(p => key === p || key.startsWith(p + '/'));
}
const { ApiError } = require("./api-client");

let child = null;
let refreshTimer = null;
let uploadWatcherHandle = null;
// Quantos ciclos do relógio periódico já se passaram — usado só pra
// rodar a varredura completa da pasta local (mais cara que o resto:
// percorre o disco inteiro) a cada RESCAN_EVERY_N_CYCLES ciclos, não
// todo ciclo.
let refreshCycleCount = 0;
const RESCAN_EVERY_N_CYCLES = 6; // ~60s com o intervalo atual de 10s por ciclo
// Mapa relativePath -> {fileId, fileSize} do que já se sabe sobre a
// Nuvem — atualizado a cada ciclo de atualização (30s) E logo depois de
// qualquer envio bem-sucedido, e consultado pelo upload-watcher pra
// decidir se um arquivo que mudou é edição de verdade ou só o próprio
// mecanismo de placeholder mexendo.
let knownCloudFiles = new Map();
let knownCloudFolders = new Map();
// Achado real (Gilvando, 14/09): um arquivo que tinha acabado de subir
// com sucesso foi apagado localmente minutos depois, porque um ciclo de
// atualização não trouxe ele na lista — mesmo com a Nuvem tendo o
// arquivo de verdade. Provavelmente uma instabilidade passageira (o
// próprio log mostrava "fetch failed" por perto), não uma remoção de
// verdade. Pra nunca mais apagar algo local por engano baseado numa
// LEITURA só, exige o mesmo item sumir em vários ciclos SEGUIDOS antes
// de mexer em qualquer coisa local — qualquer aparição do item de volta
// zera a contagem.
const missingFileStreak = new Map();
const missingFolderStreak = new Map();
const CONSECUTIVE_MISSES_BEFORE_DELETE = 3; // ~30s com o intervalo de 10s por ciclo
// Antes 30s — diminuído a pedido do Gilvando (11/09), junto com o
// intervalo equivalente do lado nativo (Program.cs). Mais barato que o
// modo antigo (sync-engine.js): busca a árvore inteira numa chamada só
// (getFullTree), não uma por pasta — então dá pra folgar mais aqui sem
// pesar tanto no servidor.
const MANIFEST_REFRESH_INTERVAL_MS = 10_000;

/** Escreve o manifesto de forma segura contra leitura no meio do
 * caminho: grava num arquivo à parte e troca de nome no fim (operação
 * atômica do sistema de arquivos) — o CloudFilterHost.exe relê esse
 * mesmo arquivo periodicamente, e sem isso poderia pegar um conteúdo
 * incompleto bem na hora de uma reescrita. */
async function writeManifestAtomic(manifestPath, entries) {
  const tempPath = `${manifestPath}.${crypto.randomUUID()}.tmp`;
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
 * formato que o CloudFilterHost.exe espera no manifesto.
 *
 * Antes, isso fazia uma chamada de rede SEPARADA por pasta (uma
 * "caminhada" sequencial, esperando cada resposta antes de pedir a
 * próxima) — lento pra contrato com muitas pastas (achado real, Gilvando:
 * "a resposta da Nuvem pro programa" demorava, mas o mesmo não acontecia
 * no site, que só busca uma pasta de cada vez, sob demanda, nunca a
 * árvore inteira de uma vez). Agora usa getFullTree(), que traz tudo numa
 * chamada só (o servidor resolve a árvore inteira do lado dele, sem
 * ida-e-volta pela rede pra cada pasta) — o caminho de cada item é
 * montado aqui, em memória, subindo a cadeia de pastas-mãe.
 *
 * IMPORTANTE (corrigido depois, achado real — Gilvando, 04/09): usa
 * barra ÚNICA como separador ("\\"), o padrão de verdade do Windows —
 * NÃO a barra dupla que uma versão anterior chegou a usar. A barra dupla
 * funcionava em pasta pequena/testes, mas em pasta com bastante arquivo
 * de verdade (relatado: "carrega tudo e depois só mostra alguns"),
 * provavelmente confundia o agrupamento por pasta que o lado C# faz
 * (Path.GetDirectoryName, que não espera separador duplicado) —
 * inclusive o lado de UPLOAD (upload-watcher.js) sempre usou barra
 * única (via path.sep do Node), e sempre funcionou sem esse problema;
 * a barra dupla no download era uma inconsistência, não uma
 * necessidade real. */
/**
 * @param {import('./api-client').ApiClient} apiClient
 * @param {Set<string>} [excludedFolderIds] - pastas do NÍVEL RAIZ que a
 *   pessoa escolheu não sincronizar (ideia 3 do Gilvando, sincronização
 *   seletiva) — a pasta em si e tudo dentro dela (recursivamente) fica de
 *   fora do manifesto, como se nem existisse na Nuvem.
 */
async function generateManifestEntries(apiClient, excludedFolderIds = new Set(), nameRegistry = {}) {
  const tree = await apiClient.getFullTree();
  const { folders, files, aliases } = assignWindowsNames(tree.folders, tree.files, nameRegistry);

  const folderById = new Map(folders.map((f) => [f.id, f]));
  const pathCache = new Map();
  const visiting = new Set();
  const excludedCache = new Map();

  function isExcluded(folderId) {
    if (!folderId) return false;
    if (excludedCache.has(folderId)) return excludedCache.get(folderId);
    // Marca ANTES de recursar no pai, pra nunca entrar em loop infinito
    // caso o dado venha com uma referência circular por engano.
    excludedCache.set(folderId, false);
    if (excludedFolderIds.has(folderId)) {
      excludedCache.set(folderId, true);
      return true;
    }
    const folder = folderById.get(folderId);
    const parentExcluded = folder?.parentId ? isExcluded(folder.parentId) : false;
    excludedCache.set(folderId, parentExcluded);
    return parentExcluded;
  }

  function pathFor(folderId) {
    if (pathCache.has(folderId)) return pathCache.get(folderId);
    const folder = folderById.get(folderId);
    if (!folder) throw new Error("Pasta pai ausente na árvore da Nuvem.");
    if (visiting.has(folderId)) throw new Error("Ciclo na árvore de pastas.");
    visiting.add(folderId);
    validateComponent(folder.name);
    const parentPath = folder.parentId ? pathFor(folder.parentId) : "";
    const fullPath = parentPath ? `${parentPath}\\${folder.name}` : folder.name;
    visiting.delete(folderId);
    pathCache.set(folderId, fullPath);
    return fullPath;
  }

  const entries = [];
  // Marca cada pasta em si (mesmo sem nenhum arquivo direto dentro dela)
  // — sem isso, uma pasta vazia nunca aparecia no computador. Achado real
  // (Gilvando, 01/09): a pasta "Pública" sumia por causa disso. Pastas
  // restritas (hasAccess:false) o servidor já garante que não trazem
  // filhos junto — aqui só precisa mostrar a pasta em si, vazia.
  for (const folder of folders) {
    if (isExcluded(folder.id)) continue;
    entries.push({ relativePath: pathFor(folder.id), isFolder: true, folderId: folder.id });
  }
  for (const file of files) {
    if (isExcluded(file.folderId)) continue;
    const relativePath = file.folderId ? `${pathFor(file.folderId)}\\${file.name}` : file.name;
    validateComponent(file.name);
    entries.push({ relativePath, fileId: file.id, fileSize: file.fileSize || 0, updatedAt: file.updatedAt, revisionToken: file.revisionToken });
  }

  const seen = new Set();
  for (const entry of entries) {
    const key = safeRelative(entry.relativePath).toLowerCase();
    if (seen.has(key)) throw new Error(`Nomes duplicados para o Windows: ${entry.relativePath}`);
    seen.add(key);
  }
  Object.defineProperty(entries, 'excludedPaths', { value: folders.filter(f => isExcluded(f.id)).map(f => safeRelative(pathFor(f.id)).toLowerCase()) });
  Object.defineProperty(entries, 'aliases', { value: aliases });
  return entries;
}

/** Constrói o mapa relativePath -> {fileId, fileSize} a partir das
 * entradas do manifesto (só os arquivos, pastas não têm fileId) — usado
 * pelo upload-watcher pra saber se um arquivo que mudou é edição de
 * verdade ou só o próprio mecanismo de placeholder mexendo. */
/**
 * Decide quais chaves (arquivo ou pasta) já sumiram da Nuvem vezes
 * suficientes SEGUIDAS pra virar candidata de verdade a apagar
 * localmente — e atualiza o mapa de contagem por fora (efeito colateral
 * de propósito, pra não duplicar o Map a cada chamada). Zera a conta de
 * quem voltou a aparecer, soma 1 de quem sumiu de novo neste ciclo.
 * Achado real (Gilvando, 14/09): um arquivo recém-enviado foi apagado
 * localmente por causa de UMA leitura ruim da Nuvem (provável
 * instabilidade de rede, "fetch failed" no log por perto) — exigir
 * confirmação em vários ciclos seguidos evita repetir isso.
 */
function updateMissingStreaks(removedKeys, presentKeys, streakMap, threshold) {
  for (const key of presentKeys) streakMap.delete(key);
  for (const key of removedKeys) streakMap.set(key, (streakMap.get(key) ?? 0) + 1);
  return removedKeys.filter((k) => (streakMap.get(k) ?? 0) >= threshold);
}

function buildKnownCloudFilesMap(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (!entry.isFolder) {
      map.set(entry.relativePath.split("\\").join("/"), {
        fileId: entry.fileId,
        fileSize: entry.fileSize,
        updatedAt: entry.updatedAt,
        revisionToken: entry.revisionToken,
      });
    }
  }
  return map;
}

/**
 * Descobre quais arquivos são novos ou mudaram na Nuvem DE VERDADE (por
 * outra pessoa, ou pelo mesmo Gilvando em outro computador) — comparando
 * o mapa mais recente contra o que já se sabia antes de atualizar. Não
 * conta um upload que a PRÓPRIA pessoa acabou de fazer aqui como
 * "mudança externa": upload-watcher.js já atualiza knownCloudFiles na
 * hora, então até este ciclo rodar de novo, o "antes" já reflete
 * qualquer envio local recente — só sobra o que veio de fora mesmo.
 * Função pura, sem Electron nem rede, fácil de testar.
 */
function findGenuinelyRemoteChanges(previousMap, freshMap) {
  const added = [];
  const changed = [];
  for (const [key, fresh] of freshMap) {
    const previous = previousMap.get(key);
    if (!previous) {
      added.push(key);
    } else if ((fresh.revisionToken || fresh.updatedAt) !== (previous.revisionToken || previous.updatedAt)) {
      changed.push(key);
    }
  }
  return { added, changed };
}

/**
 * Notificação nativa do Windows quando algo muda na Nuvem sem ter sido a
 * própria pessoa, aqui, agora — sem isso, só aparecia discretamente no
 * histórico da tela de configurações, fácil de não perceber. Some
 * sozinha (comportamento padrão do Windows) e nunca trava a
 * sincronização caso falhe (notificação é só um "extra").
 */
function notifyRemoteChanges(added, changed) {
  const total = added.length + changed.length;
  if (total === 0) return;
  try {
    const { Notification } = require("electron");
    if (total === 1) {
      const [singlePath] = added.length ? added : changed;
      const fileName = singlePath.split("/").pop();
      new Notification({
        title: added.length ? "Novo arquivo na Nuvem" : "Arquivo atualizado na Nuvem",
        body: fileName,
      }).show();
    } else {
      new Notification({
        title: "Mudanças na Nuvem",
        body: `${total} arquivo(s) novo(s) ou atualizado(s) — confira a tela do programa.`,
      }).show();
    }
  } catch {
    // Notificação desativada no Windows, ou qualquer outro motivo — não
    // deveria derrubar a sincronização por causa disso.
  }
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
async function startPlaceholderSync({
  folderPath,
  serverUrl,
  token,
  apiClient,
  contractName,
  username,
  onLog,
  onAuthError,
  getExcludedFolderIds,
}) {
  const sessionGeneration = ++generation;
  let refreshing = false;
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

  // Padrão "nada excluído" se quem chamou não passar nada — mantém o
  // comportamento de sempre pra qualquer código antigo/teste que ainda
  // não conhece esta opção.
  const getExcluded = getExcludedFolderIds || (() => new Set());

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
  const { app } = require("electron");
  const scope = crypto.createHash('sha256').update(JSON.stringify([folderPath.toLowerCase(), serverUrl, apiClient.activeContract, username])).digest('hex');
  const stateDirectory = path.join(app.getPath('userData'), 'sync-state', scope);
  await fs.mkdir(stateDirectory, { recursive: true });
  const namesPath = path.join(stateDirectory, 'windows-names.json');
  const nameRegistry = readJson(namesPath, {});
  const entries = await generateManifestEntries(apiClient, getExcluded(), nameRegistry);
  if (sessionGeneration !== generation) return false;
  writeJsonAtomic(namesPath, nameRegistry);
  if (entries.aliases.length) onLog(`${entries.aliases.length} item(ns) com nomes repetidos preservado(s) com sufixo nuvem no Windows. Todos continuam incluídos na sincronização.`, 'info');
  excludedPaths = entries.excludedPaths;
  onLog(`${entries.length} arquivo(s) encontrado(s) na Nuvem.`, "info");
  let knownCloudFiles = buildKnownCloudFilesMap(entries);
  let knownCloudFolders = buildKnownCloudFoldersMap(entries);

  const manifestPath = path.join(stateDirectory, 'manifest.json');
  const materializedPath = manifestPath + '.materialized.json';
  await writeManifestAtomic(manifestPath, entries);

  // O CloudFilterHost.exe só consulta a Nuvem uma vez, no momento em que
  // cria os placeholders iniciais — sozinho, ele nunca saberia de um
  // arquivo ou pasta adicionado por OUTRA pessoa depois disso. Esse timer
  // busca a lista de novo periodicamente e reescreve o mesmo arquivo de
  // manifesto; o programa auxiliar relê esse arquivo no mesmo ritmo e cria
  // os placeholders que ainda não existem.
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    if (refreshing || sessionGeneration !== generation) return;
    refreshing = true;
    try {
    // Rede de segurança periódica, separada da atualização da lista da
    // Nuvem (própria tentativa/erro, pra uma falha aqui nunca se
    // confundir com falha ao consultar a Nuvem) — roda bem menos vezes,
    // já que percorre a pasta local inteira. Ver walkLocalTree pra mais
    // contexto: cobre o caso de o vigia reativo (fs.watch) não ter
    // percebido um arquivo dentro de uma pasta nova criada de uma vez só
    // (achado real, Gilvando 14/09).
    refreshCycleCount++;
    if (refreshCycleCount % RESCAN_EVERY_N_CYCLES === 0 && uploadWatcherHandle) {
      try {
        await uploadWatcherHandle.rescanNow();
      } catch (error) {
        onLog(`Erro na varredura periódica da pasta local: ${error?.message || "erro desconhecido"}`, "error");
      }
    }

    try {
      const freshEntries = await generateManifestEntries(apiClient, getExcluded(), nameRegistry);
      excludedPaths = freshEntries.excludedPaths;
      if (sessionGeneration !== generation) return;
      writeJsonAtomic(namesPath, nameRegistry);
      await writeManifestAtomic(manifestPath, freshEntries);
      if (sessionGeneration !== generation) return;

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

      const filesToDelete = updateMissingStreaks(
        removedFiles,
        Array.from(freshMap.keys()),
        missingFileStreak,
        CONSECUTIVE_MISSES_BEFORE_DELETE
      );
      const foldersToDelete = updateMissingStreaks(
        removedFolders,
        Array.from(freshFolderMap.keys()),
        missingFolderStreak,
        CONSECUTIVE_MISSES_BEFORE_DELETE
      );
      const totalRemoved = filesToDelete.length + foldersToDelete.length;
      const totalBefore = knownCloudFiles.size + knownCloudFolders.size;

      if (totalRemoved > 0) {
        const suspicious = totalBefore > 0 && totalRemoved > Math.max(10, totalBefore * 0.5);
        if (suspicious) {
          onLog(
            `A Nuvem mostrou ${totalRemoved} item(ns) a menos por ${CONSECUTIVE_MISSES_BEFORE_DELETE} ciclos seguidos — pode ser instabilidade ` +
              "temporária, não apaguei nada localmente por segurança.",
            "error"
          );
        } else {
          for (const key of filesToDelete) {
            if (sessionGeneration !== generation) return;
            try {
              suppress(key);
              const source = safeLocalPath(folderPath, key);
              const destination = safeLocalPath(folderPath, `${RECOVERY_DIRECTORY}/${crypto.randomUUID()}/${key}`);
              await fs.mkdir(path.dirname(destination), { recursive: true });
              await fs.rename(source, destination);
              onLog(`"${key}" preservado em .gescon-recovery (ausente da lista sincronizada).`, "download");
            } catch (error) {
              if (error.code !== "ENOENT") { onLog(`Não foi possível preservar "${key}": ${error.message}`, "error"); continue; }
              // Já não existia local (talvez a própria pessoa também
              // tenha apagado aqui) — tudo bem.
            }
            knownCloudFiles.delete(key);
            missingFileStreak.delete(key);
          }
          for (const key of foldersToDelete) {
            if (sessionGeneration !== generation) return;
            try {
              suppress(key);
              const source = safeLocalPath(folderPath, key);
              const destination = safeLocalPath(folderPath, `${RECOVERY_DIRECTORY}/${crypto.randomUUID()}/${key}`);
              await fs.mkdir(path.dirname(destination), { recursive: true });
              await fs.rename(source, destination);
              onLog(`Pasta "${key}" preservada em .gescon-recovery (ausente da lista sincronizada).`, "download");
            } catch (error) {
              if (error.code !== "ENOENT") { onLog(`Não foi possível preservar "${key}": ${error.message}`, "error"); continue; }
              // Idem.
            }
            knownCloudFolders.delete(key);
            missingFolderStreak.delete(key);
          }
        }
      }

      // Achado/aviso ativo (idem ao aviso de conflito acima): descobre o
      // que é novo ou mudou na Nuvem por conta de outra pessoa (ou do
      // mesmo Gilvando em outro computador) ANTES de atualizar o
      // conhecimento — depois disso o "antes" e o "depois" ficam iguais e
      // não dá mais pra saber o que era genuinamente externo.
      const { added, changed } = findGenuinelyRemoteChanges(knownCloudFiles, freshMap);
      for (const key of freshMap.keys()) { if (uploadWatcherHandle?.needsRemoteRefresh(key) && !changed.includes(key)) changed.push(key); }
      for (const key of changed) {
        if (sessionGeneration !== generation) return;
        if (uploadWatcherHandle?.hasPendingDeletion(key) || uploadWatcherHandle?.isUploading(key)) continue;
        const source = safeLocalPath(folderPath, key);
        try {
          await fs.lstat(source); // Missing locally is a deletion, never a download request.
          suppress(key);
          const fresh = freshMap.get(key);
          const buffer = await apiClient.downloadCloudFile(fresh.fileId);
          const verified = await apiClient.getFileInfo(fresh.fileId);
          if (sessionGeneration !== generation || verified.revisionToken !== fresh.revisionToken) continue;
          const saved = safeLocalPath(folderPath, `${RECOVERY_DIRECTORY}/${crypto.randomUUID()}/${key}`);
          await fs.mkdir(path.dirname(saved), { recursive: true });
          const temp = source + '.' + crypto.randomUUID() + '.tmp';
          await fs.writeFile(temp, buffer, { flag: 'wx' });
          // Preserve the complete old local file, including edits not uploaded yet.
          await fs.rename(source, saved);
          try { await fs.rename(temp, source); }
          catch (error) { await fs.rename(saved, source); throw error; }
          const timestamp = new Date(fresh.updatedAt);
          await fs.utimes(source, timestamp, timestamp);
          uploadWatcherHandle?.markSynced(key, fresh, await fs.stat(source));
          onLog(`"${key}" atualizado; a cópia local anterior está em .gescon-recovery.`, 'download');
        } catch (error) {
          if (error.code !== 'ENOENT') onLog(`Atualização pendente de "${key}": ${error.message}`, 'error');
          // Do not advance baseline on failure: retry on the next manifest.
          freshMap.set(key, knownCloudFiles.get(key));
        }
      }
      notifyRemoteChanges(added, changed);
      for (const key of added) onLog(`"${key}" apareceu na Nuvem (adicionado por outra pessoa ou computador).`, "download");
      for (const key of changed) onLog(`"${key}" foi atualizado na Nuvem (por outra pessoa ou computador).`, "download");

      // Atualiza o conhecimento sobre a Nuvem sem apagar registros de
      // arquivo que acabaram de subir por upload e ainda não voltaram
      // nesta busca (evita uma corrida rara onde o upload-watcher "esquece"
      // um arquivo que ele mesmo acabou de enviar).
      for (const [key, value] of freshMap) knownCloudFiles.set(key, value);
      for (const [key, value] of freshFolderMap) knownCloudFolders.set(key, value);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // Token de 30 dias expirou (ou foi revogado) — sem isso, o
        // programa ficaria tentando de novo a cada ciclo pra sempre, sem
        // nunca avisar a pessoa que precisa entrar de novo. Para tudo e
        // avisa o processo principal, que reabre a tela de login.
        onLog("Sessão expirada — é preciso entrar de novo.", "error");
        if (onAuthError) onAuthError();
        return;
      }
      onLog(`Falha ao atualizar a lista da Nuvem: ${error?.message || "erro desconhecido"}`, "error");
    }
    } finally { refreshing = false; }
  }, MANIFEST_REFRESH_INTERVAL_MS);

  uploadWatcherHandle = startUploadWatcher({
    folderPath,
    apiClient,
    getKnownCloudFiles: () => knownCloudFiles,
    getKnownCloudFolders: () => knownCloudFolders,
    journalPath: path.join(stateDirectory, 'deletions.json'),
    materializedPath,
    isSuppressed: isManaged,
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
              "A Nuvem é consultada de novo a cada 10 segundos, pra pegar arquivo ou pasta que outra pessoa adicionar.",
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
      if (sessionGeneration !== generation) return;
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
  generation++;
  managedPaths.clear();
  excludedPaths = [];
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
  missingFileStreak.clear();
  missingFolderStreak.clear();
  refreshCycleCount = 0;
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
  findGenuinelyRemoteChanges,
  updateMissingStreaks,
};
