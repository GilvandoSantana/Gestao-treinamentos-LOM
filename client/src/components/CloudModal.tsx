/*
 * Design: Industrial Blueprint — Neo-Industrial
 * CloudModal: nuvem de arquivos por contrato, estilo SharePoint — pastas,
 * upload e download. O acesso é controlado pelas permissões
 * viewCloud/manageCloud, individuais por usuário (não é liberado sozinho
 * junto com outras permissões).
 */

import { useRef, useState } from 'react';
import {
  X,
  Cloud,
  Folder,
  FolderPlus,
  Upload,
  Download,
  Trash2,
  ChevronRight,
  Home,
  Loader,
  File as FileIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface CloudModalProps {
  isOpen: boolean;
  onClose: () => void;
  canManage: boolean;
}

const MAX_MB = 20;

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CloudModal({ isOpen, onClose, canManage }: CloudModalProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const listQuery = trpc.cloud.list.useQuery({ folderId: currentFolderId }, { enabled: isOpen });
  const createFolderMutation = trpc.cloud.createFolder.useMutation();
  const deleteFolderMutation = trpc.cloud.deleteFolder.useMutation();
  const uploadMutation = trpc.cloud.upload.useMutation();
  const deleteFileMutation = trpc.cloud.deleteFile.useMutation();
  const [isUploading, setIsUploading] = useState(false);

  const refresh = () => utils.cloud.list.invalidate();

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
    if (!window.confirm(`Excluir a pasta "${name}" e tudo dentro dela? Não é possível desfazer.`)) return;
    try {
      await deleteFolderMutation.mutateAsync({ id });
      await refresh();
      toast.success('Pasta excluída.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir pasta.');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`O arquivo excede o limite de ${MAX_MB}MB.`);
      return;
    }

    setIsUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
        reader.readAsDataURL(file);
      });

      await uploadMutation.mutateAsync({
        folderId: currentFolderId,
        name: file.name,
        fileName: file.name,
        fileData: base64,
        mimeType: file.type || 'application/octet-stream',
      });

      await refresh();
      toast.success('Arquivo enviado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar arquivo.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteFile = async (id: string, name: string) => {
    if (!window.confirm(`Excluir "${name}"?`)) return;
    try {
      await deleteFileMutation.mutateAsync({ id });
      await refresh();
      toast.success('Arquivo excluído.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir arquivo.');
    }
  };

  if (!isOpen) return null;

  const path = listQuery.data?.path ?? [];
  const folders = listQuery.data?.folders ?? [];
  const files = listQuery.data?.files ?? [];
  const isEmpty = folders.length === 0 && files.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <Cloud className="text-orange shrink-0" size={21} />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-foreground truncate">Nuvem de Arquivos</h2>
              <p className="text-xs text-muted-foreground">Pastas e arquivos do contrato</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={23} />
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 px-4 pt-3 text-xs overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setCurrentFolderId(null)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg shrink-0 transition-colors ${
              currentFolderId === null ? 'text-orange font-semibold' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Home size={13} />
            Raiz
          </button>
          {path.map((folder) => (
            <span key={folder.id} className="flex items-center gap-1 shrink-0">
              <ChevronRight size={13} className="text-muted-foreground" />
              <button
                onClick={() => setCurrentFolderId(folder.id)}
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
          <div className="flex gap-2 px-4 pt-3">
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

        {showNewFolder && (
          <div className="flex gap-2 px-4 pt-2">
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
        <div className="flex-1 overflow-y-auto p-4">
          {listQuery.isLoading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
              <Loader size={14} className="animate-spin" /> Carregando...
            </p>
          )}

          {!listQuery.isLoading && isEmpty && (
            <p className="text-sm text-muted-foreground text-center py-10">
              Pasta vazia.
              {canManage ? ' Use os botões acima para criar uma pasta ou enviar um arquivo.' : ''}
            </p>
          )}

          <div className="space-y-1">
            {folders.map((folder) => (
              <div
                key={folder.id}
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted transition-colors group"
              >
                <button
                  onClick={() => setCurrentFolderId(folder.id)}
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                >
                  <Folder size={18} className="text-orange shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">{folder.name}</span>
                </button>
                {canManage && (
                  <button
                    onClick={() => handleDeleteFolder(folder.id, folder.name)}
                    className="p-1.5 text-muted-foreground hover:text-danger transition-colors opacity-0 group-hover:opacity-100"
                    title="Excluir pasta"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}

            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <FileIcon size={18} className="text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground font-technical">{formatSize(file.fileSize)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={file.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="p-1.5 text-muted-foreground hover:text-orange transition-colors"
                    title="Baixar"
                  >
                    <Download size={15} />
                  </a>
                  {canManage && (
                    <button
                      onClick={() => handleDeleteFile(file.id, file.name)}
                      className="p-1.5 text-muted-foreground hover:text-danger transition-colors opacity-0 group-hover:opacity-100"
                      title="Excluir"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
