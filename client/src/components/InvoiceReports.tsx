/*
 * InvoiceReports: relatórios financeiros com exportação em CSV — mensal,
 * por categoria e por fornecedor.
 */

import { useMemo } from 'react';
import { Download, TrendingUp, TrendingDown, Loader } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { EvolutionLineChart, ComparisonBarChart, CategoryPieChart } from '@/components/InvoiceCharts';
import {
  sumValues,
  groupByCategory,
  groupBySupplier,
  groupByCostCenter,
  groupByMonth,
  dailySeries,
  weeklySeries,
  formatCurrency,
  formatNumber,
  formatPercent,
} from '@/lib/invoice-analytics';

function exportCSV(data: Record<string, unknown>[], filename: string, headers: string[]) {
  const rows = data.map((r) => Object.values(r).map((v) => `"${v ?? ''}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function InvoiceReports() {
  const listQuery = trpc.invoices.list.useQuery();
  const invoices = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const report = useMemo(() => {
    const byCat = groupByCategory(invoices).slice(0, 10);
    const bySup = groupBySupplier(invoices).slice(0, 10);
    const byCC = groupByCostCenter(invoices).slice(0, 10);
    const byMonth = groupByMonth(invoices).slice(-12);
    const daily = dailySeries(invoices, 30);
    const weekly = weeklySeries(invoices, 12);
    const total = sumValues(invoices);
    return { byCat, bySup, byCC, byMonth, daily, weekly, total };
  }, [invoices]);

  if (listQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => exportCSV(report.byMonth, 'relatorio-mensal.csv', ['Mês', 'Total', 'Quantidade'])}
          className="flex items-center gap-1.5 text-xs font-semibold border border-border rounded-lg px-2.5 py-1.5 text-foreground hover:bg-muted"
        >
          <Download size={13} /> Mensal
        </button>
        <button
          onClick={() => exportCSV(report.byCat, 'relatorio-categorias.csv', ['Categoria', 'Total', 'Quantidade'])}
          className="flex items-center gap-1.5 text-xs font-semibold border border-border rounded-lg px-2.5 py-1.5 text-foreground hover:bg-muted"
        >
          <Download size={13} /> Categorias
        </button>
        <button
          onClick={() => exportCSV(report.bySup, 'relatorio-fornecedores.csv', ['Fornecedor', 'Total', 'Quantidade'])}
          className="flex items-center gap-1.5 text-xs font-semibold border border-border rounded-lg px-2.5 py-1.5 text-foreground hover:bg-muted"
        >
          <Download size={13} /> Fornecedores
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card rounded-xl p-3 border border-border">
          <p className="text-[11px] text-muted-foreground">Total geral</p>
          <p className="text-base font-bold text-foreground mt-0.5 truncate">{formatCurrency(report.total)}</p>
        </div>
        <div className="bg-card rounded-xl p-3 border border-border">
          <p className="text-[11px] text-muted-foreground">Notas</p>
          <p className="text-base font-bold text-foreground mt-0.5">{formatNumber(invoices.length)}</p>
        </div>
        <div className="bg-card rounded-xl p-3 border border-border">
          <p className="text-[11px] text-muted-foreground">Média/nota</p>
          <p className="text-base font-bold text-foreground mt-0.5 truncate">
            {formatCurrency(invoices.length ? report.total / invoices.length : 0)}
          </p>
        </div>
      </div>

      <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
        <h3 className="font-semibold text-foreground text-sm mb-1">Evolução diária</h3>
        <p className="text-xs text-muted-foreground mb-3">Últimos 30 dias</p>
        <EvolutionLineChart data={report.daily} color="#3b82f6" name="Gasto diário" />
      </div>

      <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
        <h3 className="font-semibold text-foreground text-sm mb-1">Evolução semanal</h3>
        <p className="text-xs text-muted-foreground mb-3">Últimas 12 semanas</p>
        <ComparisonBarChart data={report.weekly} color="#8b5cf6" name="Gasto semanal" />
      </div>

      <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
        <h3 className="font-semibold text-foreground text-sm mb-1">Comparativo mensal</h3>
        <p className="text-xs text-muted-foreground mb-3">Últimos 12 meses</p>
        <ComparisonBarChart data={report.byMonth} color="#6366f1" name="Total mensal" />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 font-medium">Mês</th>
                <th className="py-1.5 font-medium text-right">Total</th>
                <th className="py-1.5 font-medium text-right">Notas</th>
                <th className="py-1.5 font-medium text-right">Variação</th>
              </tr>
            </thead>
            <tbody>
              {report.byMonth
                .slice()
                .reverse()
                .map((m, i, arr) => {
                  const prev = arr[i + 1];
                  const variation = prev && prev.total > 0 ? ((m.total - prev.total) / prev.total) * 100 : null;
                  return (
                    <tr key={m.key} className="border-b border-border/60">
                      <td className="py-2 font-medium text-foreground">{m.label}</td>
                      <td className="py-2 text-right text-foreground">{formatCurrency(m.total)}</td>
                      <td className="py-2 text-right text-muted-foreground">{m.count}</td>
                      <td className="py-2 text-right">
                        {variation !== null ? (
                          <span className={`inline-flex items-center gap-1 font-medium ${variation > 0 ? 'text-danger' : 'text-teal'}`}>
                            {variation > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {formatPercent(Math.abs(variation))}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
        <h3 className="font-semibold text-foreground text-sm mb-1">Distribuição por categoria</h3>
        <p className="text-xs text-muted-foreground mb-3">Todas as despesas</p>
        {report.byCat.length ? <CategoryPieChart data={report.byCat} /> : <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>}
      </div>

      <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
        <h3 className="font-semibold text-foreground text-sm mb-1">Top fornecedores</h3>
        <p className="text-xs text-muted-foreground mb-3">Maior custo</p>
        {report.bySup.length ? (
          <ComparisonBarChart data={report.bySup.slice(0, 8)} color="#f59e0b" name="Total" height={240} />
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
        )}
      </div>

      <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
        <h3 className="font-semibold text-foreground text-sm mb-1">Gastos por centro de custo</h3>
        <p className="text-xs text-muted-foreground mb-3">Distribuição total</p>
        {report.byCC.length ? (
          <ComparisonBarChart data={report.byCC} color="#10b981" name="Total" height={240} />
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
        )}
      </div>
    </div>
  );
}
