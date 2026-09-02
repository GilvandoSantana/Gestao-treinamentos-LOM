/**
 * Gera um arquivo JSON com a lista de todos os arquivos da Nuvem (descendo
 * em todas as subpastas), pra criar todos os placeholders de uma vez —
 * em vez de testar arquivo por arquivo como antes.
 *
 * Uso:
 *   node generate-manifest.js <servidor> <usuario> <senha> <contrato>
 */

const fs = require("fs");
const { ApiClient } = require("../src/api-client");

async function run() {
  const [serverUrl, username, password, contractSlug] = process.argv.slice(2);
  if (!serverUrl || password === undefined) {
    console.log("Uso: node generate-manifest.js <servidor> <usuario> <senha> <contrato>");
    process.exit(1);
  }

  const client = new ApiClient(serverUrl);
  const loginResult = await client.login(username, password);
  console.log("Login OK, usuário:", loginResult.username);

  if (contractSlug) {
    client.setActiveContract(contractSlug);
  } else {
    const contracts = await client.listContracts().catch(() => []);
    if (contracts.length > 1) {
      console.log("Sua conta gerencia mais de um contrato — escolha um:");
      contracts.forEach((c) => console.log(`  - ${c.slug} (${c.name})`));
      console.log("\nRode de novo passando o slug do contrato como 4º argumento.");
      process.exit(1);
    }
    if (contracts.length === 1) client.setActiveContract(contracts[0].slug);
  }

  const entries = [];

  async function walk(folderId, relativePath) {
    const listing = await client.listFolder(folderId);
    for (const file of listing.files) {
      entries.push({
        relativePath: relativePath ? `${relativePath}\\${file.name}` : file.name,
        fileId: file.id,
        fileSize: file.fileSize || 0,
      });
    }
    for (const folder of listing.folders) {
      const childPath = relativePath ? `${relativePath}\\${folder.name}` : folder.name;
      entries.push({ relativePath: childPath, isFolder: true, folderId: folder.id });
      // Pasta restrita a um grupo que a pessoa não participa: aparece
      // (vazia), mas não desce nela — mesmo comportamento do site.
      if (folder.hasAccess === false) continue;
      await walk(folder.id, childPath);
    }
  }

  console.log("Lendo a estrutura de pastas da Nuvem...");
  await walk(null, "");
  console.log(`Encontrados ${entries.length} arquivo(s).`);

  const manifest = { entries };
  const manifestPath = require("path").join(__dirname, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  console.log("Manifesto salvo em:", manifestPath);

  console.log("\nComando pra rodar no PowerShell (dentro da pasta CloudFilterHost):\n");
  console.log(
    `dotnet run -- sync-tree C:\\TesteNuvem2 "${manifestPath.replace(/\//g, "\\")}" ${serverUrl} ${client.token}`
  );
}

run().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
