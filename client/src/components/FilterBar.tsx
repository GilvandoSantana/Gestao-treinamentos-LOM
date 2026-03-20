/*
 * Design: Industrial Blueprint — Neo-Industrial
 * FilterBar: Horizontal filter tabs with active indicator and print button
 */

import { ListFilter, Printer } from 'lucide-react';
import type { FilterType } from '@/lib/types';

interface FilterBarProps {
  filter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  onPrintFilter?: (filter: FilterType) => void;
  isAdmin?: boolean;
}

const filters: { key: FilterType; label: string; activeClass: string }[] = [
  { key: 'all', label: 'Todos', activeClass: 'bg-navy text-white' },
  { key: 'valid', label: 'Válidos', activeClass: 'bg-teal text-white' },
  { key: 'expiring', label: 'Próximos a Vencer', activeClass: 'bg-warning text-white' },
  { key: 'expired', label: 'Vencidos', activeClass: 'bg-danger text-white' },
];

export default function FilterBar({ filter, onFilterChange, onPrintFilter, isAdmin = false }: FilterBarProps) {
  return (
    <div className="bg-card rounded-xl shadow-sm p-3 mb-8 animate-fade-in-up" style={{ animationDelay: '320ms' }}>
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-muted-foreground px-2">
            <ListFilter size={18} />
            <span className="text-sm font-semibold hidden sm:inline">Filtrar:</span>
          </div>
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                filter === f.key
                  ? f.activeClass + ' shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-warm-gray-dark'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        
        {/* Print button - Only for Admin */}
        {onPrintFilter && isAdmin && (
          <button
            onClick={() => onPrintFilter(filter)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-orange-600 text-white hover:bg-orange-700 transition-all duration-200 shadow-sm"
            title={`Imprimir ${filters.find(f => f.key === filter)?.label || 'filtro'}`}
          >
            <Printer size={16} />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
        )}
      </div>
    </div>
  );
}
