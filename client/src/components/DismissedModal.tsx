/*
 * Design: Industrial Blueprint — Neo-Industrial
 * DismissedModal: lista dos colaboradores marcados como demitidos.
 * Eles ficam fora das listas, filtros e contagens do dia a dia, mas o registro
 * e os treinamentos continuam guardados — dá para readmitir a qualquer momento.
 */

import { X, UserRoundX, RotateCcw, Loader } from 'lucide-react';
import type { Employee } from '@/lib/types';

interface DismissedModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  canEdit: boolean;
  isRestoring: boolean;
  onRestore: (employee: Employee) => void;
}

function formatDismissedAt(value: Employee['dismissedAt']): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('pt-BR');
}

export default function DismissedModal({
  isOpen,
  onClose,
  employees,
  canEdit,
  isRestoring,
  onRestore,
}: DismissedModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <UserRoundX className="text-muted-foreground shrink-0" size={21} />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-foreground truncate">Demitidos</h2>
              <p className="text-xs text-muted-foreground">
                {employees.length === 0
                  ? 'Nenhum colaborador demitido'
                  : `${employees.length} colaborador${employees.length !== 1 ? 'es' : ''}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={23} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Colaboradores marcados como demitidos aparecem aqui. Eles saem das listas e das
              contagens, mas os dados e treinamentos continuam guardados.
            </p>
          ) : (
            <div className="space-y-2">
              {employees.map((employee) => {
                const dismissedAt = formatDismissedAt(employee.dismissedAt);
                return (
                  <div
                    key={employee.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">{employee.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {employee.registration && (
                          <span className="font-technical">#{employee.registration} · </span>
                        )}
                        {employee.role}
                        {dismissedAt && (
                          <span className="font-technical"> · desde {dismissedAt}</span>
                        )}
                      </p>
                    </div>

                    {canEdit && (
                      <button
                        onClick={() => onRestore(employee)}
                        disabled={isRestoring}
                        className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-teal text-white hover:opacity-90 disabled:opacity-50 transition"
                        title="Trazer de volta para a lista ativa"
                      >
                        {isRestoring ? <Loader size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                        Readmitir
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
