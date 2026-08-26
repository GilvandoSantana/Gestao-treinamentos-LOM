/**
 * Sincronização de pasta local — usa a File System Access API do navegador
 * (Chrome/Edge) pra ler/escrever direto numa pasta do computador, sem
 * precisar instalar nada. Só funciona enquanto a aba estiver aberta: não é
 * um serviço rodando sozinho em segundo plano, é uma sincronização "ao
 * vivo" que acontece a cada intervalo enquanto essa tela está no ar.
 *
 * Limitações conhecidas, por design (documentadas pro usuário na tela):
 * - Só Chrome/Edge (Firefox e Safari não implementam essa API)
 * - Para de sincronizar se a aba for fechada ou recarregada
 * - Não sincroniza exclusão: apagar local ou na nuvem não apaga do outro
 *   lado (evita perda de dado por engano)
 * - Em caso de conflito (mudou dos dois lados ao mesmo tempo), o lado local
 *   vence — mas nada se perde de verdade, porque a nuvem já guarda o
 *   conteúdo anterior no histórico de versões
 */

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export interface SyncedFileState {
  cloudFileId: string;
  cloudUpdatedAt: string;
  localLastModified: number;
}

export interface SyncLogEntry {
  id: string;
  time: Date;
  message: string;
  kind: 'upload' | 'download' | 'conflict' | 'error' | 'info';
}

export interface CloudFileForSync {
  id: string;
  name: string;
  fileSize: number | null;
  mimeType: string | null;
  updatedAt: string;
  lockedBy: string | null;
  lockedAt: string | null;
}

// Mesma regra de expiração usada no servidor (server/db-cloud.ts) — mantida
// em espelho aqui só pra decidir se vale a pena nem tentar enviar, o
// servidor sempre valida de novo antes de aceitar.
const LOCK_DURATION_MS = 2 * 60 * 60 * 1000;
function isLockActiveClient(lockedBy: string | null, lockedAt: string | null): boolean {
  if (!lockedBy || !lockedAt) return false;
  return Date.now() - new Date(lockedAt).getTime() < LOCK_DURATION_MS;
}

export interface SyncCallbacks {
  /** Lista os arquivos atuais da pasta da nuvem sendo sincronizada. */
  listCloudFiles: () => Promise<CloudFileForSync[]>;
  /** Baixa o conteúdo de um arquivo da nuvem (como Blob). */
  downloadCloudFile: (fileId: string) => Promise<Blob>;
  /** Envia um arquivo novo (que só existe localmente) pra nuvem. */
  uploadNewFile: (file: File) => Promise<{ id: string; updatedAt: string }>;
  /** Envia uma nova versão de um arquivo que já existe na nuvem. */
  uploadNewVersion: (fileId: string, file: File) => Promise<{ updatedAt: string }>;
}

/**
 * Roda uma passada de sincronização entre a pasta local e a pasta da nuvem.
 * Devolve o novo mapa de estado conhecido e as entradas de log geradas.
 */
export async function runSyncTick(
  dirHandle: FileSystemDirectoryHandle,
  knownFiles: Map<string, SyncedFileState>,
  callbacks: SyncCallbacks,
  currentUsername?: string
): Promise<{ knownFiles: Map<string, SyncedFileState>; log: SyncLogEntry[] }> {
  const log: SyncLogEntry[] = [];
  const nextKnown = new Map(knownFiles);

  const addLog = (message: string, kind: SyncLogEntry['kind']) => {
    log.push({ id: crypto.randomUUID(), time: new Date(), message, kind });
  };

  let cloudFiles: CloudFileForSync[];
  try {
    cloudFiles = await callbacks.listCloudFiles();
  } catch (error) {
    addLog(`Falha ao consultar a Nuvem: ${error instanceof Error ? error.message : 'erro desconhecido'}`, 'error');
    return { knownFiles: nextKnown, log };
  }
  const cloudByName = new Map(cloudFiles.map((f) => [f.name, f]));

  // Lê a pasta local inteira (só arquivos, ignora subpastas — a sincronização
  // não desce em subpastas nesta primeira versão).
  const localByName = new Map<string, FileSystemFileHandle>();
  try {
    for await (const [name, handle] of (dirHandle as any).entries()) {
      if (handle.kind === 'file') localByName.set(name, handle);
    }
  } catch (error) {
    addLog(`Falha ao ler a pasta local: ${error instanceof Error ? error.message : 'erro desconhecido'}`, 'error');
    return { knownFiles: nextKnown, log };
  }

  // --- 1. Arquivos que só existem na nuvem → baixar ---
  for (const [name, cloudFile] of Array.from(cloudByName)) {
    if (localByName.has(name)) continue;
    try {
      const blob = await callbacks.downloadCloudFile(cloudFile.id);
      const fileHandle = await dirHandle.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      const written = await fileHandle.getFile();
      nextKnown.set(name, {
        cloudFileId: cloudFile.id,
        cloudUpdatedAt: cloudFile.updatedAt,
        localLastModified: written.lastModified,
      });
      addLog(`Baixado "${name}" (novo na Nuvem).`, 'download');
    } catch (error) {
      addLog(`Erro ao baixar "${name}": ${error instanceof Error ? error.message : 'erro desconhecido'}`, 'error');
    }
  }

  // --- 2. Arquivos que só existem localmente → enviar ---
  for (const [name, handle] of Array.from(localByName)) {
    if (cloudByName.has(name)) continue;
    try {
      const file = await handle.getFile();
      const result = await callbacks.uploadNewFile(file);
      nextKnown.set(name, {
        cloudFileId: result.id,
        cloudUpdatedAt: result.updatedAt,
        localLastModified: file.lastModified,
      });
      addLog(`Enviado "${name}" (novo no computador).`, 'upload');
    } catch (error) {
      addLog(`Erro ao enviar "${name}": ${error instanceof Error ? error.message : 'erro desconhecido'}`, 'error');
    }
  }

  // --- 3. Arquivos que existem nos dois lados → comparar e decidir ---
  for (const [name, handle] of Array.from(localByName)) {
    const cloudFile = cloudByName.get(name);
    if (!cloudFile) continue;

    const known = nextKnown.get(name);
    let localFile: File;
    try {
      localFile = await handle.getFile();
    } catch (error) {
      addLog(`Erro ao ler "${name}" localmente: ${error instanceof Error ? error.message : 'erro'}`, 'error');
      continue;
    }

    if (!known) {
      // Primeira vez que vemos esse nome nos dois lados ao mesmo tempo —
      // assume que já são a mesma coisa, só registra a partir de agora
      // (evita sobrescrever algo sem necessidade logo no primeiro ciclo).
      nextKnown.set(name, {
        cloudFileId: cloudFile.id,
        cloudUpdatedAt: cloudFile.updatedAt,
        localLastModified: localFile.lastModified,
      });
      continue;
    }

    const localChanged = localFile.lastModified > known.localLastModified;
    const cloudChanged = cloudFile.updatedAt !== known.cloudUpdatedAt;

    if (!localChanged && !cloudChanged) continue;

    const lockedByOther =
      isLockActiveClient(cloudFile.lockedBy, cloudFile.lockedAt) && cloudFile.lockedBy !== currentUsername;

    if (localChanged && !cloudChanged) {
      if (lockedByOther) {
        addLog(
          `"${name}" está sendo editado por ${cloudFile.lockedBy} — a edição local não foi enviada. Tente de novo depois que a pessoa concluir.`,
          'conflict'
        );
        continue;
      }
      try {
        const result = await callbacks.uploadNewVersion(cloudFile.id, localFile);
        nextKnown.set(name, {
          cloudFileId: cloudFile.id,
          cloudUpdatedAt: result.updatedAt,
          localLastModified: localFile.lastModified,
        });
        addLog(`Enviada nova versão de "${name}" (editado no computador).`, 'upload');
      } catch (error) {
        addLog(`Erro ao enviar "${name}": ${error instanceof Error ? error.message : 'erro'}`, 'error');
      }
      continue;
    }

    if (cloudChanged && !localChanged) {
      try {
        const blob = await callbacks.downloadCloudFile(cloudFile.id);
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        const written = await handle.getFile();
        nextKnown.set(name, {
          cloudFileId: cloudFile.id,
          cloudUpdatedAt: cloudFile.updatedAt,
          localLastModified: written.lastModified,
        });
        addLog(`Atualizado "${name}" (editado na Nuvem).`, 'download');
      } catch (error) {
        addLog(`Erro ao atualizar "${name}": ${error instanceof Error ? error.message : 'erro'}`, 'error');
      }
      continue;
    }

    if (lockedByOther) {
      addLog(
        `"${name}" mudou nos dois lados e está sendo editado por ${cloudFile.lockedBy} — nada foi enviado por segurança.`,
        'conflict'
      );
      continue;
    }

    // Mudou dos dois lados ao mesmo tempo — o computador vence, mas nada se
    // perde: a versão da nuvem que seria substituída fica guardada no
    // histórico de versões do próprio arquivo.
    try {
      const result = await callbacks.uploadNewVersion(cloudFile.id, localFile);
      nextKnown.set(name, {
        cloudFileId: cloudFile.id,
        cloudUpdatedAt: result.updatedAt,
        localLastModified: localFile.lastModified,
      });
      addLog(
        `"${name}" mudou nos dois lados ao mesmo tempo — mantido o do computador (a versão anterior da Nuvem continua salva no histórico de versões).`,
        'conflict'
      );
    } catch (error) {
      addLog(`Erro ao resolver conflito de "${name}": ${error instanceof Error ? error.message : 'erro'}`, 'error');
    }
  }

  return { knownFiles: nextKnown, log };
}
