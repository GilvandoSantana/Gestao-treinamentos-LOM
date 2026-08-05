/*
 * Design: Industrial Blueprint — Neo-Industrial
 * EmployeeCard: cartão enxuto no formato do protótipo — avatar com iniciais,
 * nome, matrícula/função, selo de conformidade e os treinamentos como chips
 * compactos. A borda esquerda colorida indica a pior situação do colaborador.
 */

import { Edit2, Trash2, History, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { Employee } from '@/lib/types';
import { getTrainingStatus, getWorstStatus } from '@/lib/training-utils';
import ComplianceStamp from '@/components/ComplianceStamp';

interface EmployeeCardProps {
  employee: Employee;
  index: number;
  onEdit: (employee: Employee) => void;
  onDelete: (id: string) => void;
  onViewAudit?: (employee: Employee) => void;
  isAdmin?: boolean;
}

const statusBorderMap = {
  expired: 'border-l-danger',
  expiring: 'border-l-warning',
  valid: 'border-l-teal',
  none: 'border-l-border',
};

const chipMap = {
  expired: 'bg-danger/10 text-danger',
  expiring: 'bg-warning/15 text-warning',
  valid: 'bg-teal/10 text-teal',
  unknown: 'bg-muted text-muted-foreground',
};

const dotMap = {
  expired: 'bg-danger',
  expiring: 'bg-warning',
  valid: 'bg-teal',
  unknown: 'bg-muted-foreground',
};

/** Iniciais do nome, como no protótipo (ex.: "Ana Carolina" -> "AC"). */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const MAX_VISIBLE_CHIPS = 4;

export default function EmployeeCard({
  employee,
  index,
  onEdit,
  onDelete,
  onViewAudit,
  isAdmin = false,
}: EmployeeCardProps) {
  const [showAll, setShowAll] = useState(false);
  const worstStatus = getWorstStatus(employee);
  const trainings = employee.trainings ?? [];
  const visibleTrainings = showAll ? trainings : trainings.slice(0, MAX_VISIBLE_CHIPS);
  const hiddenCount = trainings.length - visibleTrainings.length;

  return (
    <div
      className={`bg-card rounded-xl p-3.5 shadow-sm hover:shadow-md transition-all duration-300 border border-border border-l-4 ${statusBorderMap[worstStatus]} animate-fade-in-up group`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Cabeçalho: avatar + identificação + selo */}
      <div className="flex items-start gap-3">
        {employee.photoUrl ? (
          <img
            src={employee.photoUrl}
            alt=""
            className="w-11 h-11 rounded-xl object-cover shrink-0 bg-muted"
          />
        ) : (
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-navy to-navy-light text-white grid place-items-center font-display font-bold text-sm shrink-0">
            {getInitials(employee.name)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="font-display font-semibold text-[15px] tracking-tight text-foreground truncate">
            {employee.name}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            {employee.registration && (
              <span className="font-technical text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">
                #{employee.registration}
              </span>
            )}
            <span className="text-[13px] text-muted-foreground truncate">{employee.role}</span>
          </div>
        </div>

        {worstStatus !== 'none' && (
          <ComplianceStamp status={worstStatus} label={worstStatus} size="md" />
        )}
      </div>

      {/* Treinamentos como chips compactos */}
      {trainings.length > 0 ? (
        <div className="mt-3 pt-2.5 border-t border-dashed border-border">
          <div className="flex flex-wrap gap-1.5">
            {visibleTrainings.map((training) => {
              const info = getTrainingStatus(training.expirationDate);
              return (
                <span
                  key={training.id}
                  className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-md ${chipMap[info.status]}`}
                  title={`${training.name} — ${info.label}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotMap[info.status]}`} />
                  <span className="truncate max-w-[150px]">{training.name}</span>
                  <span className="font-technical opacity-75 text-[10px] shrink-0">
                    {new Date(training.expirationDate + 'T00:00:00').toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit',
                    })}
                  </span>
                </span>
              );
            })}

            {hiddenCount > 0 && (
              <button
                onClick={() => setShowAll(true)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                +{hiddenCount}
                <ChevronDown size={11} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-3 pt-2.5 border-t border-dashed border-border text-[13px] text-muted-foreground">
          Nenhum treinamento cadastrado
        </p>
      )}

      {/* Ações: no celular ficam no gesto de arrastar; aqui aparecem no desktop */}
      {isAdmin && (
        <div className="hidden lg:flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={() => onEdit(employee)}
            className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg bg-muted text-foreground hover:bg-navy hover:text-white transition-colors"
          >
            <Edit2 size={13} />
            Editar
          </button>
          <button
            onClick={() => onDelete(employee.id)}
            className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg bg-muted text-danger hover:bg-danger hover:text-white transition-colors"
          >
            <Trash2 size={13} />
            Excluir
          </button>
          {onViewAudit && (
            <button
              onClick={() => onViewAudit(employee)}
              className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors ml-auto"
              title="Histórico de alterações"
            >
              <History size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
