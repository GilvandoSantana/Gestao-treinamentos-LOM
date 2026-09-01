const { app, Tray, Menu, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require("electron");
const path = require("path");
const { ApiClient, ApiError } = require("./api-client");
const { runSyncTick } = require("./sync-engine");
const store = require("./store");

const DEFAULT_SERVER_URL = "https://gestao-treinamentos-lom.up.railway.app";
const SYNC_INTERVAL_MS = 20_000;
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

async function init() {
  app.setLoginItemSettings({ openAtLogin: true });
  createTray();

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
      startSyncLoop();
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
  };
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
      stopSyncLoop();
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

ipcMain.handle("choose-folder", async () => {
  const win = loginWindow || settingsWindow;
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
    title: "Escolha a pasta para sincronizar",
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
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
    startSyncLoop();
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
  state.folderPath = result.filePaths[0];
  knownFiles = new Map(); // pasta nova — recomeça o controle de estado do zero
  const config = store.loadConfig() || {};
  store.saveConfig({ ...config, folderPath: state.folderPath });
  broadcastStatus();
});

ipcMain.handle("disconnect", () => {
  stopSyncLoop();
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
