/**
 * Script de apoio só pra esta etapa de teste — busca um arquivo de
 * verdade da Nuvem (nome, tamanho, link de download) e mostra o comando
 * pronto pra colar no teste do CloudFilterHost.
 *
 * Uso:
 *   node get-real-file-for-test.js <servidor> <usuario> <senha> [contrato]
 *
 * Exemplo:
 *   node get-real-file-for-test.js https://gestao-treinamentos-lom.up.railway.app "" "sua-senha"
 */

const { ApiClient } = require("../src/api-client");

async function run() {
  const [serverUrl, username, password, contractSlug] = process.argv.slice(2);
  if (!serverUrl || password === undefined) {
    console.log("Uso: node get-real-file-for-test.js <servidor> <usuario> <senha> [contrato]");
    process.exit(1);
  }

  const client = new ApiClient(serverUrl);
  await client.login(username, password);
  console.log("Login OK.");

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

  // Procura o primeiro arquivo de verdade, descendo em subpastas se
  // precisar (a raiz pode só ter pastas).
  async function findFirstFile(folderId, pathSoFar) {
    const listing = await client.listFolder(folderId);
    if (listing.files.length > 0) {
      return { file: listing.files[0], path: pathSoFar };
    }
    for (const folder of listing.folders) {
      if (folder.hasAccess === false) continue;
      const found = await findFirstFile(folder.id, `${pathSoFar}/${folder.name}`);
      if (found) return found;
    }
    return null;
  }

  const result = await findFirstFile(null, "");
  if (!result) {
    console.log("Nenhum arquivo encontrado na Nuvem deste contrato — envie algum arquivo pela tela normal do site primeiro.");
    process.exit(1);
  }

  const { file } = result;
  const urlRes = await fetch(new URL("/api/trpc/cloud.getDownloadUrl?batch=1", client.serverUrl).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${client.token}`, Origin: client.serverUrl },
    body: JSON.stringify({ "0": { json: { id: file.id } } }),
  });
  const urlData = await urlRes.json();
  const downloadUrl = urlData[0].result.data.json.url;

  console.log("\nArquivo encontrado:", file.name, `(pasta: ${result.path || "/"})`);
  console.log("\nComando pra rodar no PowerShell (dentro da pasta CloudFilterHost):\n");
  console.log(
    `dotnet run -- placeholder-real-test C:\\TesteNuvem2 "${file.name}" ${file.fileSize || 0} "${downloadUrl}"`
  );
}

run().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
