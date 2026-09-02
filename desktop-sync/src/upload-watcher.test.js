import { describe, it, expect } from "vitest";
import { decideUploadAction } from "./upload-watcher.js";

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
