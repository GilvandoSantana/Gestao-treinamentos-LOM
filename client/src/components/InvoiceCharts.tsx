/*
 * InvoiceCharts: gráficos do módulo de Notas Fiscais (Dashboard e
 * Relatórios), usando recharts — mesma biblioteca já usada no projeto.
 */

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
} from 'recharts';
import { formatCurrency } from '@/lib/invoice-analytics';

export const INVOICE_CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#a855f7',
];

const tooltipStyle = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '0.75rem',
  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
  fontSize: '0.8rem',
};

function formatTooltipValue(value: number) {
  return [formatCurrency(value), 'Valor'];
}

const axisTick = { fontSize: 11, fill: 'var(--muted-foreground)' };

// Tipo permissivo: os dados vêm de invoice-analytics.ts (GroupTotal,
// MonthTotal, DaySeriesPoint, WeekSeriesPoint) — cada um com seu próprio
// formato específico, todos compatíveis com o que o recharts precisa.
type SeriesDatum = Record<string, unknown>;

export function EvolutionLineChart({
  data,
  dataKey = 'total',
  xKey = 'label',
  name = 'Gastos',
  color = '#3b82f6',
}: {
  data: SeriesDatum[];
  dataKey?: string;
  xKey?: string;
  name?: string;
  color?: string;
}) {
  const gradId = `grad-${color.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey={xKey} tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={formatTooltipValue as never} />
        <Area type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2.5} fill={`url(#${gradId})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ComparisonBarChart({
  data,
  dataKey = 'total',
  xKey = 'label',
  name = 'Gastos',
  color = '#3b82f6',
  height = 280,
}: {
  data: SeriesDatum[];
  dataKey?: string;
  xKey?: string;
  name?: string;
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey={xKey} tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={formatTooltipValue as never} cursor={{ fill: 'var(--muted)' }} />
        <Bar dataKey={dataKey} name={name} fill={color} radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryPieChart({ data }: { data: SeriesDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={data} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={55} paddingAngle={2}>
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={INVOICE_CHART_COLORS[index % INVOICE_CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={formatTooltipValue as never} />
        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 11, color: 'var(--muted-foreground)' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function MovingAverageChart({ data, color = '#3b82f6' }: { data: SeriesDatum[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
        />
        <Tooltip contentStyle={tooltipStyle} formatter={formatTooltipValue as never} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="total" name="Gasto diário" stroke={color} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="avg" name="Média móvel (7d)" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
