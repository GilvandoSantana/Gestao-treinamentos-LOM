/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseDailyHistoryPanel: movimentações de um dia específico — padrão é
 * hoje, mas dá pra escolher outro dia.
 */

import { useMemo, useState } from 'react';
import { Calendar, ArrowDownCircle, ArrowUpCircle, Loader } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import DateInputBR from '@/components/DateInputBR';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function WarehouseDailyHistoryPanel() {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const movementsQuery = trpc.warehouse.listMovements.useQuery();

  const dayMovements = useMemo(() => {
    return (movementsQuery.data ?? [])
      .filter((m) => m.date.slice(0, 10) === selectedDate)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [movementsQuery.data, selectedDate]);

  const isToday = selectedDate === todayIso();

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-4">
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
      </div>

      {movementsQuery.isLoading && (
        <p className="text-sm text-muted-foreground flex items-center gap-2 py-10 justify-center">
          <Loader size={14} className="animate-spin" /> Carregando...
        </p>
      )}

      {!movementsQuery.isLoading && dayMovements.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">
          Nenhuma movimentação {isToday ? 'hoje' : 'nesse dia'}.
        </p>
      )}

      <div className="space-y-1.5">
        {dayMovements.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`p-1.5 rounded-lg shrink-0 ${
                  m.movementType === 'entrada' ? 'bg-teal/10 text-teal' : 'bg-danger/10 text-danger'
                }`}
              >
                {m.movementType === 'entrada' ? <ArrowDownCircle size={14} /> : <ArrowUpCircle size={14} />}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">
                  <strong>{m.itemName}</strong> — {m.quantity}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {m.destination || m.responsible || m.supplier || 'sem detalhe'}
                </p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground font-technical shrink-0">
              {new Date(m.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
