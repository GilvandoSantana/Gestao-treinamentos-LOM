import { describe, it, expect } from "vitest";
import { decideUploadAction, resolveParentFolder, performUpload } from "./upload-watcher.js";

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
});

describe("resolveParentFolder", () => {
  it("arquivo direto na raiz → pasta conhecida (raiz sempre existe)", () => {
    const result = resolveParentFolder("arquivo.txt", new Map());
    expect(result).toEqual({ known: true, folderId: null });
  });

  it("arquivo numa pasta que a Nuvem confirma que existe → usa o id certo", () => {
    // Bug real corrigido (Gilvando, 01/09): a pasta "Público" já existia
    // há tempos, mas a lógica anterior tratava QUALQUER subpasta como se
    // fosse nova, só por não estar na raiz.
    const knownFolders = new Map([["Público", "folder-publico-123"]]);
    const result = resolveParentFolder("Público\\funcionou.txt", knownFolders);
    expect(result).toEqual({ known: true, folderId: "folder-publico-123" });
  });

  it("arquivo numa pasta de vários níveis, todos conhecidos → usa o id da mais funda", () => {
    const knownFolders = new Map([
      ["SSMA", "folder-ssma"],
      ["SSMA/13. INSPEÇÕES", "folder-inspecoes"],
    ]);
    const result = resolveParentFolder("SSMA\\13. INSPEÇÕES\\relatorio.pdf", knownFolders);
    expect(result).toEqual({ known: true, folderId: "folder-inspecoes" });
  });

  it("arquivo numa pasta que a Nuvem NÃO tem registro → pasta desconhecida", () => {
    const result = resolveParentFolder("PastaNovaCriadaAgora\\arquivo.txt", new Map());
    expect(result).toEqual({ known: false });
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
    expect(result).toEqual({ fileId: "id-existente-456" });
  });
});
