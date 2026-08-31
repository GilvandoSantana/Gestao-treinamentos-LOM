import { describe, it, expect } from "vitest";
import { runSyncTick, type CloudFileForSync } from "./cloud-local-sync";

function makeFile(name: string, content: string, lastModified: number) {
  return { name, _content: content, lastModified };
}

function makeFileHandle(fileRef: { name: string; _content: string; lastModified: number }): any {
  return {
    kind: "file",
    getFile: async () => ({
      name: fileRef.name,
      size: fileRef._content.length,
      lastModified: fileRef.lastModified,
      text: async () => fileRef._content,
      _content: fileRef._content,
    }),
    createWritable: async () => ({
      write: async (data: any) => {
        fileRef._content = typeof data === "string" ? data : await data.text();
      },
      close: async () => {},
    }),
  };
}

function makeDirHandle(initialFiles: { name: string; _content: string; lastModified: number }[]): any {
  const files = new Map(initialFiles.map((f) => [f.name, f]));
  return {
    entries: async function* () {
      for (const [name, f] of Array.from(files)) yield [name, makeFileHandle(f)];
    },
    getFileHandle: async (name: string, opts?: { create?: boolean }) => {
      if (!files.has(name)) {
        if (!opts?.create) throw new Error("not found");
        files.set(name, makeFile(name, "", Date.now()));
      }
      return makeFileHandle(files.get(name)!);
    },
    _files: files,
  };
}

function makeFakeCloud(seed: { name: string; content: string; lockedBy?: string; lockedAt?: string }[] = []) {
  let idCounter = 0;
  const files = new Map<string, { id: string; name: string; content: string; updatedAt: string; lockedBy: string | null; lockedAt: string | null }>();
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
    listCloudFiles: async (): Promise<CloudFileForSync[]> =>
      Array.from(files.values()).map((f) => ({
        id: f.id,
        name: f.name,
        fileSize: f.content.length,
        mimeType: "text/plain",
        updatedAt: f.updatedAt,
        lockedBy: f.lockedBy,
        lockedAt: f.lockedAt,
      })),
    downloadCloudFile: async (fileId: string): Promise<any> => {
      const entry = Array.from(files.values()).find((f) => f.id === fileId)!;
      return { text: async () => entry.content };
    },
    uploadNewFile: async (file: any) => {
      const id = `id-${++idCounter}`;
      const updatedAt = `t${idCounter}`;
      files.set(file.name, { id, name: file.name, content: file._content, updatedAt, lockedBy: null, lockedAt: null });
      return { id, updatedAt };
    },
    uploadNewVersion: async (fileId: string, file: any) => {
      const entry = Array.from(files.values()).find((f) => f.id === fileId)!;
      const updatedAt = `t${++idCounter}`;
      entry.content = file._content;
      entry.updatedAt = updatedAt;
      return { updatedAt };
    },
    files,
  };
}

describe("cloud-local-sync", () => {
  it("baixa um arquivo que só existe na nuvem", async () => {
    const cloud = makeFakeCloud([{ name: "relatorio.txt", content: "conteudo da nuvem" }]);
    const dir = makeDirHandle([]);
    const { knownFiles, log } = await runSyncTick(dir, new Map(), cloud);

    expect(dir._files.has("relatorio.txt")).toBe(true);
    expect(dir._files.get("relatorio.txt")._content).toBe("conteudo da nuvem");
    expect(log.some((l) => l.kind === "download")).toBe(true);
    expect(knownFiles.has("relatorio.txt")).toBe(true);
  });

  it("envia um arquivo que só existe localmente", async () => {
    const cloud = makeFakeCloud();
    const dir = makeDirHandle([makeFile("novo.txt", "conteudo local", Date.now())]);
    const { log } = await runSyncTick(dir, new Map(), cloud);

    expect(cloud.files.has("novo.txt")).toBe(true);
    expect(log.some((l) => l.kind === "upload")).toBe(true);
  });

  it("envia nova versão quando o arquivo mudou só localmente", async () => {
    const cloud = makeFakeCloud([{ name: "doc.txt", content: "versao 1" }]);
    const dir = makeDirHandle([makeFile("doc.txt", "versao 1", 1000)]);
    const first = await runSyncTick(dir, new Map(), cloud);

    dir._files.get("doc.txt")._content = "versao 2 (editada local)";
    dir._files.get("doc.txt").lastModified = 2000;
    const second = await runSyncTick(dir, first.knownFiles, cloud);

    expect(cloud.files.get("doc.txt")!.content).toBe("versao 2 (editada local)");
    expect(second.log.some((l) => l.kind === "upload")).toBe(true);
  });

  it("baixa e atualiza local quando o arquivo mudou só na nuvem", async () => {
    const cloud = makeFakeCloud([{ name: "doc2.txt", content: "versao 1" }]);
    const dir = makeDirHandle([makeFile("doc2.txt", "versao 1", 1000)]);
    const first = await runSyncTick(dir, new Map(), cloud);

    const entry = Array.from(cloud.files.values()).find((f) => f.name === "doc2.txt")!;
    entry.content = "versao editada na nuvem";
    entry.updatedAt = "novo-timestamp";
    const second = await runSyncTick(dir, first.knownFiles, cloud);

    expect(dir._files.get("doc2.txt")._content).toBe("versao editada na nuvem");
    expect(second.log.some((l) => l.kind === "download")).toBe(true);
  });

  it("resolve conflito (mudou nos dois lados) com o computador vencendo", async () => {
    const cloud = makeFakeCloud([{ name: "doc3.txt", content: "original" }]);
    const dir = makeDirHandle([makeFile("doc3.txt", "original", 1000)]);
    const first = await runSyncTick(dir, new Map(), cloud);

    dir._files.get("doc3.txt")._content = "editado no pc";
    dir._files.get("doc3.txt").lastModified = 2000;
    const entry = Array.from(cloud.files.values()).find((f) => f.name === "doc3.txt")!;
    entry.content = "editado na nuvem";
    entry.updatedAt = "outro-timestamp";
    const second = await runSyncTick(dir, first.knownFiles, cloud);

    expect(cloud.files.get("doc3.txt")!.content).toBe("editado no pc");
    expect(second.log.some((l) => l.kind === "conflict")).toBe(true);
  });

  it("não faz nada quando nada mudou", async () => {
    const cloud = makeFakeCloud([{ name: "parado.txt", content: "sem mudanca" }]);
    const dir = makeDirHandle([makeFile("parado.txt", "sem mudanca", 1000)]);
    const first = await runSyncTick(dir, new Map(), cloud);
    const second = await runSyncTick(dir, first.knownFiles, cloud);

    expect(second.log.length).toBe(0);
  });

  it("não sobrescreve arquivo travado por outra pessoa", async () => {
    const cloud = makeFakeCloud([
      { name: "travado.txt", content: "original", lockedBy: "maria", lockedAt: new Date().toISOString() },
    ]);
    const dir = makeDirHandle([makeFile("travado.txt", "original", 1000)]);
    const first = await runSyncTick(dir, new Map(), cloud, "joao");

    dir._files.get("travado.txt")._content = "joao tentou editar";
    dir._files.get("travado.txt").lastModified = 2000;
    const second = await runSyncTick(dir, first.knownFiles, cloud, "joao");

    expect(cloud.files.get("travado.txt")!.content).toBe("original");
    expect(second.log.some((l) => l.kind === "conflict" && l.message.includes("maria"))).toBe(true);
  });

  it("permite edição quando a trava é do próprio usuário", async () => {
    const cloud = makeFakeCloud([
      { name: "meu.txt", content: "original", lockedBy: "joao", lockedAt: new Date().toISOString() },
    ]);
    const dir = makeDirHandle([makeFile("meu.txt", "original", 1000)]);
    const first = await runSyncTick(dir, new Map(), cloud, "joao");

    dir._files.get("meu.txt")._content = "joao editou o proprio arquivo travado";
    dir._files.get("meu.txt").lastModified = 2000;
    await runSyncTick(dir, first.knownFiles, cloud, "joao");

    expect(cloud.files.get("meu.txt")!.content).toBe("joao editou o proprio arquivo travado");
  });

  it("permite edição quando a trava de outra pessoa já expirou (mais de 2h)", async () => {
    const oldLock = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const cloud = makeFakeCloud([{ name: "expirado.txt", content: "original", lockedBy: "maria", lockedAt: oldLock }]);
    const dir = makeDirHandle([makeFile("expirado.txt", "original", 1000)]);
    const first = await runSyncTick(dir, new Map(), cloud, "joao");

    dir._files.get("expirado.txt")._content = "joao editou apos trava expirada";
    dir._files.get("expirado.txt").lastModified = 2000;
    await runSyncTick(dir, first.knownFiles, cloud, "joao");

    expect(cloud.files.get("expirado.txt")!.content).toBe("joao editou apos trava expirada");
  });
});
