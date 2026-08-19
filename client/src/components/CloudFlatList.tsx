/*
 * Design: Industrial Blueprint — Neo-Industrial
 * CloudFlatList: lista simples de arquivos, sem navegação em pasta — usada
 * em Compartilhados comigo/por mim, Recentes, Favoritos e Lixeira.
 */

import { File as FileIcon, Folder, Download, Trash2, RotateCcw, Ban, Loader } from 'lucide-react';
import { formatBytes } from '@shared/cloud';

export interface FlatListItem {
  id: string;
  name: string;
  isFolder?: boolean;
  size?: number | null;
  subtitle?: string;
}

interface CloudFlatListProps {
  items: FlatListItem[];
  isLoading?: boolean;
  emptyMessage: string;
  onDownload?: (id: string) => void;
  onRestore?: (id: string) => void;
  onPermanentDelete?: (id: string) => void;
  onRevoke?: (id: string) => void;
}

export default function CloudFlatList({
  items,
  isLoading,
  emptyMessage,
  onDownload,
  onRestore,
  onPermanentDelete,
  onRevoke,
}: CloudFlatListProps) {
  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2 py-10 justify-center">
        <Loader size={14} className="animate-spin" /> Carregando...
      </p>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {item.isFolder ? (
              <Folder size={18} className="text-orange shrink-0" />
            ) : (
              <FileIcon size={18} className="text-muted-foreground shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
              <p className="text-xs text-muted-foreground font-technical truncate">
                {item.size != null ? formatBytes(item.size) : ''}
                {item.subtitle && (item.size != null ? ' · ' : '') + item.subtitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onDownload && !item.isFolder && (
              <button
                onClick={() => onDownload(item.id)}
                className="p-1.5 text-muted-foreground hover:text-orange transition-colors"
                title="Baixar"
              >
                <Download size={15} />
              </button>
            )}
            {onRestore && (
              <button
                onClick={() => onRestore(item.id)}
                className="p-1.5 text-muted-foreground hover:text-teal transition-colors"
                title="Restaurar"
              >
                <RotateCcw size={15} />
              </button>
            )}
            {onPermanentDelete && (
              <button
                onClick={() => onPermanentDelete(item.id)}
                className="p-1.5 text-muted-foreground hover:text-danger transition-colors"
                title="Excluir definitivamente"
              >
                <Trash2 size={15} />
              </button>
            )}
            {onRevoke && (
              <button
                onClick={() => onRevoke(item.id)}
                className="p-1.5 text-muted-foreground hover:text-danger transition-colors"
                title="Remover compartilhamento"
              >
                <Ban size={15} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
