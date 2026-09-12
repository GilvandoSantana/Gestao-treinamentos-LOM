import { describe, it, expect } from "vitest";
import { decideUploadAction, ensureCloudFolder, performUpload, checkDeletionBurst, buildConflictFileName } from "./upload-watcher.js";

describe("decideUploadAction", () => {
  it("arquivo sem nenhum registro na Nuvem → novo, deve subir", () => {
    const result = decideUploadAction(1234, undefined);
    expect(result).toEqual({ action: "new" });
  });

  it("arquivo com o MESMO tamanho que a Nuvem já tinha → ignora (é o próprio placeholder/hidratação)", () => {
    // Este é o caso central que evita o incidente do Desktop se repetir:
    // um arquivo que o próprio mecanismo acabou de criar/baixar tem o
    // tamanho exato que já está registrado, então não é tratado como
    // "edição da pessoa".
    const result = decideUploadAction(5000, { fileId: "abc", fileSize: 5000 });
    expect(result).toEqual({ action: "skip" });
  });

  it("arquivo com tamanho DIFERENTE do que a Nuvem tinha → edição de verdade, sobe nova versão", () => {
    const result = decideUploadAction(5001, { fileId: "abc", fileSize: 5000 });
    expect(result).toEqual({ action: "update", fileId: "abc" });
  });

  it("arquivo zerado depois de já ter tido conteúdo → ainda conta como edição (tamanho mudou)", () => {
    const result = decideUploadAction(0, { fileId: "abc", fileSize: 5000 });
    expect(result).toEqual({ action: "update", fileId: "abc" });
  });

  it("tamanho mudou local, e a Nuvem TAMBÉM mudou desde a última vez que olhamos → conflito", () => {
    // Achado real: duas edições independentes do mesmo arquivo ao mesmo
    // tempo (uma local, outra na Nuvem) não podem terminar com uma
    // sobrescrevendo a outra sem ninguém perceber.
    const result = decideUploadAction(
      5001,
      { fileId: "abc", fileSize: 5000, updatedAt: "2026-01-02T00:00:00.000Z" },
      "2026-01-01T00:00:00.000Z" // baseline diferente do updatedAt atual
    );
    expect(result).toEqual({ action: "conflict", fileId: "abc" });
  });

  it("tamanho mudou local, mas a Nuvem NÃO mudou desde a última vez → edição normal, sem conflito", () => {
    const result = decideUploadAction(
      5001,
      { fileId: "abc", fileSize: 5000, updatedAt: "2026-01-01T00:00:00.000Z" },
      "2026-01-01T00:00:00.000Z" // mesmo valor — nada mudou na Nuvem
    );
    expect(result).toEqual({ action: "update", fileId: "abc" });
  });

  it("sem nenhuma linha de base ainda (primeira vez que vemos este arquivo) → nunca é conflito", () => {
    const result = decideUploadAction(5001, {
      fileId: "abc",
      fileSize: 5000,
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(result).toEqual({ action: "update", fileId: "abc" });
  });
});

describe("ensureCloudFolder", () => {
  function makeDeps(overrides = {}) {
    const knownCloudFolders = overrides.knownCloudFolders || new Map();
    const createdCalls = [];
    let nextId = 1;
    const apiClient = {
      createRemoteFolder: async (parentId, name) => {
        createdCalls.push({ parentId, name });
        return { id: `novo-id-${nextId++}` };
      },
    };
    const logs = [];
    return {
      apiClient,
      knownCloudFolders,
      inFlight: new Map(),
      onLog: (message, kind) => logs.push({ message, kind }),
      createdCalls,
      logs,
    };
  }

  it("raiz (\".\" ou vazio) não cria nada, devolve null", async () => {
    const deps = makeDeps();
    const result = await ensureCloudFolder(".", deps);
    expect(result).toBeNull();
    expect(deps.createdCalls).toEqual([]);
  });

  it("pasta já conhecida não cria de novo, só devolve o id que já tinha", async () => {
    const deps = makeDeps({ knownCloudFolders: new Map([["Público", "id-existente"]]) });
    const result = await ensureCloudFolder("Público", deps);
    expect(result).toBe("id-existente");
    expect(deps.createdCalls).toEqual([]);
  });

  it("pasta nova de um nível só → cria uma vez na raiz", async () => {
    const deps = makeDeps();
    const result = await ensureCloudFolder("PastaNova", deps);
    expect(result).toBe("novo-id-1");
    expect(deps.createdCalls).toEqual([{ parentId: null, name: "PastaNova" }]);
    expect(deps.knownCloudFolders.get("PastaNova")).toBe("novo-id-1");
  });

  it("pasta aninhada nova (dois níveis, nenhum existe ainda) → cria a cadeia inteira, na ordem certa", async () => {
    const deps = makeDeps();
    const result = await ensureCloudFolder("Nivel1/Nivel2", deps);
    expect(result).toBe("novo-id-2");
    expect(deps.createdCalls).toEqual([
      { parentId: null, name: "Nivel1" },
      { parentId: "novo-id-1", name: "Nivel2" },
    ]);
  });

  it("pasta aninhada onde o pai já existe → cria só a que falta, usando o id certo do pai", async () => {
    const deps = makeDeps({ knownCloudFolders: new Map([["Nivel1", "id-nivel1-existente"]]) });
    const result = await ensureCloudFolder("Nivel1/Nivel2", deps);
    expect(result).toBe("novo-id-1");
    expect(deps.createdCalls).toEqual([{ parentId: "id-nivel1-existente", name: "Nivel2" }]);
  });

  it("duas chamadas simultâneas pra mesma pasta não criam ela duas vezes", async () => {
    const deps = makeDeps();
    const [resultA, resultB] = await Promise.all([
      ensureCloudFolder("PastaCompartilhada", deps),
      ensureCloudFolder("PastaCompartilhada", deps),
    ]);
    expect(resultA).toBe(resultB);
    expect(deps.createdCalls).toHaveLength(1);
  });
});

describe("performUpload", () => {
  // Bug real encontrado (Gilvando, 01/09): o envio de NOVA VERSÃO
  // esquecia de mandar o nome do arquivo — o servidor exige esse campo,
  // e sem ele a chamada falhava com "Invalid input: expected string,
  // received undefined". A chamada de ARQUIVO NOVO já mandava certo,
  // só a de nova versão que ficou faltando. Estes testes conferem os
  // argumentos exatos recebidos pelo apiClient, pra esse tipo de erro
  // não voltar a passar despercebido.

  it("arquivo novo: chama uploadNewFile com pasta, nome e conteúdo certos", async () => {
    const calls = [];
    const fakeApiClient = {
      uploadNewFile: async (folderId, name, buffer) => {
        calls.push({ folderId, name, buffer });
        return { id: "novo-id-123" };
      },
    };

    const result = await performUpload(
      "new",
      { name: "bora.txt", buffer: Buffer.from("conteudo"), folderId: "pasta-publico-id" },
      fakeApiClient
    );

    expect(calls).toEqual([{ folderId: "pasta-publico-id", name: "bora.txt", buffer: Buffer.from("conteudo") }]);
    expect(result).toEqual({ fileId: "novo-id-123" });
  });

  it("nova versão: chama uploadNewVersion com id, conteúdo E NOME (o que faltava)", async () => {
    const calls = [];
    const fakeApiClient = {
      uploadNewVersion: async (fileId, buffer, name) => {
        calls.push({ fileId, buffer, name });
        return { updatedAt: "2026-01-01T00:00:00.000Z" };
      },
    };

    const result = await performUpload(
      "update",
      { name: "bora.txt", buffer: Buffer.from("conteudo editado"), fileId: "id-existente-456" },
      fakeApiClient
    );

    expect(calls).toEqual([
      { fileId: "id-existente-456", buffer: Buffer.from("conteudo editado"), name: "bora.txt" },
    ]);
    expect(result).toEqual({ fileId: "id-existente-456", updatedAt: "2026-01-01T00:00:00.000Z" });
  });
});

describe("checkDeletionBurst", () => {
  // Freio de emergência contra exclusão em massa (ex: a pessoa apaga a
  // pasta inteira sem querer, ou move ela pra outro lugar sem perceber
  // que isso conta como "apagar tudo" pro vigia de arquivos). Sem essa
  // proteção, isso viraria uma exclusão em massa automática na Nuvem —
  // o mesmo tipo de risco do incidente de upload em massa (01/09), só
  // que mais grave, porque é exclusão.

  it("poucas exclusões dentro do limite → todas permitidas", () => {
    let timestamps = [];
    const now = 1000;
    for (let i = 0; i < 5; i++) {
      const result = checkDeletionBurst(timestamps, now + i, 5, 10_000);
      expect(result.allowed).toBe(true);
      timestamps = result.updatedTimestamps;
    }
  });

  it("a exclusão que ultrapassa o limite dentro da janela é bloqueada", () => {
    let timestamps = [];
    const now = 1000;
    // As primeiras 5 (limite) devem passar.
    for (let i = 0; i < 5; i++) {
      const result = checkDeletionBurst(timestamps, now + i, 5, 10_000);
      timestamps = result.updatedTimestamps;
    }
    // A 6ª, ainda dentro da janela de tempo, deve ser bloqueada.
    const sixth = checkDeletionBurst(timestamps, now + 5, 5, 10_000);
    expect(sixth.allowed).toBe(false);
  });

  it("exclusões antigas (fora da janela de tempo) não contam mais pro limite", () => {
    let timestamps = [];
    const windowMs = 10_000;
    // 5 exclusões bem no início.
    for (let i = 0; i < 5; i++) {
      const result = checkDeletionBurst(timestamps, i, 5, windowMs);
      timestamps = result.updatedTimestamps;
    }
    // Muito tempo depois (passou da janela) — não deveria contar as
    // antigas, então esta ainda é permitida.
    const later = checkDeletionBurst(timestamps, windowMs + 100_000, 5, windowMs);
    expect(later.allowed).toBe(true);
  });
});

describe("buildConflictFileName", () => {
  it("mantém a extensão do arquivo, inserindo a marcação antes dela", () => {
    const result = buildConflictFileName("relatorio.docx");
    expect(result.endsWith(".docx")).toBe(true);
    expect(result.startsWith("relatorio (conflito - ")).toBe(true);
  });

  it("funciona também com arquivo sem extensão nenhuma", () => {
    const result = buildConflictFileName("LEIAME");
    expect(result.startsWith("LEIAME (conflito - ")).toBe(true);
    expect(result.endsWith(")")).toBe(true);
  });

  it("duas chamadas seguidas não geram o mesmo nome duas vezes seguidas por acaso simples (contém o nome do computador)", () => {
    const result = buildConflictFileName("planilha.xlsx");
    expect(result).toContain(require("os").hostname());
  });
});
