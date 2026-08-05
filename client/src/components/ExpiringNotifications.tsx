/*
 * Design: Industrial Blueprint — Neo-Industrial
 * ExpiringNotifications: painel de pendências no topo da lista.
 *
 * Mostra primeiro os treinamentos VENCIDOS e depois os que estão vencendo.
 * A janela acompanha a mesma regra do restante do sistema (30 dias), para o
 * número aqui bater com o card "Próximos a Vencer" — antes este aviso usava
 * 7 dias por conta própria e por isso mostrava menos do que o card indicava.
 */

import { useState } from 'react';
import { AlertCircle, Clock, AlertTriangle, ChevronDown } from 'lucide-react';
import type { Employee } from '@/lib/types';
import { getTrainingStatus } from '@/lib/training-utils';

interface ExpiringNotificationsProps {
  employees: Employee[];
}

type Pending = {
  employeeName: string;
  trainingName: string;
  diffDays: number;
};

const VISIBLE_BY_DEFAULT = 5;

function PendingGroup({
  items,
  variant,
}: {
  items: Pending[];
  variant: 'expired' | 'expiring';
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, VISIBLE_BY_DEFAULT);
  const hidden = items.length - visible.length;

  const isExpired = variant === 'expired';
  const wrapper = isExpired
    ? 'bg-danger/10 border-danger'
    : 'bg-warning/10 border-warning';
  const heading = isExpired ? 'text-danger' : 'text-warning';
  const body = isExpired ? 'text-danger/90' : 'text-warning/90';
  const Icon = isExpired ? AlertTriangle : Clock;

  return (
    <div className={`mb-3 border-l-4 p-4 rounded-lg ${wrapper}`}>
      <div className="flex items-start gap-3">
        <AlertCircle className={`${heading} shrink-0 mt-0.5`} size={20} />
        <div className="flex-1 min-w-0">
          <h3 className={`font-bold mb-2 flex items-center gap-2 ${heading}`}>
            <Icon size={16} />
            {items.length}{' '}
            {isExpired
              ? `Treinamento${items.length !== 1 ? 's' : ''} Vencido${items.length !== 1 ? 's' : ''}`
              : `Treinamento${items.length !== 1 ? 's' : ''} Próximo${items.length !== 1 ? 's' : ''} de Vencer`}
          </h3>

          <div className={`space-y-1 text-sm ${body}`}>
            {visible.map((item, idx) => (
              <div key={`${item.employeeName}-${item.trainingName}-${idx}`} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  <strong>{item.employeeName}</strong> - {item.trainingName}
                </span>
                <span className="font-semibold whitespace-nowrap font-technical">
                  {isExpired
                    ? `há ${Math.abs(item.diffDays)} dia${Math.abs(item.diffDays) !== 1 ? 's' : ''}`
                    : `${item.diffDays} dia${item.diffDays !== 1 ? 's' : ''}`}
                </span>
              </div>
            ))}

            {hidden > 0 && (
              <button
                onClick={() => setExpanded(true)}
                className={`flex items-center gap-1 font-semibold pt-1 hover:underline ${heading}`}
              >
                <ChevronDown size={13} />
                Ver mais {hidden}
              </button>
            )}

            {expanded && items.length > VISIBLE_BY_DEFAULT && (
              <button
                onClick={() => setExpanded(false)}
                className={`flex items-center gap-1 font-semibold pt-1 hover:underline ${heading}`}
              >
                <ChevronDown size={13} className="rotate-180" />
                Ver menos
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExpiringNotifications({ employees }: ExpiringNotificationsProps) {
  const expired: Pending[] = [];
  const expiring: Pending[] = [];

  employees.forEach((emp) => {
    emp.trainings?.forEach((training) => {
      const status = getTrainingStatus(training.expirationDate);
      const entry: Pending = {
        employeeName: emp.name,
        trainingName: training.name,
        diffDays: status.diffDays,
      };

      if (status.status === 'expired') expired.push(entry);
      else if (status.status === 'expiring') expiring.push(entry);
    });
  });

  // Mais urgente primeiro dentro de cada grupo.
  expired.sort((a, b) => a.diffDays - b.diffDays);
  expiring.sort((a, b) => a.diffDays - b.diffDays);

  if (expired.length === 0 && expiring.length === 0) return null;

  return (
    <div className="mb-6">
      <PendingGroup items={expired} variant="expired" />
      <PendingGroup items={expiring} variant="expiring" />
    </div>
  );
}
