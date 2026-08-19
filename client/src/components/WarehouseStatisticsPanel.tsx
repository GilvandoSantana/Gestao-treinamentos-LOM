/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseStatisticsPanel: estatísticas gerais do estoque — quantidade por
 * situação, rotatividade e eficiência de reposição.
 */

import { useMemo } from 'react';
import { BarChart3, Package, AlertTriangle, CheckCircle, Loader } from 'lucide-react';
import { trpc } from '@/lib/trpc';

export default function WarehouseStatisticsPanel() {
  const itemsQuery = trpc.warehouse.listItems.useQuery();
  const movementsQuery = trpc.warehouse.listMovements.useQuery();

  const stats = useMemo(() => {
    const items = itemsQuery.data ?? [];
    const movements = movementsQuery.data ?? [];

    const totalItens = items.length;
    const emEstoque = items.filter((i) => i.quantity > 0).length;
    const estoqueBaixo = items.filter((i) => i.quantity > 0 && i.quantity <= 20).length;
    const critico = items.filter((i) => i.quantity > 0 && i.quantity <= 5).length;

    const uniqueItemIds = new Set(movements.map((m) => m.itemId).filter(Boolean));
    const rotatividade = totalItens > 0 ? Math.round((uniqueItemIds.size / totalItens) * 100) : 0;

    const entradas = movements.filter((m) => m.movementType === 'entrada').length;
    const saidas = movements.filter((m) => m.movementType === 'saida').length;
    const eficiencia = saidas > 0 ? Math.min(Math.round((entradas / saidas) * 100), 100) : 100;

    return { totalItens, emEstoque, estoqueBaixo, critico, rotatividade, eficiencia };
  }, [itemsQuery.data, movementsQuery.data]);

  const isLoading = itemsQuery.isLoading || movementsQuery.isLoading;

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2 py-10 justify-center">
        <Loader size={14} className="animate-spin" /> Carregando...
      </p>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="p-4 rounded-xl border border-border bg-muted/20 flex items-center gap-2.5">
          <Package size={22} className="text-navy shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Total de Itens</p>
            <p className="text-lg font-bold text-foreground">{stats.totalItens}</p>
          </div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-muted/20 flex items-center gap-2.5">
          <CheckCircle size={22} className="text-teal shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Em Estoque</p>
            <p className="text-lg font-bold text-foreground">{stats.emEstoque}</p>
          </div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-muted/20 flex items-center gap-2.5">
          <AlertTriangle size={22} className="text-warning shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Estoque Baixo</p>
            <p className="text-lg font-bold text-foreground">{stats.estoqueBaixo}</p>
          </div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-muted/20 flex items-center gap-2.5">
          <AlertTriangle size={22} className="text-danger shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Crítico</p>
            <p className="text-lg font-bold text-foreground">{stats.critico}</p>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-border bg-muted/20">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-4">
          <BarChart3 size={15} className="text-orange" />
          Estatísticas Gerais
        </p>

        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Taxa de Rotatividade</span>
            <span className="text-foreground font-semibold">{stats.rotatividade}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-navy transition-all" style={{ width: `${stats.rotatividade}%` }} />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Eficiência de Reposição</span>
            <span className="text-foreground font-semibold">{stats.eficiencia}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-teal transition-all" style={{ width: `${stats.eficiencia}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
