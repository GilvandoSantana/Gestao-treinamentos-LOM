/*
 * Design: Industrial Blueprint — Neo-Industrial
 * NotificationBell: alertas de vencimento sempre à mão no cabeçalho, para
 * quem está com o site aberto mas não confere e-mail o tempo todo.
 */

import { useEffect, useRef, useState } from 'react';
import { Bell, AlertTriangle, Clock } from 'lucide-react';
import type { TrainingAlertItem } from '@/hooks/useTrainingAlerts';

interface NotificationBellProps {
  items: TrainingAlertItem[];
  onSelect: (item: TrainingAlertItem) => void;
  onSeeAll: () => void;
  /** Avisa o cabeçalho quando o sino abre/fecha, para ele subir de camada
   * (sem isso, o conteúdo da página aparece por cima do painel). */
  onOpenChange?: (open: boolean) => void;
}

const MAX_VISIBLE = 8;

export default function NotificationBell({ items, onSelect, onSeeAll, onOpenChange }: NotificationBellProps) {
  const [open, setOpenState] = useState(false);
  const setOpen = (value: boolean | ((prev: boolean) => boolean)) => {
    setOpenState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      onOpenChange?.(next);
      return next;
    });
  };
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const count = items.length;
  const visible = items.slice(0, MAX_VISIBLE);
  const hidden = count - visible.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Notificações"
        className={`relative p-2.5 rounded-xl border transition-all ${
          open ? 'bg-white text-navy border-white' : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
        }`}
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white font-technical text-[10px] flex items-center justify-center border-2 border-navy">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-card rounded-xl shadow-2xl border border-border overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-3.5 py-2.5 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Notificações</p>
            <p className="text-xs text-muted-foreground">
              {count === 0 ? 'Nada vencendo ou vencido' : `${count} treinamento(s) precisam de atenção`}
            </p>
          </div>

          {count === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 px-4">
              Tudo em dia por aqui. 🎉
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {visible.map((item, idx) => (
                <button
                  key={`${item.employeeId}-${item.trainingName}-${idx}`}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onSelect(item);
                  }}
                  className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-muted transition-colors border-b border-border last:border-b-0"
                >
                  <span
                    className={`p-1.5 rounded-lg shrink-0 ${
                      item.status === 'expired' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'
                    }`}
                  >
                    {item.status === 'expired' ? <AlertTriangle size={14} /> : <Clock size={14} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground truncate">
                      {item.employeeName}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {item.trainingName} —{' '}
                      {item.status === 'expired'
                        ? `venceu há ${Math.abs(item.daysUntil)} dia${Math.abs(item.daysUntil) !== 1 ? 's' : ''}`
                        : `vence em ${item.daysUntil} dia${item.daysUntil !== 1 ? 's' : ''}`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {(hidden > 0 || count > 0) && (
            <button
              onClick={() => {
                setOpen(false);
                onSeeAll();
              }}
              className="w-full text-center text-xs font-semibold text-orange py-2.5 border-t border-border hover:bg-muted transition-colors"
            >
              {hidden > 0 ? `Ver todos (mais ${hidden})` : 'Ver na lista'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
