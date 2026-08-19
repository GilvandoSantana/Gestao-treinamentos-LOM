/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehousePriceHistoryPanel: evolução real do preço de cada item, a partir
 * das entradas de estoque registradas — não o preço atual isolado.
 */

import { TrendingUp, TrendingDown, Minus, DollarSign } from 'lucide-react';
import { trpc } from '@/lib/trpc';

function formatMoney(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function WarehousePriceHistoryPanel() {
  const historyQuery = trpc.warehouse.listPriceHistory.useQuery();

  if (historyQuery.isLoading) {
    return <p className="text-sm text-muted-foreground text-center py-10">Carregando...</p>;
  }

  if (historyQuery.data?.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <DollarSign className="text-muted-foreground mb-3" size={32} />
        <p className="text-sm font-semibold text-foreground">Nenhum histórico ainda</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          Assim que você registrar uma entrada de estoque informando o preço, ela aparece aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      {historyQuery.data?.map((entry) => {
        const first = entry.history[0];
        const last = entry.history[entry.history.length - 1];
        const variation = first.unitPrice > 0 ? ((last.unitPrice - first.unitPrice) / first.unitPrice) * 100 : 0;
        const trend = variation > 0.5 ? 'up' : variation < -0.5 ? 'down' : 'stable';

        return (
          <div key={entry.itemId} className="p-4 rounded-xl border border-border bg-muted/30">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-foreground">{entry.itemName}</p>
                <p className="text-xs text-muted-foreground font-technical">{entry.itemCode}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-foreground font-technical">
                  {formatMoney(entry.currentPrice)}
                </span>
                {entry.history.length > 1 && (
                  <span
                    className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                      trend === 'up'
                        ? 'bg-danger/10 text-danger'
                        : trend === 'down'
                          ? 'bg-teal/10 text-teal'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {trend === 'up' && <TrendingUp size={12} />}
                    {trend === 'down' && <TrendingDown size={12} />}
                    {trend === 'stable' && <Minus size={12} />}
                    {variation > 0 ? '+' : ''}
                    {variation.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>

            <div className="mt-3 space-y-1">
              {entry.history.map((point, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg odd:bg-background/50"
                >
                  <span className="text-muted-foreground">
                    {new Date(point.date).toLocaleDateString('pt-BR')}
                    {point.supplier && <> · {point.supplier}</>}
                    {point.invoiceNumber && <> · NF {point.invoiceNumber}</>}
                  </span>
                  <span className="font-technical text-foreground font-medium">
                    {formatMoney(point.unitPrice)} <span className="text-muted-foreground">× {point.quantity}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
