/*
 * Design: Industrial Blueprint — Neo-Industrial
 * QrCodeReader: leitor de QR code pela câmera — usado pra identificar
 * rapidamente um item ou um colaborador nas telas do Almoxarifado.
 */

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera } from 'lucide-react';

interface QrCodeReaderProps {
  onScan: (value: string) => void;
  onClose: () => void;
}

const CONTAINER_ID = 'qr-reader-box';

export default function QrCodeReader({ onScan, onClose }: QrCodeReaderProps) {
  const [error, setError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const qr = new Html5Qrcode(CONTAINER_ID);
        scannerRef.current = qr;
        await qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (handledRef.current) return; // evita leituras duplicadas
            handledRef.current = true;
            qr.stop().catch(() => {});
            if (!cancelled) {
              onScan(decodedText);
              onClose();
            }
          },
          () => {} // ignora falhas de leitura contínuas (esperado enquanto mira)
        );
      } catch (err) {
        if (!cancelled) {
          console.error('Erro ao iniciar câmera:', err);
          setError('Não foi possível acessar a câmera. Verifique a permissão do navegador e se o site está em HTTPS.');
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      if (scannerRef.current && handledRef.current === false) {
        scannerRef.current.stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="flex items-center gap-2 font-display text-base font-bold text-foreground">
            <Camera size={18} className="text-orange" />
            Ler QR Code
          </p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        {error ? (
          <p className="text-sm text-danger text-center py-6">{error}</p>
        ) : (
          <div id={CONTAINER_ID} className="rounded-xl overflow-hidden bg-black" />
        )}

        <p className="text-xs text-muted-foreground text-center mt-3">
          Aponte a câmera para a etiqueta do item ou do colaborador.
        </p>
      </div>
    </div>
  );
}
