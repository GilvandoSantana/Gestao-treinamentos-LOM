/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseChartsPanel: top itens mais consumidos, tendência mensal e
 * saídas diárias — calculado a partir das movimentações já carregadas.
 */

import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { trpc } from '@/lib/trpc';
import type { WarehouseMovementInfo } from '@shared/warehouse';

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function buildChartData(movements: WarehouseMovementInfo[]) {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const saidas = movements.filter((m) => m.movementType === 'saida' && new Date(m.date) >= ninetyDaysAgo);

  // Top 10 mais consumidos
  const consumo = new Map<string, number>();
  for (const m of saidas) {
    const name = m.itemName || m.itemCode;
    consumo.set(name, (consumo.get(name) ?? 0) + m.quantity);
  }
  const topConsumidos = Array.from(consumo.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, total]) => ({ name: name.length > 25 ? `${name.slice(0, 25)}...` : name, total }));

  // Tendência mensal (últimos 6 meses)
  const monthly = new Map<string, number>();
  for (const m of saidas) {
    const key = m.date.slice(0, 7);
    monthly.set(key, (monthly.get(key) ?? 0) + m.quantity);
  }
  const tendenciaMensal = Array.from(monthly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, value]) => {
      const [year, month] = key.split('-');
      return { mes: `${MONTH_NAMES[parseInt(month, 10) - 1]}/${year.slice(2)}`, saidas: value };
    });

  // Saídas diárias (últimos 14 dias)
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  const saidasDiarias = days.map((day) => {
    const total = saidas
      .filter((m) => m.date.startsWith(day))
      .reduce((acc, m) => acc + m.quantity, 0);
    return {
      dia: new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      saidas: total,
    };
  });

  return { topConsumidos, tendenciaMensal, saidasDiarias };
}

export default function WarehouseChartsPanel() {
  const movementsQuery = trpc.warehouse.listMovements.useQuery();
  const { topConsumidos, tendenciaMensal, saidasDiarias } = useMemo(
    () => buildChartData(movementsQuery.data ?? []),
    [movementsQuery.data]
  );

  if (movementsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground text-center py-10">Carregando...</p>;
  }

  if (topConsumidos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <BarChart3 className="text-muted-foreground mb-3" size={32} />
        <p className="text-sm font-semibold text-foreground">Nenhuma saída registrada ainda</p>
        <p className="text-xs text-muted-foreground mt-1">
          Os gráficos aparecem assim que houver movimentações de saída.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-foreground mb-2">
          Top {topConsumidos.length} itens mais consumidos (90 dias)
        </p>
        <ResponsiveContainer width="100%" height={Math.max(250, topConsumidos.length * 32)}>
          <BarChart data={topConsumidos} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="total" fill="#e8772e" name="Qtd. saída" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {tendenciaMensal.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-foreground mb-2">Tendência mensal de saídas</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={tendenciaMensal}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="saidas" stroke="#1a2332" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <p className="text-sm font-semibold text-foreground mb-2">Saídas diárias (14 dias)</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={saidasDiarias}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="saidas" stroke="#e8772e" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
