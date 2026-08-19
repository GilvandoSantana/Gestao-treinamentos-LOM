/*
 * Design: Industrial Blueprint — Neo-Industrial
 * CloudPreviewModal: abre PDF/imagem direto na tela, sem precisar baixar.
 * Formatos não suportados mostram um aviso com botão de baixar.
 */

import { useEffect, useState } from 'react';
import { X, Download, Loader, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface CloudPreviewModalProps {
  fileId: string;
  fileName: string;
  onClose: () => void;
  onDownload: (id: string, name: string) => void;
}

function canPreview(mimeType: string | null): 'pdf' | 'image' | 'text' | null {
  if (!mimeType) return null;
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'text/plain') return 'text';
  return null;
}

export default function CloudPreviewModal({ fileId, fileName, onClose, onDownload }: CloudPreviewModalProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const previewMutation = trpc.cloud.getPreviewUrl.useMutation();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    previewMutation
      .mutateAsync({ id: fileId })
      .then((res) => {
        if (!cancelled) {
          setUrl(res.url);
          setMimeType(res.mimeType);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error('Não foi possível carregar a pré-visualização.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const kind = canPreview(mimeType);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <p className="text-sm font-semibold text-foreground truncate">{fileName}</p>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onDownload(fileId, fileName)}
              className="p-2 text-muted-foreground hover:text-orange transition-colors"
              title="Baixar"
            >
              <Download size={18} />
            </button>
            <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-muted/20 flex items-center justify-center">
          {loading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader size={16} className="animate-spin" /> Carregando...
            </p>
          )}

          {!loading && url && kind === 'pdf' && (
            <iframe src={url} title={fileName} className="w-full h-full border-0" />
          )}

          {!loading && url && kind === 'image' && (
            <img src={url} alt={fileName} className="max-w-full max-h-full object-contain" />
          )}

          {!loading && url && kind === 'text' && (
            <iframe src={url} title={fileName} className="w-full h-full border-0 bg-white" />
          )}

          {!loading && (!url || !kind) && (
            <div className="flex flex-col items-center gap-3 text-center px-6">
              <FileWarning size={32} className="text-muted-foreground" />
              <p className="text-sm text-foreground">Este arquivo não pode ser visualizado no navegador.</p>
              <button
                onClick={() => onDownload(fileId, fileName)}
                className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-orange text-white hover:opacity-90"
              >
                <Download size={15} />
                Baixar arquivo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
