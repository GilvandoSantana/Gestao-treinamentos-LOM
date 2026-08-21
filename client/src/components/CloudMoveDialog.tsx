/*
 * Design: Industrial Blueprint — Neo-Industrial
 * CloudMoveDialog: escolhe a pasta de destino pra mover um ou vários
 * arquivos/pastas de uma vez — navega pela árvore dentro do próprio diálogo.
 */

import { useState } from 'react';
import { X, FolderInput, Folder, Home, ChevronRight, Loader } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface MoveItem {
  id: string;
  name: string;
  isFolder: boolean;
}

interface CloudMoveDialogProps {
  items: MoveItem[];
  onClose: () => void;
  onMoved: () => void;
}

export default function CloudMoveDialog({ items, onClose, onMoved }: CloudMoveDialogProps) {
  const [browseFolderId, setBrowseFolderId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const listQuery = trpc.cloud.list.useQuery({ folderId: browseFolderId });
  const moveFileMutation = trpc.cloud.moveFile.useMutation();
  const moveFolderMutation = trpc.cloud.moveFolder.useMutation();

  const label = items.length === 1 ? `"${items[0].name}"` : `${items.length} itens`;
  const movedFolderIds = new Set(items.filter((i) => i.isFolder).map((i) => i.id));

  const handleMoveHere = async () => {
    setIsMoving(true);
    let failed = 0;
    for (const item of items) {
      try {
        if (item.isFolder) {
          await moveFolderMutation.mutateAsync({ id: item.id, targetFolderId: browseFolderId });
        } else {
          await moveFileMutation.mutateAsync({ id: item.id, folderId: browseFolderId });
        }
      } catch (error) {
        failed++;
        console.error(`Falha ao mover "${item.name}":`, error);
      }
    }
    setIsMoving(false);

    if (failed === 0) {
      toast.success(items.length === 1 ? `${label} movido.` : `${items.length} itens movidos.`);
    } else {
      toast.error(`${items.length - failed} movido(s), ${failed} falharam.`);
    }
    onMoved();
    onClose();
  };

  const path = listQuery.data?.path ?? [];
  // Nenhum item sendo movido pode aparecer como destino (evita mover uma
  // pasta pra dentro dela mesma, ou de outra que também está selecionada).
  const folders = (listQuery.data?.folders ?? []).filter((f) => !movedFolderIds.has(f.id));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-sm h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <p className="flex items-center gap-2 font-display text-sm font-bold text-foreground truncate">
            <FolderInput size={17} className="text-orange shrink-0" />
            Mover {label}
          </p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Breadcrumb de navegação dentro do diálogo */}
        <div className="flex items-center gap-1 px-4 py-2 text-xs overflow-x-auto border-b border-border shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setBrowseFolderId(null)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg shrink-0 transition-colors ${
              browseFolderId === null ? 'text-orange font-semibold' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Home size={12} />
            Meus arquivos
          </button>
          {path.map((folder) => (
            <span key={folder.id} className="flex items-center gap-1 shrink-0">
              <ChevronRight size={12} className="text-muted-foreground" />
              <button
                onClick={() => setBrowseFolderId(folder.id)}
                className={`px-2 py-1 rounded-lg transition-colors ${
                  folder.id === browseFolderId
                    ? 'text-orange font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {folder.name}
              </button>
            </span>
          ))}
        </div>

        {/* Lista de subpastas — só pastas aparecem aqui, é onde se navega */}
        <div className="flex-1 overflow-y-auto p-2">
          {listQuery.isLoading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
              <Loader size={14} className="animate-spin" /> Carregando...
            </p>
          )}
          {!listQuery.isLoading && folders.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma subpasta aqui.</p>
          )}
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => setBrowseFolderId(folder.id)}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-muted transition-colors text-left"
            >
              <Folder size={17} className="text-orange shrink-0" />
              <span className="text-sm text-foreground truncate">{folder.name}</span>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-border shrink-0">
          <button
            onClick={handleMoveHere}
            disabled={isMoving}
            className="w-full bg-orange text-white rounded-lg py-2.5 font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {isMoving ? 'Movendo...' : `Mover para "${path[path.length - 1]?.name ?? 'Meus arquivos'}"`}
          </button>
        </div>
      </div>
    </div>
  );
}
