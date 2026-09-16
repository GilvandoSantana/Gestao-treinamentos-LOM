/*
 * Design: Industrial Blueprint — Neo-Industrial
 * CloudVersionHistoryModal: histórico de versões de um arquivo — enviar
 * nova versão, baixar ou restaurar uma versão antiga, sem perder nada.
 */

import { useRef, useState } from 'react';
import { X, History, Upload, Download, RotateCcw, Loader, Clock, Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatBytes } from '@shared/cloud';
import { uploadFileInChunks } from '@/lib/chunked-upload';

interface CloudVersionHistoryModalProps {
  fileId: string;
  fileName: string;
  canManage: boolean;
  isMasterAdmin?: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export default function CloudVersionHistoryModal({
  fileId,
  fileName,
  canManage,
  isMasterAdmin,
  onClose,
  onChanged,
}: CloudVersionHistoryModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const versionsQuery = trpc.cloud.listFileVersions.useQuery({ fileId });
  const fileInfoQuery = trpc.cloud.getFileInfo.useQuery({ fileId });
  const sessionQuery = trpc.auth.siteSession.useQuery();
  const restoreMutation = trpc.cloud.restoreFileVersion.useMutation();
  const getVersionUrlMutation = trpc.cloud.getVersionDownloadUrl.useMutation();
  const lockFileMutation = trpc.cloud.lockFile.useMutation();
  const unlockFileMutation = trpc.cloud.unlockFile.useMutation();

  const currentUsername = sessionQuery.data?.username ?? null;
  const lockedBy = fileInfoQuery.data?.lockedBy ?? null;
  const lockedAt = fileInfoQuery.data?.lockedAt ?? null;
  const isLockActive = !!lockedBy && !!lockedAt && Date.now() - new Date(lockedAt).getTime() < 2 * 60 * 60 * 1000;
  const lockedByOther = isLockActive && lockedBy !== currentUsername;
  const lockedByMe = isLockActive && lockedBy === currentUsername;

  const refresh = () =>
    Promise.all([
      utils.cloud.listFileVersions.invalidate({ fileId }),
      utils.cloud.getFileInfo.invalidate({ fileId }),
      utils.cloud.list.invalidate(),
      utils.cloud.storageInfo.invalidate(),
    ]);

  const handleLock = async () => {
    try {
      await lockFileMutation.mutateAsync({ fileId });
      await refresh();
      toast.success('Arquivo marcado como "em edição".');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível travar o arquivo.');
    }
  };

  const handleUnlock = async () => {
    try {
      await unlockFileMutation.mutateAsync({ fileId });
      await refresh();
      toast.success('Edição concluída — o arquivo está liberado de novo.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível liberar o arquivo.');
    }
  };

  const handleUploadNewVersion = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    if (lockedByOther) {
      toast.error(`Este arquivo está sendo editado por ${lockedBy}. Aguarde a pessoa concluir.`);
      return;
    }

    setIsUploading(true);
    setUploadPercent(0);
    try {
      await uploadFileInChunks(
        file,
        { fileId, expectedRevision: fileInfoQuery.data?.revisionToken, fileName: file.name, mimeType: file.type || 'application/octet-stream', fileSize: file.size },
        {
          start: '/api/cloud-version-upload/start',
          part: '/api/cloud-version-upload/part',
          complete: '/api/cloud-version-upload/complete',
        },
        setUploadPercent
      );
      toast.success('Nova versão enviada.');
      await refresh();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar nova versão.');
    } finally {
      setIsUploading(false);
      setUploadPercent(0);
    }
  };

  const handleDownloadVersion = async (versionId: string) => {
    try {
      const { url } = await getVersionUrlMutation.mutateAsync({ fileId, versionId });
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar o download.');
    }
  };

  const handleRestore = async (versionId: string) => {
    if (!window.confirm('Restaurar esta versão? A versão atual não se perde — ela também vira parte do histórico.')) {
      return;
    }
    try {
      await restoreMutation.mutateAsync({ fileId, versionId });
      toast.success('Versão restaurada.');
      await refresh();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao restaurar.');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <p className="flex items-center gap-2 font-display text-sm font-bold text-foreground truncate">
            <History size={17} className="text-orange shrink-0" />
            Versões de "{fileName}"
          </p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={20} />
          </button>
        </div>

        {canManage && (
          <div className="p-4 pb-2 shrink-0 space-y-2">
            {isLockActive && (
              <div
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${
                  lockedByMe ? 'bg-teal/10 text-teal' : 'bg-warning/10 text-warning'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Lock size={13} />
                  {lockedByMe ? 'Você está editando este arquivo' : `Em edição por ${lockedBy}`}
                </span>
                {(lockedByMe || isMasterAdmin) && (
                  <button onClick={handleUnlock} className="flex items-center gap-1 hover:opacity-70 shrink-0">
                    <Unlock size={13} />
                    Concluir edição
                  </button>
                )}
              </div>
            )}
            {!isLockActive && (
              <button
                onClick={handleLock}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:text-warning hover:border-warning transition"
              >
                <Lock size={13} />
                Marcar como "em edição" antes de mexer
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || lockedByOther}
              title={lockedByOther ? `Aguarde ${lockedBy} concluir a edição` : undefined}
              className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2.5 rounded-lg bg-orange text-white hover:opacity-90 disabled:opacity-50"
            >
              {isUploading ? <Loader size={15} className="animate-spin" /> : <Upload size={15} />}
              {isUploading ? `Enviando... ${uploadPercent}%` : 'Enviar nova versão'}
            </button>
            <input ref={fileInputRef} type="file" onChange={handleUploadNewVersion} className="hidden" />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-2">
          {versionsQuery.isLoading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
              <Loader size={14} className="animate-spin" /> Carregando...
            </p>
          )}

          {versionsQuery.data?.map((version) => (
            <div
              key={version.id}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                version.isCurrent ? 'border-orange bg-orange/5' : 'border-border bg-muted/20'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  {version.isCurrent ? 'Versão atual' : 'Versão anterior'}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock size={11} />
                  {new Date(version.createdAt).toLocaleString('pt-BR')}
                  {version.fileSize != null && <> · {formatBytes(version.fileSize)}</>}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleDownloadVersion(version.id)}
                  className="p-2 text-muted-foreground hover:text-orange transition-colors"
                  title="Baixar esta versão"
                >
                  <Download size={15} />
                </button>
                {canManage && !version.isCurrent && (
                  <button
                    onClick={() => handleRestore(version.id)}
                    className="p-2 text-muted-foreground hover:text-teal transition-colors"
                    title="Restaurar esta versão"
                  >
                    <RotateCcw size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
