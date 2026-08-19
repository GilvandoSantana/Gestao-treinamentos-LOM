/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseAlertsPanel: estoque zerado/baixo e validade de CA vencendo —
 * calculado a partir dos itens já carregados, sem chamada extra ao servidor.
 */

import { useMemo } from 'react';
import { AlertTriangle, ShieldAlert, CalendarClock, PartyPopper } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import type { WarehouseItemInfo } from '@shared/warehouse';

interface Alert {
  id: string;
  level: 'urgente' | 'aviso' | 'info';
  title: string;
  message: string;
  Icon: typeof AlertTriangle;
}

const LEVEL_STYLES: Record<Alert['level'], string> = {
  urgente: 'bg-danger/10 border-danger/30 text-danger',
  aviso: 'bg-warning/10 border-warning/30 text-warning',
  info: 'bg-navy/10 border-navy/30 text-navy',
};

function daysUntil(dateStr: string): number {
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('pt-BR');
}

function buildAlerts(items: WarehouseItemInfo[]): Alert[] {
  const alerts: Alert[] = [];

  for (const item of items) {
    if (item.quantity === 0) {
      alerts.push({
        id: `zerado-${item.id}`,
        level: 'urgente',
        title: `Estoque zerado: ${item.name}`,
        message: 'Item sem estoque! Necessária reposição urgente.',
        Icon: AlertTriangle,
      });
    } else if (item.quantity <= item.estoqueMinimo) {
      alerts.push({
        id: `baixo-${item.id}`,
        level: 'urgente',
        title: `Estoque baixo: ${item.name}`,
        message: `Quantidade (${item.quantity}) abaixo do mínimo definido (${item.estoqueMinimo}).`,
        Icon: AlertTriangle,
      });
    }

    if (item.type === 'epi' && item.dataValidadeCa) {
      const dias = daysUntil(item.dataValidadeCa);
      if (dias < 0) {
        alerts.push({
          id: `ca-vencido-${item.id}`,
          level: 'urgente',
          title: `CA vencido: ${item.name}`,
          message: `CA nº ${item.ca ?? '—'} venceu em ${formatDate(item.dataValidadeCa)}. EPI não pode ser utilizado!`,
          Icon: ShieldAlert,
        });
      } else if (dias <= 30) {
        alerts.push({
          id: `ca-proximo-${item.id}`,
          level: 'aviso',
          title: `CA vencendo: ${item.name}`,
          message: `CA nº ${item.ca ?? '—'} vence em ${formatDate(item.dataValidadeCa)} (${dias} dia${dias !== 1 ? 's' : ''}).`,
          Icon: CalendarClock,
        });
      } else if (dias <= 90) {
        alerts.push({
          id: `ca-planej-${item.id}`,
          level: 'info',
          title: `CA vence em breve: ${item.name}`,
          message: `CA nº ${item.ca ?? '—'} vence em ${formatDate(item.dataValidadeCa)}. Planeje a substituição.`,
          Icon: CalendarClock,
        });
      }
    }

    if (item.type !== 'epi' && item.dataValidade) {
      const dias = daysUntil(item.dataValidade);
      if (dias < 0) {
        alerts.push({
          id: `validade-vencida-${item.id}`,
          level: 'urgente',
          title: `Validade vencida: ${item.name}`,
          message: `Venceu em ${formatDate(item.dataValidade)}.`,
          Icon: ShieldAlert,
        });
      } else if (dias <= 30) {
        alerts.push({
          id: `validade-proxima-${item.id}`,
          level: 'aviso',
          title: `Validade vencendo: ${item.name}`,
          message: `Vence em ${formatDate(item.dataValidade)} (${dias} dia${dias !== 1 ? 's' : ''}).`,
          Icon: CalendarClock,
        });
      }
    }
  }

  const order: Record<Alert['level'], number> = { urgente: 0, aviso: 1, info: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

export default function WarehouseAlertsPanel() {
  const itemsQuery = trpc.warehouse.listItems.useQuery();
  const alerts = useMemo(() => buildAlerts(itemsQuery.data ?? []), [itemsQuery.data]);

  if (itemsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground text-center py-10">Carregando...</p>;
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <PartyPopper className="text-teal mb-3" size={32} />
        <p className="text-sm font-semibold text-foreground">Tudo em ordem!</p>
        <p className="text-xs text-muted-foreground mt-1">
          Nenhum alerta de estoque ou validade de CA no momento.
        </p>
      </div>
    );
  }

  const urgentCount = alerts.filter((a) => a.level === 'urgente').length;

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-muted-foreground mb-3">
        {alerts.length} alerta{alerts.length !== 1 ? 's' : ''}
        {urgentCount > 0 && (
          <span className="text-danger font-semibold"> · {urgentCount} urgente{urgentCount !== 1 ? 's' : ''}</span>
        )}
      </p>
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`p-3.5 rounded-xl border flex items-start gap-3 ${LEVEL_STYLES[alert.level]}`}
          >
            <alert.Icon size={18} className="shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{alert.title}</p>
              <p className="text-xs opacity-80 mt-0.5">{alert.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
