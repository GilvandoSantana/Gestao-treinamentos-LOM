/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseToolsByEmployeePanel: visão geral de quem está com o quê agora —
 * sem precisar escolher um funcionário primeiro, como na aba Entrega/Devolução.
 */

import { useMemo, useState } from 'react';
import { ClipboardList, Search, Wrench, Loader, ChevronDown, ChevronUp } from 'lucide-react';
import { trpc } from '@/lib/trpc';

export default function WarehouseToolsByEmployeePanel() {
  const [search, setSearch] = useState('');
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const deliveriesQuery = trpc.warehouse.listDeliveries.useQuery();

  const grouped = useMemo(() => {
    const active = (deliveriesQuery.data ?? []).filter((d) => d.status === 'entregue');
    const byEmployee = new Map<string, typeof active>();
    for (const d of active) {
      const list = byEmployee.get(d.employeeId) ?? [];
      list.push(d);
      byEmployee.set(d.employeeId, list);
    }
    return Array.from(byEmployee.entries())
      .map(([employeeId, items]) => ({ employeeId, employeeName: items[0].employeeName, items }))
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [deliveriesQuery.data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.trim().toLowerCase();
    return grouped.filter((g) => g.employeeName.toLowerCase().includes(q));
  }, [grouped, search]);

  return (
    <div className="max-w-3xl">
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por colaborador"
          className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
        />
      </div>

      {deliveriesQuery.isLoading && (
        <p className="text-sm text-muted-foreground flex items-center gap-2 py-10 justify-center">
          <Loader size={14} className="animate-spin" /> Carregando...
        </p>
      )}

      {!deliveriesQuery.isLoading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">
          {search ? 'Nenhum colaborador encontrado.' : 'Ninguém está com ferramentas ou EPIs no momento.'}
        </p>
      )}

      <div className="space-y-2">
        {filtered.map((group) => (
          <div key={group.employeeId} className="rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setExpandedEmployee(expandedEmployee === group.employeeId ? null : group.employeeId)}
              className="w-full flex items-center justify-between p-3 hover:bg-muted transition-colors"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <ClipboardList size={16} className="text-orange shrink-0" />
                <span className="text-sm font-medium text-foreground truncate">{group.employeeName}</span>
                <span className="text-xs text-muted-foreground font-technical shrink-0">
                  ({group.items.length} {group.items.length === 1 ? 'item' : 'itens'})
                </span>
              </span>
              {expandedEmployee === group.employeeId ? (
                <ChevronUp size={15} className="text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown size={15} className="text-muted-foreground shrink-0" />
              )}
            </button>

            {expandedEmployee === group.employeeId && (
              <div className="border-t border-border bg-muted/20 p-3 space-y-1.5">
                {group.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-foreground min-w-0">
                      <Wrench size={12} className="text-muted-foreground shrink-0" />
                      <span className="truncate">
                        {item.itemName} <span className="text-muted-foreground">× {item.quantity}</span>
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {new Date(item.deliveredAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
