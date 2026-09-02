import { describe, it, expect } from "vitest";
import { generateManifestEntries } from "./placeholder-sync.js";

/** ApiClient falso — só implementa listFolder, que é tudo que
 * generateManifestEntries usa. */
function makeFakeApiClient(tree) {
  return {
    listFolder: async (folderId) => tree[folderId ?? "root"] || { folders: [], files: [] },
  };
}

describe("generateManifestEntries", () => {
  it("inclui arquivos normalmente, com o caminho relativo certo", async () => {
    const client = makeFakeApiClient({
      root: {
        folders: [{ id: "f1", name: "Contratos", hasAccess: true }],
        files: [{ id: "file-raiz", name: "raiz.txt", fileSize: 10 }],
      },
      f1: {
        folders: [],
        files: [{ id: "file-dentro", name: "dentro.txt", fileSize: 20 }],
      },
    });

    const entries = await generateManifestEntries(client);

    expect(entries).toContainEqual({ relativePath: "raiz.txt", fileId: "file-raiz", fileSize: 10 });
    expect(entries).toContainEqual({ relativePath: "Contratos\\dentro.txt", fileId: "file-dentro", fileSize: 20 });
  });

  it("marca uma pasta explicitamente mesmo sem nenhum arquivo direto nela", async () => {
    // Achado real (Gilvando, 01/09): a pasta "Pública" sumia porque não
    // tinha arquivo nenhum dentro — o programa só "descobria" pasta ao
    // ver arquivo dentro dela.
    const client = makeFakeApiClient({
      root: {
        folders: [{ id: "f1", name: "Pública", hasAccess: true }],
        files: [],
      },
      f1: { folders: [], files: [] },
    });

    const entries = await generateManifestEntries(client);

    expect(entries).toContainEqual({ relativePath: "Pública", isFolder: true, folderId: "f1" });
  });

  it("marca pastas vazias em vários níveis (pasta vazia dentro de pasta vazia)", async () => {
    const client = makeFakeApiClient({
      root: {
        folders: [{ id: "f1", name: "Nivel1", hasAccess: true }],
        files: [],
      },
      f1: {
        folders: [{ id: "f2", name: "Nivel2", hasAccess: true }],
        files: [],
      },
      f2: { folders: [], files: [] },
    });

    const entries = await generateManifestEntries(client);

    expect(entries).toContainEqual({ relativePath: "Nivel1", isFolder: true, folderId: "f1" });
    expect(entries).toContainEqual({ relativePath: "Nivel1\\Nivel2", isFolder: true, folderId: "f2" });
  });

  it("mostra a pasta sem permissão (vazia), mas nunca desce nela pra ver o conteúdo", async () => {
    // Mesmo comportamento do site: a pasta APARECE na listagem (lá, meio
    // apagada visualmente), só não dá pra entrar e ver o que tem dentro.
    let calledListFolderForRestricted = false;
    const client = {
      listFolder: async (folderId) => {
        if (folderId === "f1") calledListFolderForRestricted = true;
        if (!folderId) {
          return { folders: [{ id: "f1", name: "Restrita", hasAccess: false }], files: [] };
        }
        return { folders: [], files: [{ id: "nao-deveria-aparecer", name: "secreto.txt", fileSize: 1 }] };
      },
    };

    const entries = await generateManifestEntries(client);

    expect(entries).toEqual([{ relativePath: "Restrita", isFolder: true, folderId: "f1" }]);
    expect(calledListFolderForRestricted).toBe(false);
  });
});
