/*
 * Painel do programa de sincronização com a Nuvem (Windows) — mostra o
 * botão de download pra qualquer pessoa (se existir um instalador
 * disponível), e um envio de nova versão só pro administrador principal.
 *
 * O envio é em PARTES (não numa requisição só): a Railway tem um limite
 * rígido de 5 minutos por requisição HTTP, e o instalador passa de 80MB —
 * numa conexão mais lenta, uma única requisição podia passar desse limite
 * e travar sem erro claro (aconteceu de verdade, 03/09). Dividido em
 * pedaços de alguns MB, cada requisição fica bem dentro do limite.
 */

import { useRef, useState } from 'react';
import { Download, Monitor, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { uploadFileInChunks } from '@/lib/chunked-upload';

interface DesktopInstallerPanelProps {
  isMasterAdmin?: boolean;
}

export default function DesktopInstallerPanel({ isMasterAdmin }: DesktopInstallerPanelProps) {
  const infoQuery = trpc.desktopInstaller.getInfo.useQuery();
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDownload = async () => {
    try {
      const result = await utils.client.desktopInstaller.getDownloadUrl.query();
      if (!result) {
        toast.error('Nenhum instalador disponível no momento.');
        return;
      }
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Erro ao gerar o link de download.');
    }
  };

  const handleFileSelected = async (file: File) => {
    const version = window.prompt(
      'Qual a versão deste instalador? (por exemplo: 1.1.0 — o número que está em desktop-sync/package.json)'
    );
    if (!version || !version.trim()) return;

    setUploading(true);
    setProgress(0);
    try {
      await uploadFileInChunks(
        file,
        { version: version.trim(), fileName: file.name },
        {
          start: '/api/desktop-installer/upload/start',
          part: '/api/desktop-installer/upload/part',
          complete: '/api/desktop-installer/upload/complete',
        },
        setProgress
      );
      toast.success('Instalador enviado com sucesso.');
      await utils.desktopInstaller.getInfo.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar o instalador.');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const info = infoQuery.data;

  return (
    <div className="p-4 border-t border-white/10 hidden sm:block">
      <div className="flex items-center gap-2 mb-2">
        <Monitor size={14} className="text-white/60" />
        <p className="text-[11px] font-semibold text-white/70">Programa de sincronização</p>
      </div>

      {info ? (
        <button
          onClick={handleDownload}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-orange text-white text-xs font-semibold hover:opacity-90 transition"
        >
          <Download size={13} />
          Baixar pra Windows (v{info.version})
        </button>
      ) : (
        <p className="text-[10px] text-white/40">Nenhum instalador disponível ainda.</p>
      )}

      {isMasterAdmin && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".exe"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-1.5 mt-1.5 px-3 py-1.5 rounded-lg border border-white/20 text-white/70 text-[11px] font-medium hover:bg-white/10 transition disabled:opacity-50"
          >
            <Upload size={12} />
            {uploading ? `Enviando… ${progress}%` : 'Enviar nova versão'}
          </button>
          {uploading && (
            <div className="w-full h-1 bg-white/10 rounded-full mt-1.5 overflow-hidden">
              <div
                className="h-full bg-orange transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

