/**
 * Guarda as configurações do programa (URL do servidor, pasta escolhida,
 * contrato ativo) e o token de acesso — este último criptografado com a
 * API de segurança nativa do sistema operacional (safeStorage do Electron,
 * que no Windows usa o DPAPI — a mesma tecnologia que o Windows usa pra
 * proteger senhas salvas no Chrome/Edge, ligada à conta do usuário do
 * Windows). Ninguém consegue ler o token abrindo o arquivo, mesmo tendo
 * acesso ao disco — só o próprio Windows, logado como a mesma pessoa,
 * consegue decifrar.
 */

const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

function getConfigPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function getTokenPath() {
  return path.join(app.getPath("userData"), "token.enc");
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
}

function loadToken() {
  try {
    const encrypted = fs.readFileSync(getTokenPath());
    if (!safeStorage.isEncryptionAvailable()) {
      // Sem criptografia disponível no sistema — não deveria acontecer no
      // Windows, mas por segurança, não usa um token que não foi
      // criptografado direito.
      return null;
    }
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

function saveToken(token) {
  fs.mkdirSync(path.dirname(getTokenPath()), { recursive: true });
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "O Windows não disponibilizou o serviço de criptografia necessário para guardar o acesso com segurança."
    );
  }
  const encrypted = safeStorage.encryptString(token);
  fs.writeFileSync(getTokenPath(), encrypted);
}

function clearToken() {
  try {
    fs.unlinkSync(getTokenPath());
  } catch {
    // já não existia — tudo bem
  }
}

function clearAll() {
  clearToken();
  try {
    fs.unlinkSync(getConfigPath());
  } catch {
    // já não existia — tudo bem
  }
}

module.exports = { loadConfig, saveConfig, loadToken, saveToken, clearToken, clearAll };
