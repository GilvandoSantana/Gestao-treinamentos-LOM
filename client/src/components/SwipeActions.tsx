/*
 * Design: Industrial Blueprint — Neo-Industrial
 * SwipeActions: envolve um cartão e revela Editar/Excluir ao arrastar para a
 * esquerda no celular. Tira os botões de ação do corpo do cartão, deixando a
 * lista bem mais limpa sem esconder as ações de quem precisa delas.
 *
 * Só ativa em telas pequenas — no desktop os botões normais continuam sendo
 * a forma de agir, já que não há gesto de arrastar com o mouse ali.
 */

import { useRef, useState, type ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

const REVEAL_PX = 148;
const TRIGGER_PX = 55;

interface SwipeActionsProps {
  children: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  enabled?: boolean;
}

export default function SwipeActions({ children, onEdit, onDelete, enabled = true }: SwipeActionsProps) {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);

  if (!enabled) return <>{children}</>;

  const handleStart = (clientX: number) => {
    startX.current = clientX;
    setIsDragging(true);
  };

  const handleMove = (clientX: number) => {
    if (!isDragging) return;
    const delta = clientX - startX.current;
    // Só permite arrastar para a esquerda, até o limite das ações.
    setOffset(Math.min(0, Math.max(-REVEAL_PX, (offset === -REVEAL_PX ? -REVEAL_PX : 0) + delta)));
  };

  const handleEnd = (clientX: number) => {
    if (!isDragging) return;
    setIsDragging(false);
    const delta = clientX - startX.current;
    if (offset === -REVEAL_PX) {
      setOffset(delta > TRIGGER_PX ? 0 : -REVEAL_PX);
    } else {
      setOffset(delta < -TRIGGER_PX ? -REVEAL_PX : 0);
    }
  };

  const close = () => setOffset(0);

  return (
    <div className="relative overflow-hidden rounded-xl lg:overflow-visible">
      {/* Ações reveladas atrás do cartão */}
      <div className="absolute inset-0 flex justify-end lg:hidden" aria-hidden={offset === 0}>
        <button
          onClick={() => {
            close();
            onEdit();
          }}
          tabIndex={offset === 0 ? -1 : 0}
          className="w-[74px] bg-navy-light text-white flex flex-col items-center justify-center gap-1 text-[11px] font-bold"
        >
          <Pencil size={17} />
          Editar
        </button>
        <button
          onClick={() => {
            close();
            onDelete();
          }}
          tabIndex={offset === 0 ? -1 : 0}
          className="w-[74px] bg-danger text-white flex flex-col items-center justify-center gap-1 text-[11px] font-bold"
        >
          <Trash2 size={17} />
          Excluir
        </button>
      </div>

      <div
        className="relative touch-pan-y"
        style={{
          transform: `translateX(${offset}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.3, 1.2, 0.5, 1)',
        }}
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
        onTouchEnd={(e) => handleEnd(e.changedTouches[0].clientX)}
      >
        {children}
      </div>
    </div>
  );
}
