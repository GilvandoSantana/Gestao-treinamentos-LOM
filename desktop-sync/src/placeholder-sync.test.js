import { describe, it, expect } from "vitest";
import { generateManifestEntries } from "./placeholder-sync.js";

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
      relativePath: "Contratos\\\\dentro.txt",
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
    expect(entries).toContainEqual({ relativePath: "Nivel1\\\\Nivel2", isFolder: true, folderId: "f2" });
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

    expect(entries).toContainEqual({ relativePath: "Mae\\\\Filha", isFolder: true, folderId: "f2" });
    expect(entries).toContainEqual({ relativePath: "Mae\\\\Filha\\\\doc.txt", fileId: "file1", fileSize: 5 });
  });
});
