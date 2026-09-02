const { app, Tray, Menu, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { ApiClient, ApiError } = require("./api-client");
const { runSyncTick, isIgnoredFileName } = require("./sync-engine");
const {
  startPlaceholderSync,
  stopPlaceholderSync,
  isPlaceholderSyncRunning,
  resumeDeletions,
} = require("./placeholder-sync");
const { setupAutoUpdater } = require("./auto-updater");
const store = require("./store");

const DEFAULT_SERVER_URL = "https://gestao-treinamentos-lom.up.railway.app";
const SYNC_INTERVAL_MS = 20_000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 horas
const MAX_LOG_ENTRIES = 50;

let tray = null;
let loginWindow = null;
let settingsWindow = null;
let apiClient = null;
let syncTimer = null;
let knownFiles = new Map();

const state = {
  username: null,
  contractName: null,
  folderPath: null,
  isSyncing: false,
  lastSyncAt: null,
  lastError: null,
  log: [],
  // "placeholder" = arquivos aparecem na hora, baixam quando abre (modo
  // novo). "download" = baixa tudo de uma vez (modo antigo, usado quando
  // o programa auxiliar não está disponível). Enquanto for "placeholder",
  // criar/editar arquivo direto na pasta ainda NÃO sobe sozinho — isso é
  // a próxima etapa.
  syncMode: null,
};

// Impede duas cópias do programa rodando ao mesmo tempo — a segunda
// instância simplesmente foca a janela da primeira, em vez de duplicar a
// sincronização (o que poderia causar conflitos de arquivo bobos).
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (settingsWindow) {
      if (settingsWindow.isMinimized()) settingsWindow.restore();
      settingsWindow.show();
      settingsWindow.focus();
    } else {
      openSettingsWindow();
    }
  });

  app.whenReady().then(init);
}

// É um programa de bandeja — fechar todas as janelas não deve encerrar o
// programa (ele continua sincronizando em segundo plano). Só "Sair" no
// menu da bandeja encerra de verdade.
app.on("window-all-closed", (event) => {
  event?.preventDefault?.();
});

// Sem isso, fechar o programa pelo "Sair" do menu da bandeja não avisava
// o CloudFilterHost.exe pra encerrar — ele podia continuar rodando
// escondido em segundo plano mesmo depois do ícone da bandeja sumir,
// e a próxima vez que o programa abrisse tentaria conectar de novo na
// mesma pasta enquanto a instância antiga ainda estivesse lá.
app.on("before-quit", () => {
  stopSync();
});

async function init() {
  app.setLoginItemSettings({ openAtLogin: true });
  createTray();

  const updater = setupAutoUpdater({
    onLog: (message, kind) => {
      pushLog([{ id: `upd-${Date.now()}-${Math.random()}`, time: new Date(), message, kind }]);
      broadcastStatus();
    },
    onUpdateReadyToInstall: async (version) => {
      const { response } = await dialog.showMessageBox({
        type: "info",
        buttons: ["Reiniciar agora", "Depois"],
        defaultId: 0,
        cancelId: 1,
        title: "Atualização pronta",
        message: `Uma nova versão (${version}) do programa foi baixada.`,
        detail: 'Reiniciar agora pra instalar, ou continuar usando esta versão e instalar depois (na próxima vez que fechar o programa pelo "Sair" do menu).',
      });
      if (response === 0) updater.quitAndInstall();
    },
  });
  updater.checkNow();
  setInterval(() => updater.checkNow(), UPDATE_CHECK_INTERVAL_MS);

  const config = store.loadConfig();
  const token = store.loadToken();

  if (config && token) {
    apiClient = new ApiClient(config.serverUrl);
    apiClient.setToken(token);
    if (config.activeContract) apiClient.setActiveContract(config.activeContract);

    try {
      const session = await apiClient.getSession();
      if (!session.isSiteAdmin) throw new Error("sessão inválida");
      state.username = session.username;
      state.contractName = config.contractName || (session.contract ? session.contract : "Todos / conta comum");
      state.folderPath = config.folderPath;

      // Confere de novo a pasta salva antes de sincronizar sozinho — não
      // é só na hora de escolher que isso importa: se a pasta salva de
      // uma sessão anterior virou perigosa por algum motivo (ou já era,
      // de antes desta proteção existir), não inicia nada sozinho sem a
      // pessoa confirmar de novo.
      const safety = config.folderPath ? await checkFolderSafety(config.folderPath) : { safe: true };
      if (!safety.safe) {
        state.lastError = "A pasta salva precisa de confirmação antes de sincronizar de novo — abra o programa e escolha a pasta.";
        openSettingsWindow();
        broadcastStatus();
      } else {
        await startSync();
      }
    } catch (error) {
      // Token expirado (passou dos 30 dias) ou revogado — volta pra tela
      // de login em vez de ficar tentando sincronizar sem sucesso.
      store.clearToken();
      openLoginWindow();
    }
  } else {
    openLoginWindow();
  }
}

function createTray() {
  const iconPath = path.join(__dirname, "assets", "tray-icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip("Sincronização com a Nuvem");
  updateTrayMenu();
  tray.on("click", () => openSettingsWindow());
}

function updateTrayMenu() {
  if (!tray) return;
  const connected = !!apiClient;
  const menu = Menu.buildFromTemplate([
    {
      label: connected ? `Conectado como ${state.username}` : "Não conectado",
      enabled: false,
    },
    { type: "separator" },
    { label: "Abrir", click: () => openSettingsWindow() },
    {
      label: "Sincronizar agora",
      enabled: connected && !state.isSyncing,
      click: () => runSyncNow(),
    },
    { type: "separator" },
    { label: "Sair", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function openLoginWindow() {
  if (loginWindow) {
    loginWindow.show();
    loginWindow.focus();
    return;
  }
  loginWindow = new BrowserWindow({
    width: 440,
    height: 560,
    resizable: false,
    title: "Sincronização com a Nuvem",
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "login-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loginWindow.setMenuBarVisibility(false);
  loginWindow.loadFile(path.join(__dirname, "login.html"));
  loginWindow.on("closed", () => {
    loginWindow = null;
  });
}

function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 420,
    height: 560,
    resizable: false,
    title: "Sincronização com a Nuvem",
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "settings-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, "settings.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function pushLog(entries) {
  if (!entries || entries.length === 0) return;
  state.log = [...entries, ...state.log].slice(0, MAX_LOG_ENTRIES);
}

function broadcastStatus() {
  if (settingsWindow) {
    settingsWindow.webContents.send("status-update", getStatusSnapshot());
  }
  updateTrayMenu();
}

function getStatusSnapshot() {
  return {
    username: state.username,
    contractName: state.contractName,
    folderPath: state.folderPath,
    isSyncing: state.isSyncing,
    lastSyncAt: state.lastSyncAt,
    lastError: state.lastError,
    log: state.log,
    syncMode: state.syncMode,
  };
}

/**
 * Decide qual mecanismo de sincronização usar: o novo (placeholder —
 * arquivo aparece na hora, baixa quando abre) se o programa auxiliar
 * estiver disponível, ou o antigo (baixa tudo de uma vez) como reserva.
 *
 * IMPORTANTE: os dois mecanismos NÃO rodam ao mesmo tempo na mesma pasta
 * de propósito — rodar os dois juntos poderia fazer um achar que o
 * arquivo que o outro está gerenciando mudou e tentar agir em cima dele,
 * criando conflito. Por isso, no modo placeholder, o mecanismo antigo
 * fica completamente desligado — o que significa que criar ou editar um
 * arquivo direto na pasta ainda NÃO sobe sozinho pra Nuvem nesta versão
 * (fica pra próxima etapa).
 */
async function startSync() {
  if (!apiClient || !state.folderPath) return;

  console.log(`[main] Iniciando sincronização da pasta "${state.folderPath}" — tentando o modo placeholder primeiro.`);
  const usedPlaceholder = await startPlaceholderSync({
    folderPath: state.folderPath,
    serverUrl: apiClient.serverUrl,
    token: apiClient.token,
    apiClient,
    contractName: state.contractName,
    onLog: (message, kind) => {
      pushLog([{ id: `ph-${Date.now()}-${Math.random()}`, time: new Date(), message, kind }]);
      broadcastStatus();
    },
    onAuthError: () => {
      stopSync();
      apiClient = null;
      store.clearToken();
      state.lastError = "Sessão expirada. Entre novamente.";
      broadcastStatus();
      openLoginWindow();
    },
  }).catch((error) => {
    pushLog([
      {
        id: `ph-err-${Date.now()}`,
        time: new Date(),
        message: `Falha ao iniciar sincronização por placeholder: ${error?.message || "erro desconhecido"}`,
        kind: "error",
      },
    ]);
    return false;
  });

  if (usedPlaceholder) {
    console.log("[main] Modo placeholder ativado com sucesso.");
    state.syncMode = "placeholder";
    state.lastSyncAt = new Date().toISOString();
    broadcastStatus();
    return;
  }

  // Reserva: mecanismo antigo, baixa tudo de uma vez.
  console.log("[main] Modo placeholder NÃO ativou — caindo pro modo antigo (baixa tudo de uma vez).");
  state.syncMode = "download";
  startSyncLoop();
}

function stopSync() {
  stopPlaceholderSync();
  stopSyncLoop();
  state.syncMode = null;
}

function startSyncLoop() {
  if (syncTimer) clearInterval(syncTimer);
  runSyncNow();
  syncTimer = setInterval(runSyncNow, SYNC_INTERVAL_MS);
}

function stopSyncLoop() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
}

let tickRunning = false;
async function runSyncNow() {
  // No modo placeholder, o programa auxiliar já fica rodando sozinho —
  // rodar o mecanismo antigo por cima da mesma pasta criaria conflito
  // (um mexendo no que o outro está gerenciando). Ainda assim, o clique
  // em "Sincronizar agora" serve pra confirmar e retomar exclusões
  // pausadas pelo freio de segurança (exclusão em massa detectada).
  if (state.syncMode === "placeholder") {
    resumeDeletions();
    return;
  }
  if (tickRunning || !apiClient || !state.folderPath) return;
  tickRunning = true;
  state.isSyncing = true;
  broadcastStatus();

  try {
    const result = await runSyncTick(
      state.folderPath,
      knownFiles,
      {
        listFolder: (folderId) => apiClient.listFolder(folderId),
        downloadCloudFile: (fileId) => apiClient.downloadCloudFile(fileId),
        uploadNewFile: (folderId, name, buffer) => apiClient.uploadNewFile(folderId, name, buffer),
        uploadNewVersion: (fileId, buffer) => apiClient.uploadNewVersion(fileId, buffer),
        createRemoteFolder: (parentId, name) => apiClient.createRemoteFolder(parentId, name),
      },
      state.username
    );
    knownFiles = result.knownFiles;
    pushLog(result.log);
    state.lastSyncAt = new Date().toISOString();
    state.lastError = null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // Token expirou ou foi revogado no meio do caminho — para de tentar
      // e pede login de novo, em vez de martelar erro a cada 20 segundos.
      stopSync();
      apiClient = null;
      store.clearToken();
      state.lastError = "Sessão expirada. Entre novamente.";
      broadcastStatus();
      openLoginWindow();
      tickRunning = false;
      return;
    }
    state.lastError = error?.message || "Erro desconhecido durante a sincronização.";
    pushLog([{ id: `err-${Date.now()}`, time: new Date(), message: state.lastError, kind: "error" }]);
  } finally {
    state.isSyncing = false;
    tickRunning = false;
    broadcastStatus();
  }
}

// --- IPC: tela de login/configuração ---

ipcMain.handle("get-default-server-url", () => DEFAULT_SERVER_URL);

ipcMain.handle("login", async (_event, serverUrl, username, password) => {
  try {
    const client = new ApiClient(serverUrl);
    const result = await client.login(username, password);
    apiClient = client; // ainda não persistido — só vira definitivo em finish-setup
    state.username = result.username;
    return { ok: true };
  } catch (error) {
    apiClient = null;
    return { ok: false, error: error?.message || "Falha ao entrar." };
  }
});

ipcMain.handle("list-contracts", async () => {
  if (!apiClient) return { ok: false, error: "Não conectado." };
  try {
    const contracts = await apiClient.listContracts();
    return { ok: true, data: contracts };
  } catch (error) {
    // Conta comum (não-administrador) recebe erro de permissão aqui — não
    // é um problema de verdade, só significa que não há escolha de
    // contrato a fazer.
    return { ok: true, data: [] };
  }
});

/**
 * Verificação de segurança antes de aceitar uma pasta pra sincronizar —
 * criada depois de um incidente real (01/09): a pessoa escolheu o próprio
 * Desktop, que já tinha arquivos, e o programa (sem essa checagem) achou
 * que eram "arquivos novos" e enviou tudo pra Nuvem sem avisar ninguém.
 *
 * Duas camadas: bloqueia de vez pastas importantes do sistema (nunca faz
 * sentido sincronizar o Desktop/Documentos/Downloads inteiro), e avisa
 * (sem bloquear, dá pra confirmar) quando a pasta escolhida já tem
 * arquivo dentro — pra pessoa ter certeza de que é a pasta certa antes de
 * qualquer coisa subir pra Nuvem sem querer.
 */
function getKnownSystemFolders() {
  const names = ["desktop", "documents", "downloads", "pictures", "music", "videos", "home"];
  const result = [];
  for (const name of names) {
    try {
      result.push(path.resolve(app.getPath(name)));
    } catch {
      // Alguns nomes podem não existir dependendo da versão do Windows —
      // tudo bem, só pula.
    }
  }
  result.push("C:\\", "C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)", "C:\\Users");
  return result;
}

async function checkFolderSafety(folderPath) {
  const normalized = path.resolve(folderPath).toLowerCase();
  for (const dangerous of getKnownSystemFolders()) {
    if (normalized === dangerous.toLowerCase()) {
      return {
        safe: false,
        blocking: true,
        message:
          `"${folderPath}" é uma pasta importante do sistema — não pode ser usada pra sincronizar. ` +
          `Crie uma pasta nova, só pra isso (por exemplo, dentro de "Meus Documentos").`,
      };
    }
  }

  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const realEntries = entries.filter((e) => !(e.isFile() && isIgnoredFileName(e.name)));
    if (realEntries.length > 0) {
      return {
        safe: false,
        blocking: false,
        message:
          `Essa pasta já tem ${realEntries.length} item(ns) dentro. Continuar vai ENVIAR esses arquivos ` +
          `pra Nuvem, onde outras pessoas da empresa também têm acesso. Tem certeza que é essa mesma pasta?`,
      };
    }
  } catch {
    // Pasta ainda não existe — tudo bem, o programa cria na hora.
  }

  return { safe: true };
}

ipcMain.handle("choose-folder", async () => {
  const win = loginWindow || settingsWindow;
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
    title: "Escolha a pasta para sincronizar",
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const folderPath = result.filePaths[0];
  const safety = await checkFolderSafety(folderPath);
  if (!safety.safe) {
    if (safety.blocking) {
      dialog.showMessageBoxSync(win, { type: "error", title: "Pasta não permitida", message: safety.message });
      return null;
    }
    const { response } = await dialog.showMessageBox(win, {
      type: "warning",
      buttons: ["Cancelar", "Continuar mesmo assim"],
      defaultId: 0,
      cancelId: 0,
      title: "Pasta não está vazia",
      message: safety.message,
    });
    if (response !== 1) return null;
  }

  return folderPath;
});

ipcMain.handle("finish-setup", async (_event, contractSlug, folderPath) => {
  if (!apiClient) return { ok: false, error: "Sessão perdida — feche e tente entrar de novo." };
  try {
    if (contractSlug) apiClient.setActiveContract(contractSlug);

    let contractName = "Todos / conta comum";
    if (contractSlug) {
      try {
        const contracts = await apiClient.listContracts();
        contractName = contracts.find((c) => c.slug === contractSlug)?.name || contractSlug;
      } catch {
        contractName = contractSlug;
      }
    }

    store.saveToken(apiClient.token);
    store.saveConfig({
      serverUrl: apiClient.serverUrl,
      activeContract: contractSlug || null,
      contractName,
      folderPath,
    });

    state.contractName = contractName;
    state.folderPath = folderPath;
    knownFiles = new Map();

    if (loginWindow) {
      loginWindow.close();
    }
    await startSync();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || "Falha ao concluir a configuração." };
  }
});

// --- IPC: tela de status/configurações ---

ipcMain.handle("get-status", () => getStatusSnapshot());

ipcMain.handle("sync-now", () => runSyncNow());

ipcMain.handle("open-folder", () => {
  if (state.folderPath) shell.openPath(state.folderPath);
});

ipcMain.handle("change-folder", async () => {
  const result = await dialog.showOpenDialog(settingsWindow, {
    properties: ["openDirectory", "createDirectory"],
    title: "Escolha a pasta para sincronizar",
  });
  if (result.canceled || result.filePaths.length === 0) return;

  const newFolderPath = result.filePaths[0];
  const safety = await checkFolderSafety(newFolderPath);
  if (!safety.safe) {
    if (safety.blocking) {
      dialog.showMessageBoxSync(settingsWindow, { type: "error", title: "Pasta não permitida", message: safety.message });
      return;
    }
    const { response } = await dialog.showMessageBox(settingsWindow, {
      type: "warning",
      buttons: ["Cancelar", "Continuar mesmo assim"],
      defaultId: 0,
      cancelId: 0,
      title: "Pasta não está vazia",
      message: safety.message,
    });
    if (response !== 1) return;
  }

  // Precisa parar o mecanismo antigo (e o novo, se estiver ativo) antes
  // de trocar — do jeito que estava antes, a pasta mudava mas o processo
  // de sincronização que já estava rodando continuava usando a pasta
  // ANTIGA na memória até o próximo ciclo, o que causou justamente o
  // incidente do Desktop (01/09): a troca de pasta não reiniciava nada.
  stopSync();
  state.folderPath = newFolderPath;
  knownFiles = new Map();
  const config = store.loadConfig() || {};
  store.saveConfig({ ...config, folderPath: state.folderPath });
  await startSync();
  broadcastStatus();
});

ipcMain.handle("disconnect", () => {
  stopSync();
  apiClient = null;
  knownFiles = new Map();
  store.clearAll();
  state.username = null;
  state.contractName = null;
  state.folderPath = null;
  state.log = [];
  state.lastError = null;
  state.lastSyncAt = null;
  if (settingsWindow) settingsWindow.close();
  updateTrayMenu();
  openLoginWindow();
});
