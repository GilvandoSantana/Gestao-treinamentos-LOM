/*
 * Design: Industrial Blueprint — Neo-Industrial
 * FilterBar: pílulas roláveis horizontalmente com a contagem de colaboradores
 * em cada situação. No celular vira uma faixa deslizante (sem quebrar linha),
 * que é bem mais fácil de usar com o polegar do que botões empilhados.
 */

import { Printer } from 'lucide-react';
import { useMemo } from 'react';
import type { FilterType, Employee } from '@/lib/types';
import { getWorstStatus } from '@/lib/training-utils';

interface FilterBarProps {
  filter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  onPrintFilter?: (filter: FilterType) => void;
  isAdmin?: boolean;
  employees?: Employee[];
}

const filters: { key: FilterType; label: string; activeClass: string }[] = [
  { key: 'all', label: 'Todos', activeClass: 'bg-navy text-white border-navy' },
  { key: 'expired', label: 'Vencidos', activeClass: 'bg-danger text-white border-danger' },
  { key: 'expiring', label: 'Vencendo', activeClass: 'bg-warning text-white border-warning' },
  { key: 'valid', label: 'Válidos', activeClass: 'bg-teal text-white border-teal' },
];

export default function FilterBar({
  filter,
  onFilterChange,
  onPrintFilter,
  isAdmin = false,
  employees = [],
}: FilterBarProps) {
  // Conta colaboradores (não treinamentos) por situação, para que o número da
  // pílula corresponda exatamente ao tamanho da lista que ela filtra.
  const counts = useMemo(() => {
    const c: Record<FilterType, number> = { all: employees.length, valid: 0, expiring: 0, expired: 0 };
    for (const emp of employees) {
      const worst = getWorstStatus(emp);
      if (worst === 'expired') c.expired++;
      else if (worst === 'expiring') c.expiring++;
      else if (worst === 'valid') c.valid++;
    }
    return c;
  }, [employees]);

  return (
    <div className="mb-6 animate-fade-in-up" style={{ animationDelay: '320ms' }}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filters.map((f) => {
            const isActive = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => onFilterChange(f.key)}
                className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-200 ${
                  isActive
                    ? f.activeClass + ' shadow-sm'
                    : 'bg-card text-muted-foreground border-border hover:border-muted-foreground/40'
                }`}
              >
                {f.label}
                <span
                  className={`font-technical text-[11px] px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {counts[f.key]}
                </span>
              </button>
            );
          })}
        </div>

        {onPrintFilter && isAdmin && (
          <button
            onClick={() => onPrintFilter(filter)}
            className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold bg-orange text-white hover:opacity-90 transition-all duration-200 shadow-sm"
            title={`Imprimir ${filters.find((f) => f.key === filter)?.label || 'filtro'}`}
          >
            <Printer size={16} />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
        )}
      </div>
    </div>
  );
}
