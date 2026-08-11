/*
 * InvoiceDashboard: visão geral de custos — KPIs, gráficos e alertas de
 * gastos atípicos/duplicados, tudo calculado no cliente a partir da lista
 * já carregada de notas fiscais do contrato.
 */

import { useMemo } from 'react';
import { CalendarDays, CalendarCheck, CalendarRange, CalendarClock, Receipt, TrendingUp, PieChart as PieChartIcon, Sparkles, AlertTriangle, Loader } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import InvoiceStatCard from '@/components/InvoiceStatCard';
import { EvolutionLineChart, CategoryPieChart, ComparisonBarChart, MovingAverageChart } from '@/components/InvoiceCharts';
import {
  sumValues,
  filterToday,
  filterThisWeek,
  filterThisMonth,
  filterThisYear,
  filterYesterday,
  filterPreviousWeek,
  filterPreviousMonth,
  calcVariation,
  averagePerDay,
  averagePerInvoice,
  groupByCategory,
  groupByMonth,
  dailySeries,
  movingAverage,
  topCategory,
  detectDuplicates,
  detectAnomalies,
  formatCurrency,
  formatNumber,
} from '@/lib/invoice-analytics';

export default function InvoiceDashboard() {
  const listQuery = trpc.invoices.list.useQuery();
  const invoices = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const stats = useMemo(() => {
    const today = filterToday(invoices);
    const week = filterThisWeek(invoices);
    const month = filterThisMonth(invoices);
    const year = filterThisYear(invoices);
    const yesterday = filterYesterday(invoices);
    const prevWeek = filterPreviousWeek(invoices);
    const prevMonth = filterPreviousMonth(invoices);

    const todayTotal = sumValues(today);
    const weekTotal = sumValues(week);
    const monthTotal = sumValues(month);
    const yearTotal = sumValues(year);

    return {
      today: { total: todayTotal, variation: calcVariation(todayTotal, sumValues(yesterday)) },
      week: { total: weekTotal, variation: calcVariation(weekTotal, sumValues(prevWeek)) },
      month: { total: monthTotal, count: month.length, variation: calcVariation(monthTotal, sumValues(prevMonth)) },
      year: { total: yearTotal, count: year.length },
      avgDay: averagePerDay(month),
      avgInvoice: averagePerInvoice(month),
      topCat: topCategory(month),
    };
  }, [invoices]);

  const charts = useMemo(() => {
    const daily = dailySeries(invoices, 30);
    const avg = movingAverage(daily, 7);
    const combined = daily.map((d, i) => ({ ...d, avg: avg[i] }));
    const byCat = groupByCategory(filterThisMonth(invoices)).slice(0, 8);
    const byMonth = groupByMonth(invoices).slice(-6);
    return { daily: combined, byCat, byMonth };
  }, [invoices]);

  const anomalies = useMemo(() => detectAnomalies(invoices), [invoices]);
  const dupes = useMemo(() => detectDuplicates(invoices), [invoices]);

  if (listQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <InvoiceStatCard
          title="Gasto hoje"
          value={formatCurrency(stats.today.total)}
          icon={CalendarDays}
          variation={stats.today.variation}
          variationLabel={`Ontem: ${formatCurrency(sumValues(filterYesterday(invoices)))}`}
          accent="blue"
        />
        <InvoiceStatCard
          title="Gasto da semana"
          value={formatCurrency(stats.week.total)}
          icon={CalendarCheck}
          variation={stats.week.variation}
          variationLabel="vs. semana anterior"
          accent="violet"
        />
        <InvoiceStatCard
          title="Gasto do mês"
          value={formatCurrency(stats.month.total)}
          icon={CalendarRange}
          variation={stats.month.variation}
          variationLabel="vs. mês anterior"
          accent="amber"
        />
        <InvoiceStatCard
          title="Gasto do ano"
          value={formatCurrency(stats.year.total)}
          icon={CalendarClock}
          variationLabel={`${formatNumber(stats.year.count)} notas no ano`}
          accent="emerald"
        />
        <InvoiceStatCard
          title="Média diária (mês)"
          value={formatCurrency(stats.avgDay)}
          icon={TrendingUp}
          accent="cyan"
          subtitle="Baseado nos dias com lançamentos"
        />
        <InvoiceStatCard
          title="Notas no mês"
          value={formatNumber(stats.month.count)}
          icon={Receipt}
          accent="rose"
          subtitle={`Média: ${formatCurrency(stats.avgInvoice)}`}
        />
        <InvoiceStatCard
          title="Categoria que mais gasta"
          value={stats.topCat ? stats.topCat.name : '—'}
          icon={PieChartIcon}
          accent="violet"
          subtitle={stats.topCat ? formatCurrency(stats.topCat.total) : 'Sem dados'}
        />
        <InvoiceStatCard
          title="Valor médio por nota"
          value={formatCurrency(stats.avgInvoice)}
          icon={Receipt}
          accent="blue"
          subtitle="No mês atual"
        />
      </div>

      {(anomalies.length > 0 || dupes.length > 0) && (
        <div className="space-y-2">
          {anomalies.length > 0 && (
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">Gastos atípicos detectados</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">{anomalies.length} nota(s) acima do padrão em suas categorias</p>
              </div>
            </div>
          )}
          {dupes.length > 0 && (
            <div className="flex items-center gap-3 bg-danger/10 border border-danger/30 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
              <div>
                <p className="text-sm font-semibold text-danger">Possíveis notas duplicadas</p>
                <p className="text-xs text-danger/80">{dupes.length} nota(s) com mesmo número e CNPJ</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-foreground text-sm">Evolução dos gastos</h3>
            <p className="text-xs text-muted-foreground">Últimos 30 dias com média móvel</p>
          </div>
          <Sparkles className="w-4 h-4 text-orange" />
        </div>
        <MovingAverageChart data={charts.daily} />
      </div>

      <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
        <h3 className="font-semibold text-foreground text-sm mb-1">Por categoria</h3>
        <p className="text-xs text-muted-foreground mb-3">Distribuição no mês</p>
        {charts.byCat.length ? <CategoryPieChart data={charts.byCat} /> : <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">Sem dados</div>}
      </div>

      <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
        <h3 className="font-semibold text-foreground text-sm mb-1">Comparativo mensal</h3>
        <p className="text-xs text-muted-foreground mb-3">Últimos 6 meses</p>
        <ComparisonBarChart data={charts.byMonth} color="#6366f1" />
      </div>
    </div>
  );
}
