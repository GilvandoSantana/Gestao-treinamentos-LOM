/*
 * Design: Crachá oficial
 * StatCards: cada indicador vira um selo de latão gravado, não um card de
 * ícone genérico — reforça a linguagem de credencial/registro oficial.
 */

import type { Statistics } from '@/lib/types';

interface StatCardsProps {
  stats: Statistics;
}

export default function StatCards({ stats }: StatCardsProps) {
  const cards = [
    {
      label: 'Total',
      value: stats.total,
      ring: 'border-navy text-navy',
    },
    {
      label: 'Válidos',
      value: stats.valid,
      ring: 'border-teal text-teal',
    },
    {
      label: 'Vencendo',
      value: stats.expiring,
      ring: 'border-warning text-warning',
    },
    {
      label: 'Vencidos',
      value: stats.expired,
      ring: 'border-danger text-danger',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {cards.map((card, i) => (
        <div
          key={card.label}
          className="bg-card rounded-xl border border-border/70 py-5 px-3 shadow-sm hover:shadow-md transition-all duration-200 animate-fade-in-up flex flex-col items-center text-center gap-2.5"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div
            className={`w-16 h-16 rounded-full border-2 ${card.ring} flex items-center justify-center shrink-0`}
            style={{ borderStyle: 'double' }}
          >
            <span className="font-display font-bold text-xl">{card.value}</span>
          </div>
          <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground">
            {card.label}
          </p>
        </div>
      ))}
    </div>
  );
}
