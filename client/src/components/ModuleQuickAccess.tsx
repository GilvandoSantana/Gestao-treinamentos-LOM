/*
 * Design: Industrial Blueprint — Neo-Industrial
 * ModuleQuickAccess: acesso direto aos módulos grandes do sistema (Nuvem,
 * Almoxarifado, Notas Fiscais, Crachás) — grande demais pra ficar escondido
 * num menu suspenso, merece destaque próprio na tela principal.
 */

import { Cloud, Warehouse, Receipt, CreditCard, ChevronRight } from 'lucide-react';

interface ModuleQuickAccessProps {
  onShowCloud?: () => void;
  onShowWarehouse?: () => void;
  onShowInvoices?: () => void;
  onShowBadges?: () => void;
}

export default function ModuleQuickAccess({
  onShowCloud,
  onShowWarehouse,
  onShowInvoices,
  onShowBadges,
}: ModuleQuickAccessProps) {
  const modules = [
    {
      key: 'cloud',
      label: 'Nuvem',
      sub: 'Arquivos e pastas',
      Icon: Cloud,
      onClick: onShowCloud,
      color: 'navy',
    },
    {
      key: 'warehouse',
      label: 'Almoxarifado',
      sub: 'Estoque e ferramentas',
      Icon: Warehouse,
      onClick: onShowWarehouse,
      color: 'orange',
    },
    {
      key: 'invoices',
      label: 'Notas Fiscais',
      sub: 'Financeiro',
      Icon: Receipt,
      onClick: onShowInvoices,
      color: 'teal',
    },
    {
      key: 'badges',
      label: 'Crachás',
      sub: 'Gerar e imprimir',
      Icon: CreditCard,
      onClick: onShowBadges,
      color: 'danger',
    },
  ].filter((m) => m.onClick);

  if (modules.length === 0) return null;

  const colorClasses: Record<string, { bg: string; icon: string; border: string }> = {
    navy: { bg: 'bg-navy/10', icon: 'text-navy', border: 'border-l-navy' },
    orange: { bg: 'bg-orange/10', icon: 'text-orange', border: 'border-l-orange' },
    teal: { bg: 'bg-teal/10', icon: 'text-teal', border: 'border-l-teal' },
    danger: { bg: 'bg-danger/10', icon: 'text-danger', border: 'border-l-danger' },
  };

  return (
    <div className="mb-6 animate-fade-in-up">
      <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-2 px-1">
        Módulos
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {modules.map(({ key, label, sub, Icon, onClick, color }) => {
          const c = colorClasses[color];
          return (
            <button
              key={key}
              onClick={onClick}
              className={`flex items-center gap-3 p-4 rounded-xl bg-card border border-border border-l-4 ${c.border} shadow-sm hover:shadow-md transition-all text-left group`}
            >
              <span className={`p-2.5 rounded-lg shrink-0 ${c.bg} ${c.icon}`}>
                <Icon size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold text-sm text-foreground truncate">{label}</p>
                <p className="text-xs text-muted-foreground truncate">{sub}</p>
              </div>
              <ChevronRight
                size={16}
                className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hidden md:block"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
