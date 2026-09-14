import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { walkLocalTree } from "./upload-watcher.js";

describe("walkLocalTree", () => {
  let tmpDir;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "walk-test-"));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("encontra um arquivo solto na raiz", async () => {
    await fs.writeFile(path.join(tmpDir, "raiz.txt"), "conteudo");
    const result = await walkLocalTree(tmpDir);
    expect(result).toContain("raiz.txt");
  });

  it("encontra a PASTA e o ARQUIVO dentro dela — o caso central deste achado", async () => {
    // Achado real (Gilvando, 14/09): colar uma pasta com arquivo dentro
    // fez só a pasta aparecer na Nuvem, não o arquivo — provável
    // limitação do fs.watch do Node no Windows, que às vezes não avisa
    // sobre o conteúdo de uma pasta nova criada de uma vez só. Esta
    // varredura é a rede de segurança pra esse caso exato.
    //
    // O caminho RELATIVO devolvido é sempre no formato win32 (barra
    // invertida), não o separador nativo desta máquina de teste — por
    // isso a comparação usa a barra invertida escrita direto, em vez de
    // path.join (que usaria barra normal aqui no Linux).
    await fs.mkdir(path.join(tmpDir, "SSMA"));
    await fs.writeFile(path.join(tmpDir, "SSMA", "funcionou.txt"), "conteudo");

    const result = await walkLocalTree(tmpDir);

    expect(result).toContain("SSMA");
    expect(result).toContain("SSMA\\funcionou.txt");
  });

  it("encontra arquivo em subpasta de vários níveis de profundidade", async () => {
    await fs.mkdir(path.join(tmpDir, "A", "B", "C"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "A", "B", "C", "fundo.txt"), "x");

    const result = await walkLocalTree(tmpDir);

    expect(result).toContain("A\\B\\C\\fundo.txt");
  });

  it("devolve lista vazia numa pasta vazia, sem quebrar", async () => {
    const result = await walkLocalTree(tmpDir);
    expect(result).toEqual([]);
  });

  it("não quebra se a pasta raiz não existir mais (pessoa desconectou/apagou no meio do caminho)", async () => {
    const result = await walkLocalTree(path.join(tmpDir, "nao-existe"));
    expect(result).toEqual([]);
  });
});
