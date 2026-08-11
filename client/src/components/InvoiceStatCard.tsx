import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatPercent } from '@/lib/invoice-analytics';

interface InvoiceStatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  variation?: number;
  variationLabel?: string;
  subtitle?: string;
  accent?: 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan';
}

const accents: Record<string, string> = {
  blue: 'from-blue-500 to-indigo-600',
  emerald: 'from-emerald-500 to-teal-600',
  amber: 'from-amber-500 to-orange-600',
  rose: 'from-rose-500 to-pink-600',
  violet: 'from-violet-500 to-purple-600',
  cyan: 'from-cyan-500 to-sky-600',
};

export default function InvoiceStatCard({
  title,
  value,
  icon: Icon,
  variation,
  variationLabel,
  subtitle,
  accent = 'blue',
}: InvoiceStatCardProps) {
  const trendUp = (variation ?? 0) > 0;
  const trendDown = (variation ?? 0) < 0;
  const hasVariation = variation !== undefined && variation !== null;

  return (
    <div className="bg-card rounded-2xl p-4 border border-border shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow ${accents[accent]}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {hasVariation && (
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold ${
              trendUp ? 'bg-rose-500/10 text-rose-600' : trendDown ? 'bg-teal/10 text-teal' : 'bg-muted text-muted-foreground'
            }`}
          >
            {trendUp && <TrendingUp className="w-3 h-3" />}
            {trendDown && <TrendingDown className="w-3 h-3" />}
            {!trendUp && !trendDown && <Minus className="w-3 h-3" />}
            {formatPercent(Math.abs(variation ?? 0))}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground font-medium mb-0.5">{title}</p>
      <p className="text-xl font-bold text-foreground font-display tracking-tight truncate">{value}</p>
      {(variationLabel || subtitle) && <p className="text-[11px] text-muted-foreground mt-1.5">{variationLabel || subtitle}</p>}
    </div>
  );
}
