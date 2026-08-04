/*
 * Design: Industrial Blueprint — Neo-Industrial
 * StatCards: Dashboard statistics with left border accent, navy/orange/teal/red palette
 */

import { Calendar, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import type { Statistics } from '@/lib/types';

interface StatCardsProps {
  stats: Statistics;
}

export default function StatCards({ stats }: StatCardsProps) {
  const cards = [
    {
      label: 'Total de Treinamentos',
      value: stats.total,
      icon: Calendar,
      borderColor: 'border-l-navy',
      iconColor: 'text-navy',
      bgIcon: 'bg-navy/10',
    },
    {
      label: 'Válidos',
      value: stats.valid,
      icon: CheckCircle,
      borderColor: 'border-l-teal',
      iconColor: 'text-teal',
      bgIcon: 'bg-teal/10',
    },
    {
      label: 'Próximos a Vencer',
      value: stats.expiring,
      icon: Clock,
      borderColor: 'border-l-warning',
      iconColor: 'text-warning',
      bgIcon: 'bg-warning/10',
    },
    {
      label: 'Vencidos',
      value: stats.expired,
      icon: AlertTriangle,
      borderColor: 'border-l-danger',
      iconColor: 'text-danger',
      bgIcon: 'bg-danger/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {cards.map((card, i) => (
        <div
          key={card.label}
          className={`bg-card rounded-xl border-l-4 ${card.borderColor} p-5 shadow-sm hover:shadow-md transition-all duration-200 animate-fade-in-up`}
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm font-medium">{card.label}</p>
              <p className="text-3xl font-display font-bold text-card-foreground mt-1">{card.value}</p>
            </div>
            <div className={`${card.bgIcon} p-3 rounded-xl`}>
              <card.icon className={card.iconColor} size={28} strokeWidth={2} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
