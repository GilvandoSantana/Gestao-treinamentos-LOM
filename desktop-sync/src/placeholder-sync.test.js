import { describe, it, expect } from "vitest";
import { generateManifestEntries, findGenuinelyRemoteChanges } from "./placeholder-sync.js";

/** ApiClient falso — só implementa getFullTree, que é tudo que
 * generateManifestEntries usa (desde a mudança pra buscar a árvore
 * inteira numa chamada só, em vez de uma por pasta). */
function makeFakeApiClient(tree) {
  return {
    getFullTree: async () => tree,
  };
}

describe("generateManifestEntries", () => {
  it("inclui arquivos normalmente, com o caminho relativo certo", async () => {
    const client = makeFakeApiClient({
      folders: [{ id: "f1", name: "Contratos", parentId: null, hasAccess: true }],
      files: [
        { id: "file-raiz", name: "raiz.txt", folderId: null, fileSize: 10 },
        { id: "file-dentro", name: "dentro.txt", folderId: "f1", fileSize: 20 },
      ],
    });

    const entries = await generateManifestEntries(client);

    expect(entries).toContainEqual({ relativePath: "raiz.txt", fileId: "file-raiz", fileSize: 10 });
    expect(entries).toContainEqual({
      relativePath: "Contratos\\dentro.txt",
      fileId: "file-dentro",
      fileSize: 20,
    });
  });

  it("marca uma pasta explicitamente mesmo sem nenhum arquivo direto nela", async () => {
    const client = makeFakeApiClient({
      folders: [{ id: "f1", name: "Pública", parentId: null, hasAccess: true }],
      files: [],
    });

    const entries = await generateManifestEntries(client);

    expect(entries).toContainEqual({ relativePath: "Pública", isFolder: true, folderId: "f1" });
  });

  it("marca pastas vazias em vários níveis (pasta vazia dentro de pasta vazia)", async () => {
    const client = makeFakeApiClient({
      folders: [
        { id: "f1", name: "Nivel1", parentId: null, hasAccess: true },
        { id: "f2", name: "Nivel2", parentId: "f1", hasAccess: true },
      ],
      files: [],
    });

    const entries = await generateManifestEntries(client);

    expect(entries).toContainEqual({ relativePath: "Nivel1", isFolder: true, folderId: "f1" });
    expect(entries).toContainEqual({ relativePath: "Nivel1\\Nivel2", isFolder: true, folderId: "f2" });
  });

  it("mostra a pasta sem permissão (vazia), já que o servidor não traz filhos dela", async () => {
    const client = makeFakeApiClient({
      folders: [{ id: "f1", name: "Restrita", parentId: null, hasAccess: false }],
      files: [],
    });

    const entries = await generateManifestEntries(client);

    expect(entries).toEqual([{ relativePath: "Restrita", isFolder: true, folderId: "f1" }]);
  });

  it("resolve o caminho certo mesmo com a pasta filha aparecendo antes da mãe na lista", async () => {
    const client = makeFakeApiClient({
      folders: [
        { id: "f2", name: "Filha", parentId: "f1", hasAccess: true },
        { id: "f1", name: "Mae", parentId: null, hasAccess: true },
      ],
      files: [{ id: "file1", name: "doc.txt", folderId: "f2", fileSize: 5 }],
    });

    const entries = await generateManifestEntries(client);

    expect(entries).toContainEqual({ relativePath: "Mae\\Filha", isFolder: true, folderId: "f2" });
    expect(entries).toContainEqual({ relativePath: "Mae\\Filha\\doc.txt", fileId: "file1", fileSize: 5 });
  });

  it("usa barra ÚNICA como separador (padrão real do Windows) — não barra dupla", async () => {
    // Achado real (Gilvando, 04/09): uma versão anterior usava barra
    // dupla de propósito (achando que precisava preservar um formato
    // antigo) — mas isso provavelmente causava o bug relatado ("carrega
    // tudo e depois só mostra alguns arquivos" numa pasta com bastante
    // conteúdo), já que o lado C# (Path.GetDirectoryName) não espera
    // separador duplicado. Este teste existe especificamente pra nunca
    // mais regredir pra barra dupla sem querer.
    const client = makeFakeApiClient({
      folders: [{ id: "f1", name: "Pasta", parentId: null, hasAccess: true }],
      files: [{ id: "file1", name: "arquivo.txt", folderId: "f1", fileSize: 1 }],
    });

    const entries = await generateManifestEntries(client);
    const fileEntry = entries.find((e) => e.fileId === "file1");

    let backslashCount = 0;
    for (const ch of fileEntry.relativePath) if (ch === String.fromCharCode(92)) backslashCount++;
    expect(backslashCount).toBe(1);
  });
});

describe("findGenuinelyRemoteChanges", () => {
  it("aponta como novo um arquivo que não estava no mapa anterior", () => {
    const previous = new Map();
    const fresh = new Map([["novo.txt", { fileId: "f1", fileSize: 10, updatedAt: "2026-01-01T00:00:00.000Z" }]]);

    const result = findGenuinelyRemoteChanges(previous, fresh);

    expect(result.added).toEqual(["novo.txt"]);
    expect(result.changed).toEqual([]);
  });

  it("aponta como mudado um arquivo cujo updatedAt é diferente do que já se sabia", () => {
    const previous = new Map([["doc.txt", { fileId: "f1", fileSize: 10, updatedAt: "2026-01-01T00:00:00.000Z" }]]);
    const fresh = new Map([["doc.txt", { fileId: "f1", fileSize: 20, updatedAt: "2026-01-02T00:00:00.000Z" }]]);

    const result = findGenuinelyRemoteChanges(previous, fresh);

    expect(result.added).toEqual([]);
    expect(result.changed).toEqual(["doc.txt"]);
  });

  it("não aponta nada quando um upload local já atualizou o mapa anterior antes deste ciclo rodar", () => {
    // Achado central desta funcionalidade: upload-watcher.js atualiza
    // knownCloudFiles NA HORA que faz um upload — então, quando este
    // ciclo periódico roda depois, o "antes" já reflete esse envio
    // local, e não deveria ser tratado como "mudança externa".
    const previous = new Map([["editado-aqui.txt", { fileId: "f1", fileSize: 99, updatedAt: "2026-01-05T00:00:00.000Z" }]]);
    const fresh = new Map([["editado-aqui.txt", { fileId: "f1", fileSize: 99, updatedAt: "2026-01-05T00:00:00.000Z" }]]);

    const result = findGenuinelyRemoteChanges(previous, fresh);

    expect(result.added).toEqual([]);
    expect(result.changed).toEqual([]);
  });

  it("não confunde arquivo removido (some do mapa fresco) com novo ou mudado", () => {
    const previous = new Map([["vai-sumir.txt", { fileId: "f1", fileSize: 10, updatedAt: "2026-01-01T00:00:00.000Z" }]]);
    const fresh = new Map();

    const result = findGenuinelyRemoteChanges(previous, fresh);

    expect(result.added).toEqual([]);
    expect(result.changed).toEqual([]);
  });
});
