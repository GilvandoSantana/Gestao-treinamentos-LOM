/*
 * InvoiceAlerts: alertas calculados em cima das notas do contrato —
 * limite mensal, altas de categoria/fornecedor, gastos atípicos e
 * possíveis duplicidades. O limite mensal é a única parte persistida
 * (por contrato); os alertas em si são recalculados a cada visita.
 */

import { useEffect, useMemo, useState } from 'react';
import { Bell, AlertTriangle, TrendingUp, Copy, DollarSign, Loader, type LucideIcon } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import {
  sumValues,
  filterThisMonth,
  filterPreviousMonth,
  groupByCategory,
  groupBySupplier,
  detectDuplicates,
  detectAnomalies,
  formatCurrency,
} from '@/lib/invoice-analytics';

interface GeneratedAlert {
  severity: 'alta' | 'media' | 'baixa';
  title: string;
  message: string;
  icon: LucideIcon;
}

const severityStyles: Record<GeneratedAlert['severity'], string> = {
  alta: 'bg-danger/10 border-danger/30 text-danger',
  media: 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300',
  baixa: 'bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-blue-300',
};

interface InvoiceAlertsProps {
  canManage: boolean;
}

export default function InvoiceAlerts({ canManage }: InvoiceAlertsProps) {
  const listQuery = trpc.invoices.list.useQuery();
  const settingsQuery = trpc.invoices.settings.get.useQuery();
  const setLimitMutation = trpc.invoices.settings.setMonthlyLimit.useMutation();
  const utils = trpc.useUtils();

  const invoices = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const [limit, setLimit] = useState(5000);

  useEffect(() => {
    if (settingsQuery.data) setLimit(settingsQuery.data.monthlyLimit);
  }, [settingsQuery.data]);

  const handleLimitCommit = async (value: number) => {
    if (!canManage) return;
    try {
      await setLimitMutation.mutateAsync({ value });
      await utils.invoices.settings.get.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar o limite');
    }
  };

  const alerts = useMemo<GeneratedAlert[]>(() => {
    const result: GeneratedAlert[] = [];
    const month = filterThisMonth(invoices);
    const prevMonth = filterPreviousMonth(invoices);
    const monthTotal = sumValues(month);

    if (monthTotal > limit) {
      result.push({
        severity: 'alta',
        title: 'Limite mensal ultrapassado',
        message: `Os gastos do mês (${formatCurrency(monthTotal)}) ultrapassaram o limite de ${formatCurrency(limit)}.`,
        icon: DollarSign,
      });
    }

    const monthCats = groupByCategory(month);
    const prevCats = groupByCategory(prevMonth);
    monthCats.forEach((cat) => {
      const prev = prevCats.find((c) => c.name === cat.name);
      if (prev && prev.total > 0) {
        const variation = ((cat.total - prev.total) / prev.total) * 100;
        if (variation > 15) {
          result.push({
            severity: variation > 30 ? 'alta' : 'media',
            title: `Aumento em ${cat.name}`,
            message: `Os gastos com ${cat.name} aumentaram ${variation.toFixed(1)}% em relação ao mês anterior (${formatCurrency(prev.total)} → ${formatCurrency(cat.total)}).`,
            icon: TrendingUp,
          });
        }
      }
    });

    const monthSup = groupBySupplier(month);
    const prevSup = groupBySupplier(prevMonth);
    monthSup.slice(0, 20).forEach((sup) => {
      const prev = prevSup.find((s) => s.name === sup.name);
      if (prev && prev.total > 100 && sup.total > prev.total * 1.5) {
        const variation = ((sup.total - prev.total) / prev.total) * 100;
        result.push({
          severity: 'media',
          title: `Aumento de custos — ${sup.name}`,
          message: `Os custos com ${sup.name} aumentaram ${variation.toFixed(1)}% em relação ao mês anterior.`,
          icon: TrendingUp,
        });
      }
    });

    detectAnomalies(invoices)
      .slice(0, 5)
      .forEach((a) => {
        result.push({
          severity: 'media',
          title: 'Gasto atípico detectado',
          message: `Nota de ${formatCurrency(a.value)} em ${a.category}, muito acima da média de ${formatCurrency(a.mean)} da categoria.`,
          icon: AlertTriangle,
        });
      });

    detectDuplicates(invoices).forEach((d) => {
      result.push({
        severity: 'alta',
        title: 'Possível nota duplicada',
        message: `Nota ${d.number || 'sem número'} de ${d.supplier || 'fornecedor'} (CNPJ: ${d.cnpj || '—'}) pode estar duplicada.`,
        icon: Copy,
      });
    });

    return result;
  }, [invoices, limit]);

  if (listQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{alerts.length} alerta(s) ativo(s)</p>

      <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
        <h3 className="font-semibold text-foreground text-sm mb-2">Limite de gastos mensais</h3>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1000}
            max={50000}
            step={500}
            value={limit}
            disabled={!canManage}
            onChange={(e) => setLimit(Number(e.target.value))}
            onMouseUp={(e) => handleLimitCommit(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => handleLimitCommit(Number((e.target as HTMLInputElement).value))}
            className="flex-1 accent-orange"
          />
          <span className="font-bold text-foreground w-28 text-right text-sm">{formatCurrency(limit)}</span>
        </div>
        {!canManage && <p className="text-[11px] text-muted-foreground mt-2">Somente quem gerencia notas fiscais pode alterar o limite.</p>}
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum alerta no momento</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert, i) => {
            const Icon = alert.icon;
            return (
              <div key={i} className={`flex items-start gap-3 border rounded-xl p-3 ${severityStyles[alert.severity]}`}>
                <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{alert.title}</p>
                    <span className="text-[10px] uppercase font-bold opacity-70">{alert.severity}</span>
                  </div>
                  <p className="text-sm opacity-80 mt-0.5">{alert.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
