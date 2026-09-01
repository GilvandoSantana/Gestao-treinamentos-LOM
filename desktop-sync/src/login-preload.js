const { contextBridge, ipcRenderer } = require("electron");

// Ponte segura entre a tela (HTML/JS, tratado como se fosse uma página web
// comum) e o processo principal (que tem acesso de verdade ao sistema).
// A tela só enxerga estas funções específicas — nunca o Node inteiro.
contextBridge.exposeInMainWorld("desktopSync", {
  getDefaultServerUrl: () => ipcRenderer.invoke("get-default-server-url"),
  login: (serverUrl, username, password) => ipcRenderer.invoke("login", serverUrl, username, password),
  listContracts: () => ipcRenderer.invoke("list-contracts"),
  chooseFolder: () => ipcRenderer.invoke("choose-folder"),
  finishSetup: (contractSlug, folderPath) => ipcRenderer.invoke("finish-setup", contractSlug, folderPath),
});
