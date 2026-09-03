/**
 * Atualização automática do programa em si (não confundir com a
 * sincronização de arquivos — isso aqui é sobre o próprio
 * "Sincronização com a Nuvem.exe" ficar atualizado sozinho).
 *
 * Usa os Releases do GitHub como fonte — o eletron-updater sabe procurar
 * a versão mais nova publicada lá, comparar com a versão instalada, e
 * baixar/instalar sozinho se houver uma mais nova.
 *
 * IMPORTANTE pra quem for publicar uma versão nova: depois de gerar o
 * instalador (`npm run build:win`), é preciso criar um Release no GitHub
 * (aba "Releases" do repositório) com uma tag no formato "vX.Y.Z" batendo
 * com a versão do `package.json`, e anexar os TRÊS arquivos que saem em
 * `dist-installer/`:
 *   - Sincronização com a Nuvem Setup X.Y.Z.exe
 *   - Sincronização com a Nuvem Setup X.Y.Z.exe.blockmap
 *   - latest.yml
 * Sem os três (principalmente o latest.yml), o programa instalado não
 * consegue saber que existe uma versão nova.
 *
 * Só funciona no programa JÁ INSTALADO (empacotado) — rodando via
 * "npm start" em desenvolvimento, a checagem é pulada de propósito.
 */

function setupAutoUpdater({ onLog, onUpdateReadyToInstall }) {
  const { app } = require("electron");
  if (!app.isPackaged) {
    return { checkNow: () => {} };
  }

  // Carregado só aqui dentro (e só quando empacotado) — evita custo
  // nenhum em desenvolvimento, onde essa checagem nunca roda mesmo.
  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    onLog("Procurando atualização do programa...", "info");
  });

  autoUpdater.on("update-available", (info) => {
    onLog(`Nova versão encontrada (${info.version}) — baixando...`, "info");
  });

  autoUpdater.on("update-not-available", () => {
    onLog("Programa já está na versão mais recente.", "info");
  });

  autoUpdater.on("download-progress", (progress) => {
    onLog(`Baixando atualização: ${Math.round(progress.percent)}%`, "info");
  });

  autoUpdater.on("update-downloaded", (info) => {
    onLog(`Atualização ${info.version} baixada — pronta pra instalar.`, "info");
    onUpdateReadyToInstall(info.version);
  });

  autoUpdater.on("error", (error) => {
    const message = error?.message || "";
    // 404 aqui quase sempre significa "ainda não existe nenhum Release
    // publicado no GitHub" — um estado normal e esperado (não configuramos
    // isso ainda), não um problema de verdade. Sem essa distinção, isso
    // aparecia como "Erro" alarmante toda vez que o programa abria, mesmo
    // sem nada estar errado (achado real, Gilvando 03/09).
    if (message.includes("404")) {
      onLog("Nenhuma versão publicada encontrada ainda (normal, se ainda não foi publicado nenhum Release).", "info");
      return;
    }
    onLog(`Falha ao verificar atualização do programa: ${message || "erro desconhecido"}`, "error");
  });

  return {
    checkNow: () => {
      autoUpdater.checkForUpdates().catch((error) => {
        onLog(`Falha ao verificar atualização do programa: ${error?.message || "erro desconhecido"}`, "error");
      });
    },
    quitAndInstall: () => {
      autoUpdater.quitAndInstall();
    },
  };
}

module.exports = { setupAutoUpdater };
