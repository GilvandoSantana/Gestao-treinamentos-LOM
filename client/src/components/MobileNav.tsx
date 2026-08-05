/*
 * Design: Industrial Blueprint — Neo-Industrial
 * MobileNav: barra fixa no rodapé, só no celular. Cada aba é uma visualização
 * da lista por situação — as ações (relatórios, contas, tema, sair) ficam no
 * menu do cabeçalho, para a barra manter só navegação.
 */

import { Users, AlertTriangle, Clock, CircleCheck } from 'lucide-react';

export type MobileTab = 'colaboradores' | 'vencidos' | 'vencendo' | 'validos';

interface MobileNavProps {
  active: MobileTab;
  counts: { vencidos: number; vencendo: number; validos: number };
  onSelect: (tab: MobileTab) => void;
}

const tabs: {
  key: MobileTab;
  label: string;
  Icon: typeof Users;
  countKey?: 'vencidos' | 'vencendo' | 'validos';
  badgeClass?: string;
}[] = [
  { key: 'colaboradores', label: 'Todos', Icon: Users },
  { key: 'vencidos', label: 'Vencidos', Icon: AlertTriangle, countKey: 'vencidos', badgeClass: 'bg-danger' },
  { key: 'vencendo', label: 'Vencendo', Icon: Clock, countKey: 'vencendo', badgeClass: 'bg-warning' },
  { key: 'validos', label: 'Válidos', Icon: CircleCheck, countKey: 'validos', badgeClass: 'bg-teal' },
];

export default function MobileNav({ active, counts, onSelect }: MobileNavProps) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur border-t border-border flex pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      aria-label="Navegação principal"
    >
      {tabs.map(({ key, label, Icon, countKey, badgeClass }) => {
        const isActive = active === key;
        const count = countKey ? counts[countKey] : 0;

        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex-1 min-w-0 flex flex-col items-center gap-1 py-1 text-[11px] font-semibold transition-colors ${
              isActive ? 'text-orange' : 'text-muted-foreground'
            }`}
          >
            {isActive && <span className="absolute -top-2 w-6 h-[3px] bg-orange rounded-b" />}
            <span className="relative">
              <Icon size={20} className={isActive ? 'scale-110 transition-transform' : 'transition-transform'} />
              {countKey && count > 0 && (
                <span
                  className={`absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] px-1 rounded-full ${badgeClass} text-white font-technical text-[9px] flex items-center justify-center border-2 border-card`}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </span>
            <span className="truncate max-w-full px-0.5">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
