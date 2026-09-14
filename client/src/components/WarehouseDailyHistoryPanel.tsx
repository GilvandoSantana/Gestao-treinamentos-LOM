/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseDailyHistoryPanel: movimentações de um dia específico — padrão é
 * hoje, mas dá pra escolher outro dia.
 *
 * Junta duas fontes: warehouseMovements (entrada/saída de material) e
 * toolDeliveries (entrega/devolução de ferramenta) — antes só mostrava a
 * primeira, então saída de ferramenta (que desde a unificação de Saída de
 * Material + Entrega de Ferramentas vira um empréstimo, não uma
 * movimentação comum) simplesmente não aparecia aqui.
 */

import { useMemo, useState } from 'react';
import { Calendar, ArrowDownCircle, ArrowUpCircle, Loader, Wrench, Download } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import DateInputBR from '@/components/DateInputBR';
import { exportDailyOutboundReport } from '@/lib/warehouse-report';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DayEvent {
  id: string;
  itemName: string;
  quantity: number;
  time: string;
  sortKey: string;
  detail: string;
  isEntrada: boolean;
  isTool: boolean;
}

export default function WarehouseDailyHistoryPanel() {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const movementsQuery = trpc.warehouse.listMovements.useQuery();
  const deliveriesQuery = trpc.warehouse.listDeliveries.useQuery();

  const dayEvents = useMemo<DayEvent[]>(() => {
    const movements = movementsQuery.data ?? [];
    const deliveries = deliveriesQuery.data ?? [];

    const fromMovements: DayEvent[] = movements
      .filter((m) => m.date.slice(0, 10) === selectedDate)
      .map((m) => ({
        id: `mov-${m.id}`,
        itemName: m.itemName,
        quantity: m.quantity,
        time: m.date,
        sortKey: m.date,
        detail: m.destination || m.responsible || m.supplier || 'sem detalhe',
        isEntrada: m.movementType === 'entrada',
        isTool: false,
      }));

    // Ferramenta entregue nesse dia entra como "saída"...
    const fromDeliveries: DayEvent[] = deliveries
      .filter((d) => d.deliveredAt.slice(0, 10) === selectedDate)
      .map((d) => ({
        id: `del-${d.id}`,
        itemName: d.itemName,
        quantity: d.quantity,
        time: d.deliveredAt,
        sortKey: d.deliveredAt,
        detail: `${d.employeeName} (empréstimo)`,
        isEntrada: false,
        isTool: true,
      }));

    // ...e se ela também foi devolvida nesse mesmo dia, entra de novo como
    // "entrada" (o dia pode ter as duas pontas: entregue de manhã, devolvida
    // à tarde, por exemplo).
    const fromReturns: DayEvent[] = deliveries
      .filter((d) => d.returnedAt && d.returnedAt.slice(0, 10) === selectedDate)
      .map((d) => ({
        id: `ret-${d.id}`,
        itemName: d.itemName,
        quantity: d.quantity,
        time: d.returnedAt!,
        sortKey: d.returnedAt!,
        detail: `${d.employeeName} (devolução)`,
        isEntrada: true,
        isTool: true,
      }));

    return [...fromMovements, ...fromDeliveries, ...fromReturns].sort((a, b) =>
      b.sortKey.localeCompare(a.sortKey)
    );
  }, [movementsQuery.data, deliveriesQuery.data, selectedDate]);

  const isToday = selectedDate === todayIso();
  const isLoading = movementsQuery.isLoading || deliveriesQuery.isLoading;
  const hasOutboundToday =
    (movementsQuery.data ?? []).some((m) => m.movementType === 'saida' && m.date.slice(0, 10) === selectedDate) ||
    (deliveriesQuery.data ?? []).some((d) => d.deliveredAt.slice(0, 10) === selectedDate);

  const handleDownload = () => {
    exportDailyOutboundReport(selectedDate, movementsQuery.data ?? [], deliveriesQuery.data ?? []);
  };

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Calendar size={15} className="text-muted-foreground shrink-0" />
        <DateInputBR
          value={selectedDate}
          onChange={(v) => v && setSelectedDate(v)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
        />
        {!isToday && (
          <button
            onClick={() => setSelectedDate(todayIso())}
            className="text-xs font-semibold text-orange hover:opacity-80"
          >
            Voltar para hoje
          </button>
        )}
        <button
          onClick={handleDownload}
          disabled={!hasOutboundToday}
          title={hasOutboundToday ? 'Baixar relatório de saída do dia' : 'Nenhuma saída nesse dia'}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-border text-foreground hover:bg-muted transition disabled:opacity-40 disabled:pointer-events-none"
        >
          <Download size={14} />
          Baixar saída do dia
        </button>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground flex items-center gap-2 py-10 justify-center">
          <Loader size={14} className="animate-spin" /> Carregando...
        </p>
      )}

      {!isLoading && dayEvents.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">
          Nenhuma movimentação {isToday ? 'hoje' : 'nesse dia'}.
        </p>
      )}

      <div className="space-y-1.5">
        {dayEvents.map((ev) => (
          <div
            key={ev.id}
            className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`p-1.5 rounded-lg shrink-0 ${
                  ev.isEntrada ? 'bg-teal/10 text-teal' : 'bg-danger/10 text-danger'
                }`}
              >
                {ev.isTool ? (
                  <Wrench size={14} />
                ) : ev.isEntrada ? (
                  <ArrowDownCircle size={14} />
                ) : (
                  <ArrowUpCircle size={14} />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">
                  <strong>{ev.itemName}</strong> — {ev.quantity}
                </p>
                <p className="text-xs text-muted-foreground truncate">{ev.detail}</p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground font-technical shrink-0">
              {new Date(ev.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
