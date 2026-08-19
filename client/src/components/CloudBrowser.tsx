/*
 * Design: Industrial Blueprint — Neo-Industrial
 * CloudBrowser: "Meus arquivos" — navegação por pasta, upload real pro R2,
 * criar pasta, renomear, mover, favoritar, compartilhar, excluir (lixeira).
 */

import { useRef, useState } from 'react';
import {
  Folder,
  FolderPlus,
  Upload,
  Download,
  Trash2,
  ChevronRight,
  Home,
  Loader,
  File as FileIcon,
  MoreVertical,
  Star,
  Pencil,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatBytes } from '@shared/cloud';
import CloudShareDialog from '@/components/CloudShareDialog';

interface CloudBrowserProps {
  canManage: boolean;
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
}

const MAX_UPLOAD_MB = 200;

export default function CloudBrowser({ canManage, currentFolderId, onNavigate }: CloudBrowserProps) {
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; pct: number } | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const listQuery = trpc.cloud.list.useQuery({ folderId: currentFolderId });
  const favoritesQuery = trpc.cloud.listFavorites.useQuery();
  const createFolderMutation = trpc.cloud.createFolder.useMutation();
  const renameFolderMutation = trpc.cloud.renameFolder.useMutation();
  const deleteFolderMutation = trpc.cloud.deleteFolder.useMutation();
  const uploadMutation = trpc.cloud.upload.useMutation();
  const renameFileMutation = trpc.cloud.renameFile.useMutation();
  const deleteFileMutation = trpc.cloud.deleteFile.useMutation();
  const getDownloadUrlMutation = trpc.cloud.getDownloadUrl.useMutation();
  const toggleFavoriteMutation = trpc.cloud.toggleFavorite.useMutation();

  const refresh = () =>
    Promise.all([
      utils.cloud.list.invalidate(),
      utils.cloud.storageInfo.invalidate(),
      utils.cloud.listRecent.invalidate(),
    ]);

  const favoriteFileIds = new Set((favoritesQuery.data ?? []).map((f) => f.fileId).filter(Boolean));
  const favoriteFolderIds = new Set((favoritesQuery.data ?? []).map((f) => f.folderId).filter(Boolean));

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolderMutation.mutateAsync({ parentId: currentFolderId, name: newFolderName.trim() });
      setNewFolderName('');
      setShowNewFolder(false);
      await refresh();
      toast.success('Pasta criada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar pasta.');
    }
  };

  const handleDeleteFolder = async (id: string, name: string) => {
    if (!window.confirm(`Mover a pasta "${name}" (e tudo dentro dela) para a lixeira?`)) return;
    try {
      await deleteFolderMutation.mutateAsync({ id });
      await refresh();
      toast.success('Pasta movida para a lixeira.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir pasta.');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast.error(`O arquivo excede o limite de ${MAX_UPLOAD_MB}MB.`);
      return;
    }

    setIsUploading(true);
    setUploadProgress({ name: file.name, pct: 0 });
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setUploadProgress({ name: file.name, pct: Math.round((ev.loaded / ev.total) * 60) });
          }
        };
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
        reader.readAsDataURL(file);
      });

      setUploadProgress({ name: file.name, pct: 70 });
      await uploadMutation.mutateAsync({
        folderId: currentFolderId,
        name: file.name,
        fileName: file.name,
        fileData: base64,
        mimeType: file.type || 'application/octet-stream',
      });
      setUploadProgress({ name: file.name, pct: 100 });

      await refresh();
      toast.success('Upload concluído.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar arquivo.');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!canManage) return;
    const file = e.dataTransfer.files?.[0];
    if (file && fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
      fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const handleDownload = async (id: string, name: string) => {
    try {
      const { url } = await getDownloadUrlMutation.mutateAsync({ id });
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar o download.');
    }
  };

  const handleDeleteFile = async (id: string, name: string) => {
    if (!window.confirm(`Mover "${name}" para a lixeira?`)) return;
    try {
      await deleteFileMutation.mutateAsync({ id });
      await refresh();
      toast.success('Movido para a lixeira.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir.');
    }
  };

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
    setOpenMenuId(null);
  };

  const confirmRename = async (id: string, isFolder: boolean) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      if (isFolder) await renameFolderMutation.mutateAsync({ id, name: renameValue.trim() });
      else await renameFileMutation.mutateAsync({ id, name: renameValue.trim() });
      setRenamingId(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao renomear.');
    }
  };

  const handleToggleFavorite = async (id: string, isFolder: boolean) => {
    try {
      await toggleFavoriteMutation.mutateAsync(isFolder ? { folderId: id } : { fileId: id });
      await utils.cloud.listFavorites.invalidate();
    } catch (error) {
      toast.error('Erro ao favoritar.');
    }
  };

  const path = listQuery.data?.path ?? [];
  const folders = listQuery.data?.folders ?? [];
  const files = listQuery.data?.files ?? [];
  const isEmpty = folders.length === 0 && files.length === 0;

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 pb-3 text-xs overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          onClick={() => onNavigate(null)}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg shrink-0 transition-colors ${
            currentFolderId === null ? 'text-orange font-semibold' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Home size={13} />
          Meus arquivos
        </button>
        {path.map((folder) => (
          <span key={folder.id} className="flex items-center gap-1 shrink-0">
            <ChevronRight size={13} className="text-muted-foreground" />
            <button
              onClick={() => onNavigate(folder.id)}
              className={`px-2 py-1 rounded-lg transition-colors ${
                folder.id === currentFolderId
                  ? 'text-orange font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {folder.name}
            </button>
          </span>
        ))}
      </div>

      {/* Ações */}
      {canManage && (
        <div className="flex gap-2 pb-3">
          <button
            onClick={() => setShowNewFolder((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/70 transition"
          >
            <FolderPlus size={14} />
            Nova pasta
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-orange text-white hover:opacity-90 disabled:opacity-50 transition"
          >
            {isUploading ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
            {isUploading ? 'Enviando...' : 'Enviar arquivo'}
          </button>
          <input ref={fileInputRef} type="file" onChange={handleFileSelect} className="hidden" />
        </div>
      )}

      {uploadProgress && (
        <div className="mb-3 p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs text-foreground truncate mb-1.5">Enviando {uploadProgress.name}...</p>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-orange transition-all duration-300"
              style={{ width: `${uploadProgress.pct}%` }}
            />
          </div>
        </div>
      )}

      {showNewFolder && (
        <div className="flex gap-2 mb-3">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Nome da pasta"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
          />
          <button
            onClick={handleCreateFolder}
            disabled={createFolderMutation.isPending || !newFolderName.trim()}
            className="shrink-0 px-3 py-2 rounded-lg bg-navy text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            Criar
          </button>
        </div>
      )}

      {/* Conteúdo */}
      {listQuery.isLoading && (
        <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
          <Loader size={14} className="animate-spin" /> Carregando...
        </p>
      )}

      {!listQuery.isLoading && isEmpty && (
        <p className="text-sm text-muted-foreground text-center py-10">
          Pasta vazia.
          {canManage ? ' Arraste um arquivo aqui, ou use os botões acima.' : ''}
        </p>
      )}

      <div className="space-y-1">
        {folders.map((folder) => (
          <div
            key={folder.id}
            className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted transition-colors group"
          >
            {renamingId === folder.id ? (
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmRename(folder.id, true)}
                onBlur={() => confirmRename(folder.id, true)}
                autoFocus
                className="flex-1 px-2 py-1 text-sm border border-orange rounded-lg bg-background text-foreground"
              />
            ) : (
              <button
                onClick={() => onNavigate(folder.id)}
                className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
              >
                <Folder size={18} className="text-orange shrink-0" />
                <span className="text-sm font-medium text-foreground truncate">{folder.name}</span>
                {favoriteFolderIds.has(folder.id) && <Star size={13} className="text-warning fill-warning shrink-0" />}
              </button>
            )}
            {canManage && renamingId !== folder.id && (
              <div className="relative shrink-0">
                <button
                  onClick={() => setOpenMenuId(openMenuId === folder.id ? null : folder.id)}
                  className="p-1.5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical size={15} />
                </button>
                {openMenuId === folder.id && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-card rounded-xl shadow-2xl border border-border overflow-hidden z-20">
                    <button
                      onClick={() => handleToggleFavorite(folder.id, true)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
                    >
                      <Star size={13} />
                      {favoriteFolderIds.has(folder.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                    </button>
                    <button
                      onClick={() => startRename(folder.id, folder.name)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
                    >
                      <Pencil size={13} />
                      Renomear
                    </button>
                    <button
                      onClick={() => {
                        setOpenMenuId(null);
                        handleDeleteFolder(folder.id, folder.name);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-danger hover:bg-muted transition-colors"
                    >
                      <Trash2 size={13} />
                      Mover para a lixeira
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {files.map((file) => (
          <div
            key={file.id}
            className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted transition-colors group"
          >
            {renamingId === file.id ? (
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmRename(file.id, false)}
                onBlur={() => confirmRename(file.id, false)}
                autoFocus
                className="flex-1 px-2 py-1 text-sm border border-orange rounded-lg bg-background text-foreground"
              />
            ) : (
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <FileIcon size={18} className="text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                    {file.name}
                    {favoriteFileIds.has(file.id) && <Star size={12} className="text-warning fill-warning shrink-0" />}
                  </p>
                  <p className="text-xs text-muted-foreground font-technical">{formatBytes(file.fileSize ?? 0)}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleDownload(file.id, file.name)}
                className="p-1.5 text-muted-foreground hover:text-orange transition-colors"
                title="Baixar"
              >
                <Download size={15} />
              </button>
              {canManage && renamingId !== file.id && (
                <div className="relative">
                  <button
                    onClick={() => setOpenMenuId(openMenuId === file.id ? null : file.id)}
                    className="p-1.5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreVertical size={15} />
                  </button>
                  {openMenuId === file.id && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-card rounded-xl shadow-2xl border border-border overflow-hidden z-20">
                      <button
                        onClick={() => handleToggleFavorite(file.id, false)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
                      >
                        <Star size={13} />
                        {favoriteFileIds.has(file.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                      </button>
                      <button
                        onClick={() => startRename(file.id, file.name)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
                      >
                        <Pencil size={13} />
                        Renomear
                      </button>
                      <button
                        onClick={() => {
                          setOpenMenuId(null);
                          setShareTarget({ id: file.id, name: file.name });
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
                      >
                        <Share2 size={13} />
                        Compartilhar
                      </button>
                      <button
                        onClick={() => {
                          setOpenMenuId(null);
                          handleDeleteFile(file.id, file.name);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-danger hover:bg-muted transition-colors"
                      >
                        <Trash2 size={13} />
                        Mover para a lixeira
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {shareTarget && (
        <CloudShareDialog
          fileId={shareTarget.id}
          fileName={shareTarget.name}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  );
}
