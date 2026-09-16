const accountLine = document.getElementById("account-line");
const statusBadge = document.getElementById("status-badge");
const contractValue = document.getElementById("contract-value");
const folderValue = document.getElementById("folder-value");
const lastSyncValue = document.getElementById("last-sync-value");
const logList = document.getElementById("log-list");

const LOG_KIND_LABEL = {
  upload: "Enviado",
  download: "Baixado",
  conflict: "Atenção",
  error: "Erro",
  info: "Info",
};

function formatTime(isoOrDate) {
  if (!isoOrDate) return "—";
  const d = new Date(isoOrDate);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function render(status) {
  accountLine.textContent = status.username ? `Conectado como ${status.username}` : "Não conectado";
  contractValue.textContent = status.contractName || "Todos / conta comum";
  folderValue.textContent = status.folderPath || "—";
  folderValue.title = status.folderPath || "";
  lastSyncValue.textContent = formatTime(status.lastSyncAt);
  currentExcludedFolderIds = status.excludedFolderIds || [];
  const errorPanel = document.getElementById('sync-error');
  errorPanel.textContent = status.lastError || '';
  errorPanel.hidden = !status.lastError;
  document.getElementById('sync-scope').textContent = currentExcludedFolderIds.length
    ? `${currentExcludedFolderIds.length} pasta(s) excluída(s)` : 'Todas as pastas (automático)';

  const modeRow = document.getElementById("mode-row");
  const modeWarning = document.getElementById("mode-warning");
  if (status.syncMode === "placeholder") {
    modeRow.textContent = "Arquivos aparecem na hora, baixam ao abrir";
    modeWarning.style.display = "block";
  } else if (status.syncMode === "download") {
    modeRow.textContent = "Baixa tudo de uma vez (modo de reserva)";
    modeWarning.style.display = "none";
  } else {
    modeRow.textContent = "—";
    modeWarning.style.display = "none";
  }

  statusBadge.classList.remove("status-idle", "status-syncing", "status-error");
  if (status.isSyncing) {
    statusBadge.classList.add("status-syncing");
    statusBadge.textContent = "Sincronizando…";
  } else if (status.lastError) {
    statusBadge.classList.add("status-error");
    statusBadge.textContent = "Erro";
  } else {
    statusBadge.classList.add("status-idle");
    statusBadge.textContent = "Em dia";
  }

  if (!status.log || status.log.length === 0) {
    logList.innerHTML = '<div class="empty">Nada por aqui ainda.</div>';
  } else {
    logList.innerHTML = status.log
      .map(
        (entry) => `
        <div class="log-entry">
          <span class="time">${formatTime(entry.time)}</span>
          <span class="log-kind-${entry.kind}">${LOG_KIND_LABEL[entry.kind] || entry.kind}:</span>
          <span>${escapeHtml(entry.message)}</span>
        </div>`
      )
      .join("");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Ideia 3 do Gilvando (sincronização seletiva): guarda a lista atual de
// pastas excluídas (vem do status) e só busca a lista de pastas da Nuvem
// quando a pessoa realmente abre o painel — sem precisar toda vez que a
// tela atualiza (a cada poucos segundos).
let currentExcludedFolderIds = [];
let topFoldersLoaded = false;

function renderFolderPicker(topFolders) {
  const picker = document.getElementById("folder-picker");
  if (topFolders.length === 0) {
    picker.innerHTML = '<div class="empty">Nenhuma pasta na Nuvem ainda.</div>';
    return;
  }
  picker.innerHTML = topFolders
    .map((folder) => {
      const checked = !currentExcludedFolderIds.includes(folder.id) ? "checked" : "";
      return `
        <label style="display:flex; align-items:center; gap:8px; padding:4px 0; font-size:12.5px; cursor:pointer;">
          <input type="checkbox" data-folder-id="${folder.id}" ${checked} />
          ${escapeHtml(folder.name)}
        </label>`;
    })
    .join("");

  picker.querySelectorAll("input[type=checkbox]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const folderId = checkbox.dataset.folderId;
      if (checkbox.checked) {
        currentExcludedFolderIds = currentExcludedFolderIds.filter((id) => id !== folderId);
      } else {
        currentExcludedFolderIds = [...currentExcludedFolderIds, folderId];
      }
      await window.desktopSync.setExcludedFolders(currentExcludedFolderIds);
    });
  });
}

document.getElementById("btn-choose-folders").addEventListener("click", async () => {
  const picker = document.getElementById("folder-picker");
  const isOpen = picker.style.display !== "none";
  if (isOpen) {
    picker.style.display = "none";
    return;
  }
  picker.style.display = "block";
  if (!topFoldersLoaded) {
    const result = await window.desktopSync.listTopFolders();
    topFoldersLoaded = true;
    if (result.ok) {
      renderFolderPicker(result.data);
    } else {
      picker.innerHTML = `<div class="empty">Erro ao carregar pastas: ${escapeHtml(result.error)}</div>`;
    }
  }
});

document.getElementById("btn-sync-now").addEventListener("click", () => window.desktopSync.syncNow());
document.getElementById("btn-open-folder").addEventListener("click", () => window.desktopSync.openFolder());
document.getElementById("btn-change-folder").addEventListener("click", () => window.desktopSync.changeFolder());
document.getElementById("btn-disconnect").addEventListener("click", async () => {
  if (confirm("Desconectar este computador da Nuvem? Você vai precisar entrar de novo pra sincronizar.")) {
    await window.desktopSync.disconnect();
  }
});

window.addEventListener("DOMContentLoaded", async () => {
  const status = await window.desktopSync.getStatus();
  render(status);
  window.desktopSync.onStatusUpdate(render);
});
