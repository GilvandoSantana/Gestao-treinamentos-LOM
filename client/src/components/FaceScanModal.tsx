/*
 * Design: Industrial Blueprint — Neo-Industrial
 * FaceScanModal: reconhece o colaborador pela câmera, comparando com as
 * fotos já cadastradas no sistema. Tudo roda no navegador — nenhuma
 * imagem é enviada pra fora. Sempre tem uma saída pra busca manual, caso
 * não reconheça ou o colaborador não tenha foto cadastrada.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Camera, ScanFace, Loader } from 'lucide-react';
import { loadFaceModels, buildFaceGallery, matchFaceFromVideo, type FaceGalleryEntry } from '@/lib/face-recognition';

interface FaceScanModalProps {
  employees: { id: string; name: string; photoUrl: string | null }[];
  onMatch: (employeeId: string, employeeName: string) => void;
  onClose: () => void;
}

type Stage = 'preparing' | 'scanning' | 'confirming' | 'no-gallery' | 'error';

const SCAN_INTERVAL_MS = 700;

export default function FaceScanModal({ employees, onMatch, onClose }: FaceScanModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const galleryRef = useRef<FaceGalleryEntry[]>([]);
  const matchingRef = useRef(false);
  const stoppedRef = useRef(false);

  const [stage, setStage] = useState<Stage>('preparing');
  const [errorMsg, setErrorMsg] = useState('');
  const [pendingMatch, setPendingMatch] = useState<{ employeeId: string; employeeName: string } | null>(null);

  const stopScanning = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startScanningLoop = () => {
    setPendingMatch(null);
    setStage('scanning');
    intervalRef.current = setInterval(async () => {
      if (matchingRef.current || !videoRef.current || stoppedRef.current) return;
      matchingRef.current = true;
      try {
        const result = await matchFaceFromVideo(videoRef.current, galleryRef.current);
        if (result && !stoppedRef.current) {
          stopScanning();
          setPendingMatch({ employeeId: result.employeeId, employeeName: result.employeeName });
          setStage('confirming');
        }
      } finally {
        matchingRef.current = false;
      }
    }, SCAN_INTERVAL_MS);
  };

  useEffect(() => {
    stoppedRef.current = false;

    const setup = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (stoppedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error('Erro ao acessar câmera:', err);
        if (!stoppedRef.current) {
          setErrorMsg('Não foi possível acessar a câmera. Verifique a permissão do navegador e se o site está em HTTPS.');
          setStage('error');
        }
        return;
      }

      try {
        const [, gallery] = await Promise.all([loadFaceModels(), buildFaceGallery(employees)]);
        if (stoppedRef.current) return;

        if (gallery.length === 0) {
          setStage('no-gallery');
          return;
        }
        galleryRef.current = gallery;
        startScanningLoop();
      } catch (err) {
        console.error('Erro ao carregar reconhecimento facial:', err);
        if (!stoppedRef.current) {
          setErrorMsg('Não foi possível carregar o reconhecimento facial. Tente novamente ou use a busca manual.');
          setStage('error');
        }
      }
    };

    setup();

    return () => {
      stoppedRef.current = true;
      stopScanning();
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = () => {
    if (!pendingMatch) return;
    onMatch(pendingMatch.employeeId, pendingMatch.employeeName);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="flex items-center gap-2 font-display text-base font-bold text-foreground">
            <ScanFace size={18} className="text-orange" />
            Reconhecer colaborador
          </p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        {stage === 'no-gallery' ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum colaborador com foto cadastrada disponível pra reconhecimento facial ainda. Use a busca manual
            por enquanto.
          </p>
        ) : stage === 'error' ? (
          <p className="text-sm text-danger text-center py-6">{errorMsg}</p>
        ) : (
          <>
            <div className="relative rounded-xl overflow-hidden bg-black aspect-square">
              <video ref={videoRef} muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
              {stage === 'preparing' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <p className="flex items-center gap-2 text-sm text-white">
                    <Loader size={15} className="animate-spin" />
                    Preparando câmera e reconhecimento...
                  </p>
                </div>
              )}
              {stage === 'confirming' && pendingMatch && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 p-4 text-center">
                  <p className="text-white text-base font-semibold">É {pendingMatch.employeeName}?</p>
                  <div className="flex gap-2 w-full">
                    <button
                      onClick={startScanningLoop}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold border border-white/40 text-white hover:bg-white/10 transition"
                    >
                      Não, de novo
                    </button>
                    <button
                      onClick={handleConfirm}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-orange hover:opacity-90 transition"
                    >
                      Sim, confirmar
                    </button>
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3 flex items-center justify-center gap-1">
              <Camera size={12} />
              {stage === 'scanning'
                ? 'Posicione o rosto no centro da câmera.'
                : 'Tudo roda no seu navegador — nenhuma foto é enviada a servidores externos.'}
            </p>
          </>
        )}

        <button
          onClick={onClose}
          className="w-full mt-3 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground transition"
        >
          Cancelar e buscar manualmente
        </button>
      </div>
    </div>
  );
}
