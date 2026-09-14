import { describe, it, expect } from "vitest";
import { generateManifestEntries, findGenuinelyRemoteChanges, updateMissingStreaks } from "./placeholder-sync.js";

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

  it("sincronização seletiva: pasta excluída (e tudo dentro dela) não aparece no manifesto", async () => {
    // Ideia 3 do Gilvando: escolher quais pastas de nível raiz sincronizar.
    const client = makeFakeApiClient({
      folders: [
        { id: "f1", name: "Contratos Ativos", parentId: null, hasAccess: true },
        { id: "f2", name: "Arquivo Morto", parentId: null, hasAccess: true },
        { id: "f3", name: "Sub Arquivo Morto", parentId: "f2", hasAccess: true },
      ],
      files: [
        { id: "file1", name: "atual.txt", folderId: "f1", fileSize: 5 },
        { id: "file2", name: "antigo.txt", folderId: "f2", fileSize: 5 },
        { id: "file3", name: "bem-antigo.txt", folderId: "f3", fileSize: 5 },
      ],
    });

    const entries = await generateManifestEntries(client, new Set(["f2"]));

    const paths = entries.map((e) => e.relativePath);
    expect(paths).toContain("Contratos Ativos");
    expect(paths).toContain("Contratos Ativos\\atual.txt");
    // Nem a pasta excluída, nem a subpasta dela, nem os arquivos de
    // nenhuma das duas aparecem.
    expect(paths).not.toContain("Arquivo Morto");
    expect(paths).not.toContain("Arquivo Morto\\antigo.txt");
    expect(paths.some((p) => p.includes("Sub Arquivo Morto"))).toBe(false);
    expect(paths.some((p) => p.includes("bem-antigo.txt"))).toBe(false);
  });

  it("sem nenhuma exclusão informada, sincroniza tudo normalmente (compatível com código antigo)", async () => {
    const client = makeFakeApiClient({
      folders: [{ id: "f1", name: "Pasta", parentId: null, hasAccess: true }],
      files: [{ id: "file1", name: "arquivo.txt", folderId: "f1", fileSize: 1 }],
    });

    const entries = await generateManifestEntries(client);

    expect(entries.map((e) => e.relativePath)).toContain("Pasta\\arquivo.txt");
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

describe("updateMissingStreaks", () => {
  it("NÃO marca pra apagar quando sumiu só uma vez (abaixo do limite)", () => {
    // Achado real (Gilvando, 14/09): arquivo recém-enviado foi apagado
    // localmente por causa de UMA leitura ruim da Nuvem. Este é o teste
    // que garante que isso não se repete — sumir uma vez só não é mais
    // suficiente.
    const streak = new Map();
    const result = updateMissingStreaks(["arquivo.txt"], [], streak, 3);

    expect(result).toEqual([]);
    expect(streak.get("arquivo.txt")).toBe(1);
  });

  it("marca pra apagar só depois de sumir o número de vezes SEGUIDAS exigido", () => {
    const streak = new Map();
    updateMissingStreaks(["arquivo.txt"], [], streak, 3); // 1ª vez
    updateMissingStreaks(["arquivo.txt"], [], streak, 3); // 2ª vez
    const result = updateMissingStreaks(["arquivo.txt"], [], streak, 3); // 3ª vez

    expect(result).toEqual(["arquivo.txt"]);
  });

  it("zera a contagem assim que o item volta a aparecer — não soma direto pro limite depois", () => {
    const streak = new Map();
    updateMissingStreaks(["arquivo.txt"], [], streak, 3); // sumiu 1x
    updateMissingStreaks([], ["arquivo.txt"], streak, 3); // voltou a aparecer — zera
    const result = updateMissingStreaks(["arquivo.txt"], [], streak, 3); // sumiu de novo, mas é a 1ª vez desta vez

    expect(result).toEqual([]);
    expect(streak.get("arquivo.txt")).toBe(1);
  });

  it("trata cada chave de forma independente — uma sumir não afeta a contagem da outra", () => {
    const streak = new Map();
    updateMissingStreaks(["a.txt", "b.txt"], [], streak, 3);
    updateMissingStreaks(["a.txt"], ["b.txt"], streak, 3); // só "a" sumiu de novo, "b" voltou
    const result = updateMissingStreaks(["a.txt"], ["b.txt"], streak, 3);

    expect(result).toEqual(["a.txt"]);
    expect(streak.has("b.txt")).toBe(false);
  });
});
