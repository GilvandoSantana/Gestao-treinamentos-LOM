/**
 * Roda automaticamente depois de "npm install" (configurado como
 * "postinstall" no package.json) — publica o CloudFilterHost.exe sozinho,
 * pra quem baixa o projeto de novo não precisar lembrar de rodar um
 * segundo comando manual numa pasta diferente.
 *
 * Nunca falha o "npm install" por causa disso: se o .NET não estiver
 * instalado, ou a publicação der erro, só avisa e segue em frente — o
 * programa ainda funciona no modo antigo (baixa tudo de uma vez) sem o
 * CloudFilterHost.exe, só sem o efeito de "aparece na hora, baixa quando
 * abre".
 */

const { spawnSync } = require("child_process");
const path = require("path");

const cloudFilterHostDir = path.join(__dirname, "..", "native", "CloudFilterHost");

console.log("\n[postinstall] Publicando o programa auxiliar (CloudFilterHost)...");

const result = spawnSync("dotnet", ["publish", "-c", "Release"], {
  cwd: cloudFilterHostDir,
  stdio: "inherit",
  shell: true,
});

if (result.error || result.status !== 0) {
  console.warn(
    "\n[postinstall] Não foi possível publicar o CloudFilterHost automaticamente " +
      "(precisa do .NET 8 SDK instalado — https://dotnet.microsoft.com/download/dotnet/8.0).\n" +
      "O programa principal continua instalado normalmente e funciona no modo antigo " +
      '(baixa tudo de uma vez). Rode "npm run publish-cloudfilterhost" depois de instalar ' +
      "o .NET pra ativar o modo novo (arquivo aparece na hora, baixa quando abre).\n"
  );
  process.exit(0); // nunca derruba o npm install por causa disso
}

console.log("[postinstall] CloudFilterHost publicado com sucesso.\n");
