/*
 * Design: Industrial Blueprint — Neo-Industrial
 * CloudLocalSyncPanel: sincroniza a pasta atual da Nuvem com uma pasta do
 * computador, usando a File System Access API (só Chrome/Edge). Funciona
 * enquanto esta aba estiver aberta — fechar a aba para a sincronização.
 */

import { useEffect, useRef, useState } from 'react';
import { FolderSync, FolderOpen, X, RefreshCw, AlertTriangle, Loader } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import {
  isFileSystemAccessSupported,
  runSyncTick,
  type SyncedFileState,
  type SyncLogEntry,
} from '@/lib/cloud-local-sync';

interface CloudLocalSyncPanelProps {
  folderId: string | null;
  folderName: string;
  canManage: boolean;
}

const SYNC_INTERVAL_MS = 20_000;
const MAX_LOG_ENTRIES = 30;

const LOG_STYLES: Record<SyncLogEntry['kind'], string> = {
  upload: 'text-teal',
  download: 'text-navy',
  conflict: 'text-warning',
  error: 'text-danger',
  info: 'text-muted-foreground',
};

export default function CloudLocalSyncPanel({ folderId, folderName, canManage }: CloudLocalSyncPanelProps) {
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [localFolderName, setLocalFolderName] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [log, setLog] = useState<SyncLogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);

  const knownFilesRef = useRef<Map<string, SyncedFileState>>(new Map());
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const syncedFolderIdRef = useRef<string | null>(null);
  const isTickRunningRef = useRef(false);

  const utils = trpc.useUtils();
  const uploadMutation = trpc.cloud.upload.useMutation();
  const uploadVersionMutation = trpc.cloud.uploadNewVersion.useMutation();
  const getDownloadUrlMutation = trpc.cloud.getDownloadUrl.useMutation();

  const supported = isFileSystemAccessSupported();

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
      reader.readAsDataURL(file);
    });

  const runTick = async () => {
    if (isTickRunningRef.current || !dirHandleRef.current || syncedFolderIdRef.current === undefined) return;
    isTickRunningRef.current = true;
    setIsSyncing(true);
    try {
      const currentFolderId = syncedFolderIdRef.current;
      const result = await runSyncTick(dirHandleRef.current, knownFilesRef.current, {
        listCloudFiles: async () => {
          const data = await utils.client.cloud.list.query({ folderId: currentFolderId });
          return data.files.map((f) => ({
            id: f.id,
            name: f.name,
            fileSize: f.fileSize,
            mimeType: f.mimeType,
            updatedAt: f.updatedAt,
          }));
        },
        downloadCloudFile: async (fileId) => {
          const { url } = await getDownloadUrlMutation.mutateAsync({ id: fileId });
          const res = await fetch(url);
          if (!res.ok) throw new Error('Falha ao baixar o conteúdo');
          return res.blob();
        },
        uploadNewFile: async (file) => {
          const base64 = await readFileAsBase64(file);
          const created = await uploadMutation.mutateAsync({
            folderId: currentFolderId,
            name: file.name,
            fileName: file.name,
            fileData: base64,
            mimeType: file.type || 'application/octet-stream',
          });
          return { id: created.id, updatedAt: created.updatedAt };
        },
        uploadNewVersion: async (fileId, file) => {
          const base64 = await readFileAsBase64(file);
          const updated = await uploadVersionMutation.mutateAsync({
            fileId,
            fileName: file.name,
            fileData: base64,
            mimeType: file.type || 'application/octet-stream',
          });
          return { updatedAt: updated.updatedAt };
        },
      });

      knownFilesRef.current = result.knownFiles;
      if (result.log.length > 0) {
        setLog((prev) => [...result.log, ...prev].slice(0, MAX_LOG_ENTRIES));
        await Promise.all([utils.cloud.list.invalidate(), utils.cloud.storageInfo.invalidate()]);
      }
      setLastSyncAt(new Date());
    } finally {
      isTickRunningRef.current = false;
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (!dirHandle) return;
    dirHandleRef.current = dirHandle;
    syncedFolderIdRef.current = folderId;
    knownFilesRef.current = new Map();
    setLog([]);

    runTick();
    const interval = setInterval(runTick, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirHandle, folderId]);

  const handleConnect = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      setDirHandle(handle);
      setLocalFolderName(handle.name);
      toast.success(`Sincronizando com a pasta "${handle.name}" — mantenha esta aba aberta.`);
    } catch (error) {
      // Usuário cancelou o seletor de pasta — não é erro de verdade.
      if (error instanceof Error && error.name === 'AbortError') return;
      toast.error('Não foi possível conectar à pasta.');
    }
  };

  const handleDisconnect = () => {
    setDirHandle(null);
    dirHandleRef.current = null;
    setLocalFolderName('');
    setLog([]);
    setLastSyncAt(null);
    toast.info('Sincronização com o computador encerrada.');
  };

  if (!canManage) return null;

  if (!supported) {
    return (
      <div className="mb-3 p-3 rounded-lg border border-border bg-muted/20 flex items-start gap-2">
        <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          A sincronização com pasta do computador só funciona no <strong>Chrome</strong> ou{' '}
          <strong>Edge</strong> (Firefox e Safari não têm suporte a esse recurso do navegador).
        </p>
      </div>
    );
  }

  if (!dirHandle) {
    return (
      <button
        onClick={handleConnect}
        className="mb-3 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:text-orange hover:border-orange transition"
      >
        <FolderSync size={14} />
        Sincronizar "{folderName}" com uma pasta do computador
      </button>
    );
  }

  return (
    <div className="mb-3 rounded-lg border border-teal/30 bg-teal/5 overflow-hidden">
      <div className="p-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="p-1.5 rounded-lg bg-teal/10 text-teal shrink-0">
            {isSyncing ? <Loader size={15} className="animate-spin" /> : <FolderOpen size={15} />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">
              Sincronizando com "{localFolderName}"
            </p>
            <p className="text-[11px] text-muted-foreground">
              {isSyncing
                ? 'Sincronizando agora...'
                : lastSyncAt
                  ? `Última sincronização às ${lastSyncAt.toLocaleTimeString('pt-BR')}`
                  : 'Aguardando primeira sincronização...'}
              {' · mantenha esta aba aberta'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={runTick}
            disabled={isSyncing}
            title="Sincronizar agora"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-teal transition disabled:opacity-40"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowLog((v) => !v)}
            className="text-[11px] font-semibold text-muted-foreground hover:text-foreground px-2 py-1"
          >
            {showLog ? 'Ocultar' : 'Ver'} atividade
          </button>
          <button
            onClick={handleDisconnect}
            title="Parar sincronização"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-danger transition"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {showLog && (
        <div className="border-t border-teal/20 p-3 max-h-40 overflow-y-auto space-y-1 bg-card/50">
          {log.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">Nenhuma atividade ainda.</p>
          )}
          {log.map((entry) => (
            <p key={entry.id} className={`text-xs ${LOG_STYLES[entry.kind]}`}>
              <span className="text-muted-foreground">{entry.time.toLocaleTimeString('pt-BR')}</span>{' '}
              {entry.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
