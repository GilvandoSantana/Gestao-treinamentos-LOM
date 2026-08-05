/*
 * Design: Industrial Blueprint — Neo-Industrial
 * DismissedModal: lista dos colaboradores marcados como demitidos.
 * Eles ficam fora das listas, filtros e contagens do dia a dia, mas o registro
 * e os treinamentos continuam guardados e consultáveis aqui — dá para expandir
 * cada um e readmitir a qualquer momento.
 */

import { useState } from 'react';
import {
  X,
  UserRoundX,
  RotateCcw,
  Loader,
  ChevronDown,
  Calendar,
  Shield,
  Pencil,
} from 'lucide-react';
import type { Employee } from '@/lib/types';
import { getTrainingStatus } from '@/lib/training-utils';

interface DismissedModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  canEdit: boolean;
  isRestoring: boolean;
  onRestore: (employee: Employee) => void;
  onEdit?: (employee: Employee) => void;
}

const statusChipMap: Record<string, string> = {
  expired: 'bg-danger/10 text-danger',
  expiring: 'bg-warning/15 text-warning',
  valid: 'bg-teal/10 text-teal',
  unknown: 'bg-muted text-muted-foreground',
};

function formatDate(value?: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
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
  onEdit,
}: DismissedModalProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
                const isExpanded = expandedId === employee.id;
                const dismissedAt = formatDate(employee.dismissedAt);
                const trainings = employee.trainings ?? [];

                return (
                  <div
                    key={employee.id}
                    className="rounded-xl border border-border bg-muted/30 overflow-hidden"
                  >
                    <div className="flex items-center gap-2 p-3">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : employee.id)}
                        className="min-w-0 flex-1 text-left"
                        aria-expanded={isExpanded}
                      >
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
                      </button>

                      <button
                        onClick={() => setExpandedId(isExpanded ? null : employee.id)}
                        className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                        title={isExpanded ? 'Recolher' : 'Ver dados e treinamentos'}
                      >
                        <ChevronDown
                          size={18}
                          className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-border pt-3 space-y-3">
                        {/* Dados cadastrais */}
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                          {employee.educationLevel && (
                            <div>
                              <dt className="text-muted-foreground">Escolaridade</dt>
                              <dd className="text-foreground font-medium">{employee.educationLevel}</dd>
                            </div>
                          )}
                          {employee.birthDate && (
                            <div>
                              <dt className="text-muted-foreground">Nascimento</dt>
                              <dd className="text-foreground font-medium font-technical">
                                {formatDate(employee.birthDate)}
                              </dd>
                            </div>
                          )}
                          {employee.age != null && (
                            <div>
                              <dt className="text-muted-foreground">Idade</dt>
                              <dd className="text-foreground font-medium">{employee.age} anos</dd>
                            </div>
                          )}
                          {employee.phone && (
                            <div>
                              <dt className="text-muted-foreground">Telefone</dt>
                              <dd className="text-foreground font-medium font-technical">{employee.phone}</dd>
                            </div>
                          )}
                        </dl>

                        {/* Treinamentos — só consulta. A situação aparece como
                            referência histórica; demitidos não entram em
                            nenhuma contagem nem em alertas de vencimento. */}
                        <div>
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2">
                            <Shield size={13} className="text-orange" />
                            Treinamentos ({trainings.length})
                          </p>

                          {trainings.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Nenhum treinamento cadastrado.
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {trainings.map((training) => {
                                const info = getTrainingStatus(training.expirationDate);
                                return (
                                  <div
                                    key={training.id}
                                    className={`rounded-lg px-2.5 py-2 ${statusChipMap[info.status] ?? statusChipMap.unknown}`}
                                  >
                                    <p className="text-xs font-semibold truncate">{training.name}</p>
                                    <p className="flex items-center gap-2.5 text-[10px] font-technical opacity-80 mt-0.5">
                                      <span className="flex items-center gap-1">
                                        <Calendar size={9} />
                                        {formatDate(training.completionDate)}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <Calendar size={9} />
                                        vence {formatDate(training.expirationDate)}
                                      </span>
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {canEdit && (
                          <div className="flex gap-2 pt-1">
                            {onEdit && (
                              <button
                                onClick={() => onEdit(employee)}
                                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-muted text-foreground hover:bg-navy hover:text-white transition"
                              >
                                <Pencil size={13} />
                                Ver / editar ficha
                              </button>
                            )}
                            <button
                              onClick={() => onRestore(employee)}
                              disabled={isRestoring}
                              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-teal text-white hover:opacity-90 disabled:opacity-50 transition"
                              title="Trazer de volta para a lista ativa"
                            >
                              {isRestoring ? (
                                <Loader size={13} className="animate-spin" />
                              ) : (
                                <RotateCcw size={13} />
                              )}
                              Readmitir
                            </button>
                          </div>
                        )}
                      </div>
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
