import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { runSyncTick } from "./sync-engine.js";

function makeFakeCloud(seedFolders = []) {
  let idCounter = 0;
  // folders: Map<folderId|null(raiz), { folders: [], files: Map<name, fileEntry> }>
  const tree = new Map();
  tree.set("root", { folders: [], files: new Map() });
  const folderMeta = new Map(); // folderId -> { name, parentKey }

  function keyFor(folderId) {
    return folderId ?? "root";
  }

  // Semeia estrutura inicial, se houver: seedFolders = [{ name, parentId, files: [{name, content}] }]
  for (const f of seedFolders) {
    idCounter++;
    const id = `folder-${idCounter}`;
    const parentKey = keyFor(f.parentId ?? null);
    tree.get(parentKey).folders.push({ id, name: f.name, hasAccess: true });
    tree.set(id, { folders: [], files: new Map() });
    folderMeta.set(id, { name: f.name });
    for (const file of f.files || []) {
      idCounter++;
      tree.get(id).files.set(file.name, {
        id: `file-${idCounter}`,
        name: file.name,
        content: file.content,
        updatedAt: `t${idCounter}`,
        lockedBy: file.lockedBy ?? null,
        lockedAt: file.lockedAt ?? null,
      });
    }
  }

  return {
    listFolder: async (folderId) => {
      const node = tree.get(keyFor(folderId)) || { folders: [], files: new Map() };
      return {
        folders: node.folders,
        files: Array.from(node.files.values()).map((f) => ({
          id: f.id,
          name: f.name,
          updatedAt: f.updatedAt,
          lockedBy: f.lockedBy,
          lockedAt: f.lockedAt,
        })),
      };
    },
    downloadCloudFile: async (fileId) => {
      for (const node of tree.values()) {
        const entry = Array.from(node.files.values()).find((f) => f.id === fileId);
        if (entry) return Buffer.from(entry.content, "utf-8");
      }
      throw new Error("arquivo não encontrado");
    },
    uploadNewFile: async (folderId, name, buffer) => {
      const id = `file-${++idCounter}`;
      const updatedAt = `t${idCounter}`;
      tree.get(keyFor(folderId)).files.set(name, {
        id,
        name,
        content: buffer.toString("utf-8"),
        updatedAt,
        lockedBy: null,
        lockedAt: null,
      });
      return { id, updatedAt };
    },
    uploadNewVersion: async (fileId, buffer) => {
      for (const node of tree.values()) {
        const entry = Array.from(node.files.values()).find((f) => f.id === fileId);
        if (entry) {
          const updatedAt = `t${++idCounter}`;
          entry.content = buffer.toString("utf-8");
          entry.updatedAt = updatedAt;
          return { updatedAt };
        }
      }
      throw new Error("arquivo não encontrado");
    },
    createRemoteFolder: async (parentId, name) => {
      const id = `folder-${++idCounter}`;
      tree.get(keyFor(parentId)).folders.push({ id, name, hasAccess: true });
      tree.set(id, { folders: [], files: new Map() });
      return { id };
    },
    _tree: tree,
  };
}

describe("sync-engine (desktop) — arquivos na raiz", () => {
  let tmpDir;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sync-test-"));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("baixa um arquivo que só existe na nuvem", async () => {
    const cloud = makeFakeCloud([{ name: "_root_placeholder", parentId: null, files: [] }]);
    // usa a raiz de verdade (folderId null), nao a pasta fake acima
    await cloud.uploadNewFile(null, "relatorio.txt", Buffer.from("conteudo da nuvem"));
    const { log } = await runSyncTick(tmpDir, new Map(), cloud);

    const content = await fs.readFile(path.join(tmpDir, "relatorio.txt"), "utf-8");
    expect(content).toBe("conteudo da nuvem");
    expect(log.some((l) => l.kind === "download")).toBe(true);
  });

  it("envia um arquivo que só existe localmente", async () => {
    const cloud = makeFakeCloud();
    await fs.writeFile(path.join(tmpDir, "novo.txt"), "conteudo local");
    const { log } = await runSyncTick(tmpDir, new Map(), cloud);

    const raiz = await cloud.listFolder(null);
    expect(raiz.files.some((f) => f.name === "novo.txt")).toBe(true);
    expect(log.some((l) => l.kind === "upload")).toBe(true);
  });

  it("não faz nada quando nada mudou", async () => {
    const cloud = makeFakeCloud();
    await cloud.uploadNewFile(null, "parado.txt", Buffer.from("sem mudanca"));
    await fs.writeFile(path.join(tmpDir, "parado.txt"), "sem mudanca");
    const first = await runSyncTick(tmpDir, new Map(), cloud);
    const second = await runSyncTick(tmpDir, first.knownFiles, cloud);

    expect(second.log.length).toBe(0);
  });

  it("não sobrescreve arquivo travado por outra pessoa", async () => {
    const cloud = makeFakeCloud();
    const { id } = await cloud.uploadNewFile(null, "travado.txt", Buffer.from("original"));
    const entry = (await cloud._tree.get("root").files).get("travado.txt");
    entry.lockedBy = "maria";
    entry.lockedAt = new Date().toISOString();
    await fs.writeFile(path.join(tmpDir, "travado.txt"), "original");

    const first = await runSyncTick(tmpDir, new Map(), cloud, "joao");
    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(path.join(tmpDir, "travado.txt"), "joao tentou editar");
    const second = await runSyncTick(tmpDir, first.knownFiles, cloud, "joao");

    const raiz = await cloud.listFolder(null);
    const fresh = await cloud.downloadCloudFile(raiz.files.find((f) => f.name === "travado.txt").id);
    expect(fresh.toString("utf-8")).toBe("original");
    expect(second.log.some((l) => l.kind === "conflict" && l.message.includes("maria"))).toBe(true);
  });
});

describe("sync-engine (desktop) — subpastas recursivas", () => {
  let tmpDir;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sync-test-folders-"));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("baixa uma subpasta da nuvem com seus arquivos, criando a pasta local", async () => {
    const cloud = makeFakeCloud([
      { name: "Contratos", parentId: null, files: [{ name: "doc.txt", content: "conteudo do contrato" }] },
    ]);
    const { log } = await runSyncTick(tmpDir, new Map(), cloud);

    const subpastaExiste = await fs
      .stat(path.join(tmpDir, "Contratos"))
      .then((s) => s.isDirectory())
      .catch(() => false);
    expect(subpastaExiste).toBe(true);

    const content = await fs.readFile(path.join(tmpDir, "Contratos", "doc.txt"), "utf-8");
    expect(content).toBe("conteudo do contrato");
    expect(log.some((l) => l.message.includes("Contratos/doc.txt"))).toBe(true);
  });

  it("sobe uma pasta criada só no computador, com o arquivo dentro dela", async () => {
    const cloud = makeFakeCloud();
    await fs.mkdir(path.join(tmpDir, "NovaPasta"));
    await fs.writeFile(path.join(tmpDir, "NovaPasta", "arquivo.txt"), "conteudo novo");

    const { log } = await runSyncTick(tmpDir, new Map(), cloud);

    const raiz = await cloud.listFolder(null);
    expect(raiz.folders.some((f) => f.name === "NovaPasta")).toBe(true);
    const novaPastaId = raiz.folders.find((f) => f.name === "NovaPasta").id;
    const dentro = await cloud.listFolder(novaPastaId);
    expect(dentro.files.some((f) => f.name === "arquivo.txt")).toBe(true);
    expect(log.some((l) => l.kind === "upload" && l.message.includes("NovaPasta"))).toBe(true);
  });

  it("desce em várias camadas de subpasta (pasta dentro de pasta)", async () => {
    const cloud = makeFakeCloud();
    const nivel1 = await cloud.createRemoteFolder(null, "Nivel1");
    const nivel2 = await cloud.createRemoteFolder(nivel1.id, "Nivel2");
    await cloud.uploadNewFile(nivel2.id, "fundo.txt", Buffer.from("bem no fundo"));

    await runSyncTick(tmpDir, new Map(), cloud);

    const content = await fs.readFile(path.join(tmpDir, "Nivel1", "Nivel2", "fundo.txt"), "utf-8");
    expect(content).toBe("bem no fundo");
  });

  it("mostra a pasta sem permissão (vazia), mas nunca desce nela pra ver o conteúdo", async () => {
    // Mesmo comportamento do site: a pasta APARECE na listagem (lá, meio
    // apagada visualmente), só não dá pra entrar e ver o que tem dentro.
    const cloud = makeFakeCloud();
    const restrita = await cloud.createRemoteFolder(null, "Restrita");
    cloud._tree.get("root").folders.find((f) => f.id === restrita.id).hasAccess = false;
    await cloud.uploadNewFile(restrita.id, "secreto.txt", Buffer.from("nao deveria descer"));

    await runSyncTick(tmpDir, new Map(), cloud);

    const stat = await fs.stat(path.join(tmpDir, "Restrita"));
    expect(stat.isDirectory()).toBe(true);

    const dentro = await fs.readdir(path.join(tmpDir, "Restrita"));
    expect(dentro).toEqual([]);
  });

  it("mantém arquivos com o mesmo nome em pastas diferentes sem confundir um com o outro", async () => {
    const cloud = makeFakeCloud();
    const pastaA = await cloud.createRemoteFolder(null, "PastaA");
    const pastaB = await cloud.createRemoteFolder(null, "PastaB");
    await cloud.uploadNewFile(pastaA.id, "notas.txt", Buffer.from("notas da pasta A"));
    await cloud.uploadNewFile(pastaB.id, "notas.txt", Buffer.from("notas da pasta B"));

    await runSyncTick(tmpDir, new Map(), cloud);

    const contentA = await fs.readFile(path.join(tmpDir, "PastaA", "notas.txt"), "utf-8");
    const contentB = await fs.readFile(path.join(tmpDir, "PastaB", "notas.txt"), "utf-8");
    expect(contentA).toBe("notas da pasta A");
    expect(contentB).toBe("notas da pasta B");
  });

  it("segundo ciclo não refaz nada se nada mudou numa estrutura com subpastas", async () => {
    const cloud = makeFakeCloud([{ name: "Pasta", parentId: null, files: [{ name: "a.txt", content: "x" }] }]);
    const first = await runSyncTick(tmpDir, new Map(), cloud);
    const second = await runSyncTick(tmpDir, first.knownFiles, cloud);
    expect(second.log.length).toBe(0);
  });
});

describe("sync-engine (desktop) — nunca envia arquivo do próprio sistema", () => {
  // Achado real (01/09): o programa enviou um "desktop.ini" pra Nuvem sem
  // ninguém pedir isso, junto com arquivos pessoais de uma pasta que não
  // devia ter sido escolhida. Esses testes garantem que esse tipo de
  // arquivo nunca mais é considerado "arquivo novo pra subir", não
  // importa a pasta escolhida.
  let tmpDir;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sync-test-ignored-"));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("nunca envia desktop.ini, Thumbs.db, .DS_Store ou arquivo temporário do Office", async () => {
    const cloud = makeFakeCloud();
    await fs.writeFile(path.join(tmpDir, "desktop.ini"), "[.ShellClassInfo]");
    await fs.writeFile(path.join(tmpDir, "Thumbs.db"), "lixo binario");
    await fs.writeFile(path.join(tmpDir, ".DS_Store"), "lixo binario");
    await fs.writeFile(path.join(tmpDir, "~$documento.docx"), "arquivo temporario do Word");
    await fs.writeFile(path.join(tmpDir, "planilha.tmp"), "arquivo temporario");
    await fs.writeFile(path.join(tmpDir, "arquivo-de-verdade.txt"), "esse sim deveria subir");

    const { log } = await runSyncTick(tmpDir, new Map(), cloud);

    const raiz = await cloud.listFolder(null);
    const nomesEnviados = raiz.files.map((f) => f.name);
    expect(nomesEnviados).toEqual(["arquivo-de-verdade.txt"]);
    expect(log.filter((l) => l.kind === "upload")).toHaveLength(1);
  });
});
