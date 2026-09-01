const stepLogin = document.getElementById("step-login");
const stepContract = document.getElementById("step-contract");
const stepFolder = document.getElementById("step-folder");

const serverUrlInput = document.getElementById("serverUrl");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginError = document.getElementById("login-error");
const btnLogin = document.getElementById("btn-login");

const contractSelect = document.getElementById("contract");
const contractError = document.getElementById("contract-error");
const btnContractContinue = document.getElementById("btn-contract-continue");

const folderPathInput = document.getElementById("folderPath");
const folderError = document.getElementById("folder-error");
const btnChooseFolder = document.getElementById("btn-choose-folder");
const btnFinish = document.getElementById("btn-finish");

let chosenFolder = null;
// Guarda o contrato quando a conta só tem UM (a etapa de escolha na tela
// é pulada nesse caso, mas o contrato ainda precisa ser passado pro
// programa principal — bug real encontrado em 01/09: ficava sem contrato
// nenhum marcado, mesmo a conta tendo um só).
let autoSelectedContract = null;

function showStep(step) {
  for (const el of [stepLogin, stepContract, stepFolder]) el.classList.remove("active");
  step.classList.add("active");
}

function showError(el, message) {
  el.textContent = message;
  el.style.display = "block";
}

function hideError(el) {
  el.style.display = "none";
}

function setButtonLoading(button, loading, normalText) {
  button.disabled = loading;
  button.innerHTML = loading ? `<span class="spinner"></span>Entrando…` : normalText;
}

window.addEventListener("DOMContentLoaded", async () => {
  serverUrlInput.value = await window.desktopSync.getDefaultServerUrl();
});

btnLogin.addEventListener("click", async () => {
  hideError(loginError);
  const serverUrl = serverUrlInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!serverUrl) return showError(loginError, "Informe o endereço do site.");
  if (!password) return showError(loginError, "Informe a senha.");

  setButtonLoading(btnLogin, true, "Entrar");
  try {
    const result = await window.desktopSync.login(serverUrl, username, password);
    if (!result.ok) {
      showError(loginError, result.error);
      return;
    }

    const contracts = await window.desktopSync.listContracts();
    if (contracts.ok && contracts.data.length > 1) {
      contractSelect.innerHTML = contracts.data
        .map((c) => `<option value="${c.slug}">${c.name}</option>`)
        .join("");
      showStep(stepContract);
    } else if (contracts.ok && contracts.data.length === 1) {
      // Conta com um contrato só — pula a tela de escolha, mas PRECISA
      // guardar qual é esse contrato pra passar adiante (não dá pra
      // deixar sem contrato nenhum marcado, mesmo sendo só um).
      autoSelectedContract = contracts.data[0].slug;
      showStep(stepFolder);
    } else {
      // Conta mestre/administrador sem contrato fixo — o servidor sabe
      // lidar com isso sozinho quando precisar.
      showStep(stepFolder);
    }
  } catch (err) {
    showError(loginError, "Não foi possível conectar: " + (err?.message || "erro desconhecido"));
  } finally {
    setButtonLoading(btnLogin, false, "Entrar");
  }
});

btnContractContinue.addEventListener("click", () => {
  hideError(contractError);
  if (!contractSelect.value) {
    showError(contractError, "Escolha um contrato.");
    return;
  }
  showStep(stepFolder);
});

btnChooseFolder.addEventListener("click", async () => {
  const folder = await window.desktopSync.chooseFolder();
  if (folder) {
    chosenFolder = folder;
    folderPathInput.value = folder;
  }
});

btnFinish.addEventListener("click", async () => {
  hideError(folderError);
  if (!chosenFolder) {
    showError(folderError, "Escolha uma pasta antes de continuar.");
    return;
  }
  btnFinish.disabled = true;
  btnFinish.textContent = "Configurando…";
  const contractSlug = stepContract.classList.contains("active") ? contractSelect.value : autoSelectedContract;
  const result = await window.desktopSync.finishSetup(contractSlug, chosenFolder);
  if (!result.ok) {
    showError(folderError, result.error);
    btnFinish.disabled = false;
    btnFinish.textContent = "Começar a sincronizar";
  }
  // Se deu certo, o processo principal fecha esta janela sozinho.
});
