/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseMonthlyReportPanel: resumo de entradas/saídas do mês atual.
 */

import { useMemo } from 'react';
import { FileBarChart, TrendingUp, TrendingDown, Package, Loader } from 'lucide-react';
import { trpc } from '@/lib/trpc';

export default function WarehouseMonthlyReportPanel() {
  const itemsQuery = trpc.warehouse.listItems.useQuery();
  const movementsQuery = trpc.warehouse.listMovements.useQuery();

  const stats = useMemo(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthMovements = (movementsQuery.data ?? []).filter((m) => new Date(m.date) >= firstDay);
    return {
      entradas: monthMovements.filter((m) => m.movementType === 'entrada').length,
      saidas: monthMovements.filter((m) => m.movementType === 'saida').length,
      itensAtivos: itemsQuery.data?.length ?? 0,
    };
  }, [movementsQuery.data, itemsQuery.data]);

  const isLoading = itemsQuery.isLoading || movementsQuery.isLoading;
  const monthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2 py-10 justify-center">
        <Loader size={14} className="animate-spin" /> Carregando...
      </p>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="p-4 rounded-xl border border-border bg-muted/20 flex items-center gap-3">
          <TrendingUp size={26} className="text-teal shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Entradas</p>
            <p className="text-xl font-bold text-foreground">{stats.entradas}</p>
          </div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-muted/20 flex items-center gap-3">
          <TrendingDown size={26} className="text-danger shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Saídas</p>
            <p className="text-xl font-bold text-foreground">{stats.saidas}</p>
          </div>
        </div>
        <div className="p-4 rounded-xl border border-border bg-muted/20 flex items-center gap-3">
          <Package size={26} className="text-navy shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Itens Ativos</p>
            <p className="text-xl font-bold text-foreground">{stats.itensAtivos}</p>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-border bg-muted/20">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-1.5">
          <FileBarChart size={15} className="text-orange" />
          Relatório Mensal
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          Resumo de movimentações de {monthLabel}.
        </p>
        <div className="space-y-1.5">
          <div className="flex justify-between p-2.5 rounded-lg bg-card text-sm">
            <span className="text-muted-foreground">Total de Entradas</span>
            <span className="text-teal font-bold">{stats.entradas}</span>
          </div>
          <div className="flex justify-between p-2.5 rounded-lg bg-card text-sm">
            <span className="text-muted-foreground">Total de Saídas</span>
            <span className="text-danger font-bold">{stats.saidas}</span>
          </div>
          <div className="flex justify-between p-2.5 rounded-lg bg-card text-sm">
            <span className="text-muted-foreground">Itens Cadastrados</span>
            <span className="text-navy font-bold">{stats.itensAtivos}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
