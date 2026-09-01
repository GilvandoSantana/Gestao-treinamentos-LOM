const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopSync", {
  getStatus: () => ipcRenderer.invoke("get-status"),
  syncNow: () => ipcRenderer.invoke("sync-now"),
  openFolder: () => ipcRenderer.invoke("open-folder"),
  changeFolder: () => ipcRenderer.invoke("change-folder"),
  disconnect: () => ipcRenderer.invoke("disconnect"),
  onStatusUpdate: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("status-update", listener);
    return () => ipcRenderer.removeListener("status-update", listener);
  },
});
