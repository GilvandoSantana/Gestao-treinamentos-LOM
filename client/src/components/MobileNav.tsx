/*
 * Design: Industrial Blueprint — Neo-Industrial
 * MobileNav: barra de navegação fixa no rodapé, só no celular. Coloca as
 * ações principais ao alcance do polegar, em vez de espremidas no cabeçalho.
 */

import { Users, AlertTriangle, FileText, ShieldCheck } from 'lucide-react';

export type MobileTab = 'colaboradores' | 'vencimentos' | 'relatorios' | 'admin';

interface MobileNavProps {
  active: MobileTab;
  expiredCount: number;
  onSelect: (tab: MobileTab) => void;
}

const tabs: { key: MobileTab; label: string; Icon: typeof Users }[] = [
  { key: 'colaboradores', label: 'Colaboradores', Icon: Users },
  { key: 'vencimentos', label: 'Vencimentos', Icon: AlertTriangle },
  { key: 'relatorios', label: 'Relatórios', Icon: FileText },
  { key: 'admin', label: 'Admin', Icon: ShieldCheck },
];

export default function MobileNav({ active, expiredCount, onSelect }: MobileNavProps) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur border-t border-border flex pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      aria-label="Navegação principal"
    >
      {tabs.map(({ key, label, Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex-1 flex flex-col items-center gap-1 py-1 text-[11px] font-semibold transition-colors ${
              isActive ? 'text-orange' : 'text-muted-foreground'
            }`}
          >
            {isActive && (
              <span className="absolute -top-2 w-7 h-[3px] bg-orange rounded-b" />
            )}
            <span className="relative">
              <Icon size={20} className={isActive ? 'scale-110 transition-transform' : 'transition-transform'} />
              {key === 'vencimentos' && expiredCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-danger text-white font-technical text-[9px] flex items-center justify-center border-2 border-card">
                  {expiredCount > 99 ? '99+' : expiredCount}
                </span>
              )}
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}
