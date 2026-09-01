import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { runSyncTick } from "./sync-engine.js";

function makeFakeCloud(seed = []) {
  let idCounter = 0;
  const files = new Map();
  for (const s of seed) {
    idCounter++;
    files.set(s.name, {
      id: `id-${idCounter}`,
      name: s.name,
      content: s.content,
      updatedAt: `t${idCounter}`,
      lockedBy: s.lockedBy ?? null,
      lockedAt: s.lockedAt ?? null,
    });
  }
  return {
    listCloudFiles: async () =>
      Array.from(files.values()).map((f) => ({
        id: f.id,
        name: f.name,
        fileSize: f.content.length,
        mimeType: "text/plain",
        updatedAt: f.updatedAt,
        lockedBy: f.lockedBy,
        lockedAt: f.lockedAt,
      })),
    downloadCloudFile: async (fileId) => {
      const entry = Array.from(files.values()).find((f) => f.id === fileId);
      return Buffer.from(entry.content, "utf-8");
    },
    uploadNewFile: async (name, buffer) => {
      const id = `id-${++idCounter}`;
      const updatedAt = `t${idCounter}`;
      files.set(name, { id, name, content: buffer.toString("utf-8"), updatedAt, lockedBy: null, lockedAt: null });
      return { id, updatedAt };
    },
    uploadNewVersion: async (fileId, buffer) => {
      const entry = Array.from(files.values()).find((f) => f.id === fileId);
      const updatedAt = `t${++idCounter}`;
      entry.content = buffer.toString("utf-8");
      entry.updatedAt = updatedAt;
      return { updatedAt };
    },
    files,
  };
}

describe("sync-engine (desktop)", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sync-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("baixa um arquivo que só existe na nuvem", async () => {
    const cloud = makeFakeCloud([{ name: "relatorio.txt", content: "conteudo da nuvem" }]);
    const { log } = await runSyncTick(tmpDir, new Map(), cloud);

    const content = await fs.readFile(path.join(tmpDir, "relatorio.txt"), "utf-8");
    expect(content).toBe("conteudo da nuvem");
    expect(log.some((l) => l.kind === "download")).toBe(true);
  });

  it("envia um arquivo que só existe localmente", async () => {
    const cloud = makeFakeCloud();
    await fs.writeFile(path.join(tmpDir, "novo.txt"), "conteudo local");
    const { log } = await runSyncTick(tmpDir, new Map(), cloud);

    expect(cloud.files.has("novo.txt")).toBe(true);
    expect(log.some((l) => l.kind === "upload")).toBe(true);
  });

  it("envia nova versão quando o arquivo mudou só localmente", async () => {
    const cloud = makeFakeCloud([{ name: "doc.txt", content: "versao 1" }]);
    await fs.writeFile(path.join(tmpDir, "doc.txt"), "versao 1");
    const first = await runSyncTick(tmpDir, new Map(), cloud);

    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(path.join(tmpDir, "doc.txt"), "versao 2 (editada local)");
    const second = await runSyncTick(tmpDir, first.knownFiles, cloud);

    expect(cloud.files.get("doc.txt").content).toBe("versao 2 (editada local)");
    expect(second.log.some((l) => l.kind === "upload")).toBe(true);
  });

  it("baixa e atualiza local quando o arquivo mudou só na nuvem", async () => {
    const cloud = makeFakeCloud([{ name: "doc2.txt", content: "versao 1" }]);
    await fs.writeFile(path.join(tmpDir, "doc2.txt"), "versao 1");
    const first = await runSyncTick(tmpDir, new Map(), cloud);

    const entry = Array.from(cloud.files.values()).find((f) => f.name === "doc2.txt");
    entry.content = "versao editada na nuvem";
    entry.updatedAt = "novo-timestamp";
    const second = await runSyncTick(tmpDir, first.knownFiles, cloud);

    const content = await fs.readFile(path.join(tmpDir, "doc2.txt"), "utf-8");
    expect(content).toBe("versao editada na nuvem");
    expect(second.log.some((l) => l.kind === "download")).toBe(true);
  });

  it("resolve conflito (mudou nos dois lados) com o computador vencendo", async () => {
    const cloud = makeFakeCloud([{ name: "doc3.txt", content: "original" }]);
    await fs.writeFile(path.join(tmpDir, "doc3.txt"), "original");
    const first = await runSyncTick(tmpDir, new Map(), cloud);

    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(path.join(tmpDir, "doc3.txt"), "editado no pc");
    const entry = Array.from(cloud.files.values()).find((f) => f.name === "doc3.txt");
    entry.content = "editado na nuvem";
    entry.updatedAt = "outro-timestamp";
    const second = await runSyncTick(tmpDir, first.knownFiles, cloud);

    expect(cloud.files.get("doc3.txt").content).toBe("editado no pc");
    expect(second.log.some((l) => l.kind === "conflict")).toBe(true);
  });

  it("não faz nada quando nada mudou", async () => {
    const cloud = makeFakeCloud([{ name: "parado.txt", content: "sem mudanca" }]);
    await fs.writeFile(path.join(tmpDir, "parado.txt"), "sem mudanca");
    const first = await runSyncTick(tmpDir, new Map(), cloud);
    const second = await runSyncTick(tmpDir, first.knownFiles, cloud);

    expect(second.log.length).toBe(0);
  });

  it("não sobrescreve arquivo travado por outra pessoa", async () => {
    const cloud = makeFakeCloud([
      { name: "travado.txt", content: "original", lockedBy: "maria", lockedAt: new Date().toISOString() },
    ]);
    await fs.writeFile(path.join(tmpDir, "travado.txt"), "original");
    const first = await runSyncTick(tmpDir, new Map(), cloud, "joao");

    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(path.join(tmpDir, "travado.txt"), "joao tentou editar");
    const second = await runSyncTick(tmpDir, first.knownFiles, cloud, "joao");

    expect(cloud.files.get("travado.txt").content).toBe("original");
    expect(second.log.some((l) => l.kind === "conflict" && l.message.includes("maria"))).toBe(true);
  });

  it("permite edição quando a trava é do próprio usuário", async () => {
    const cloud = makeFakeCloud([
      { name: "meu.txt", content: "original", lockedBy: "joao", lockedAt: new Date().toISOString() },
    ]);
    await fs.writeFile(path.join(tmpDir, "meu.txt"), "original");
    const first = await runSyncTick(tmpDir, new Map(), cloud, "joao");

    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(path.join(tmpDir, "meu.txt"), "joao editou o proprio arquivo travado");
    await runSyncTick(tmpDir, first.knownFiles, cloud, "joao");

    expect(cloud.files.get("meu.txt").content).toBe("joao editou o proprio arquivo travado");
  });

  it("permite edição quando a trava de outra pessoa já expirou (mais de 2h)", async () => {
    const oldLock = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const cloud = makeFakeCloud([{ name: "expirado.txt", content: "original", lockedBy: "maria", lockedAt: oldLock }]);
    await fs.writeFile(path.join(tmpDir, "expirado.txt"), "original");
    const first = await runSyncTick(tmpDir, new Map(), cloud, "joao");

    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(path.join(tmpDir, "expirado.txt"), "joao editou apos trava expirada");
    await runSyncTick(tmpDir, first.knownFiles, cloud, "joao");

    expect(cloud.files.get("expirado.txt").content).toBe("joao editou apos trava expirada");
  });

  it("ignora subpastas (nao desce nelas nesta versao)", async () => {
    const cloud = makeFakeCloud();
    await fs.mkdir(path.join(tmpDir, "subpasta"));
    await fs.writeFile(path.join(tmpDir, "subpasta", "dentro.txt"), "nao deveria subir");
    const { log } = await runSyncTick(tmpDir, new Map(), cloud);

    expect(cloud.files.has("dentro.txt")).toBe(false);
    expect(log.length).toBe(0);
  });
});
