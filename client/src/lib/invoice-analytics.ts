/*
 * Analytics de Notas Fiscais — cálculos 100% client-side em cima da lista
 * já carregada via trpc.invoices.list. Nenhuma chamada extra ao servidor.
 */

import type { PublicInvoice } from '../../../server/db-invoices';

export function sumValues(invoices: PublicInvoice[]): number {
  return invoices.reduce((acc, inv) => acc + (Number(inv.value) || 0), 0);
}

function filterByDateRange(invoices: PublicInvoice[], start: Date, end: Date): PublicInvoice[] {
  return invoices.filter((inv) => {
    if (!inv.issueDate) return false;
    const d = new Date(inv.issueDate);
    return d >= start && d <= end;
  });
}

export function filterToday(invoices: PublicInvoice[]): PublicInvoice[] {
  const now = new Date();
  const s = new Date(now);
  s.setHours(0, 0, 0, 0);
  const e = new Date(now);
  e.setHours(23, 59, 59, 999);
  return filterByDateRange(invoices, s, e);
}

export function filterThisWeek(invoices: PublicInvoice[]): PublicInvoice[] {
  const now = new Date();
  const d = new Date(now);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const s = new Date(d.setDate(diff));
  s.setHours(0, 0, 0, 0);
  const e = new Date(now);
  e.setHours(23, 59, 59, 999);
  return filterByDateRange(invoices, s, e);
}

export function filterThisMonth(invoices: PublicInvoice[]): PublicInvoice[] {
  const now = new Date();
  const s = new Date(now.getFullYear(), now.getMonth(), 1);
  const e = new Date(now);
  e.setHours(23, 59, 59, 999);
  return filterByDateRange(invoices, s, e);
}

export function filterThisYear(invoices: PublicInvoice[]): PublicInvoice[] {
  const now = new Date();
  const s = new Date(now.getFullYear(), 0, 1);
  const e = new Date(now);
  e.setHours(23, 59, 59, 999);
  return filterByDateRange(invoices, s, e);
}

export function filterYesterday(invoices: PublicInvoice[]): PublicInvoice[] {
  const now = new Date();
  const s = new Date(now);
  s.setDate(s.getDate() - 1);
  s.setHours(0, 0, 0, 0);
  const e = new Date(s);
  e.setHours(23, 59, 59, 999);
  return filterByDateRange(invoices, s, e);
}

export function filterPreviousMonth(invoices: PublicInvoice[]): PublicInvoice[] {
  const now = new Date();
  const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return filterByDateRange(invoices, s, e);
}

export function filterPreviousWeek(invoices: PublicInvoice[]): PublicInvoice[] {
  const now = new Date();
  const d = new Date(now);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const thisWeekStart = new Date(d.setDate(diff));
  thisWeekStart.setHours(0, 0, 0, 0);
  const e = new Date(thisWeekStart);
  e.setSeconds(e.getSeconds() - 1);
  const s = new Date(e);
  s.setDate(s.getDate() - 6);
  s.setHours(0, 0, 0, 0);
  return filterByDateRange(invoices, s, e);
}

export function calcVariation(current: number, previous: number): number {
  if (!previous || previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}

export function averagePerDay(invoices: PublicInvoice[]): number {
  if (!invoices.length) return 0;
  const dates = new Set(invoices.filter((i) => i.issueDate).map((i) => new Date(i.issueDate).toDateString()));
  const days = Math.max(dates.size, 1);
  return sumValues(invoices) / days;
}

export function averagePerInvoice(invoices: PublicInvoice[]): number {
  if (!invoices.length) return 0;
  return sumValues(invoices) / invoices.length;
}

export interface GroupTotal {
  name: string;
  total: number;
  count: number;
  [key: string]: unknown;
}

export function groupByCategory(invoices: PublicInvoice[]): GroupTotal[] {
  const map: Record<string, GroupTotal> = {};
  invoices.forEach((inv) => {
    const cat = inv.category || 'Outros';
    if (!map[cat]) map[cat] = { name: cat, total: 0, count: 0 };
    map[cat].total += Number(inv.value) || 0;
    map[cat].count += 1;
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

export function groupBySupplier(invoices: PublicInvoice[]): GroupTotal[] {
  const map: Record<string, GroupTotal> = {};
  invoices.forEach((inv) => {
    const sup = inv.supplier || 'Não identificado';
    if (!map[sup]) map[sup] = { name: sup, total: 0, count: 0 };
    map[sup].total += Number(inv.value) || 0;
    map[sup].count += 1;
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

export function groupByCostCenter(invoices: PublicInvoice[]): GroupTotal[] {
  const map: Record<string, GroupTotal> = {};
  invoices.forEach((inv) => {
    const cc = inv.costCenter || 'Sem centro de custo';
    if (!map[cc]) map[cc] = { name: cc, total: 0, count: 0 };
    map[cc].total += Number(inv.value) || 0;
    map[cc].count += 1;
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

export interface MonthTotal {
  key: string;
  label: string;
  total: number;
  count: number;
  [key: string]: unknown;
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function groupByMonth(invoices: PublicInvoice[]): MonthTotal[] {
  const map: Record<string, MonthTotal> = {};
  invoices.forEach((inv) => {
    if (!inv.issueDate) return;
    const d = new Date(inv.issueDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
    if (!map[key]) map[key] = { key, label, total: 0, count: 0 };
    map[key].total += Number(inv.value) || 0;
    map[key].count += 1;
  });
  return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
}

export interface DaySeriesPoint {
  date: string;
  label: string;
  total: number;
  count: number;
  [key: string]: unknown;
}

export function dailySeries(invoices: PublicInvoice[], days = 30): DaySeriesPoint[] {
  const series: DaySeriesPoint[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dayInv = invoices.filter((inv) => {
      if (!inv.issueDate) return false;
      const id = new Date(inv.issueDate);
      return id.toDateString() === d.toDateString();
    });
    series.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      total: sumValues(dayInv),
      count: dayInv.length,
    });
  }
  return series;
}

export interface WeekSeriesPoint {
  label: string;
  total: number;
  count: number;
  [key: string]: unknown;
}

export function weeklySeries(invoices: PublicInvoice[], weeks = 12): WeekSeriesPoint[] {
  const series: WeekSeriesPoint[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let w = weeks - 1; w >= 0; w--) {
    const end = new Date(today);
    end.setDate(end.getDate() - w * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    const weekInv = invoices.filter((inv) => {
      if (!inv.issueDate) return false;
      const d = new Date(inv.issueDate);
      return d >= start && d <= end;
    });
    series.push({
      label: start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      total: sumValues(weekInv),
      count: weekInv.length,
    });
  }
  return series;
}

export function movingAverage(series: { total: number }[], window = 7): number[] {
  return series.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = series.slice(start, i + 1);
    const avg = slice.reduce((a, s) => a + s.total, 0) / slice.length;
    return Math.round(avg * 100) / 100;
  });
}

export function topCategory(invoices: PublicInvoice[]): GroupTotal | null {
  const cats = groupByCategory(invoices);
  return cats.length ? cats[0] : null;
}

export function detectDuplicates(invoices: PublicInvoice[]): PublicInvoice[] {
  const seen: Record<string, boolean> = {};
  const dupes: PublicInvoice[] = [];
  invoices.forEach((inv) => {
    if (inv.number && inv.cnpj) {
      const key = `${inv.number}-${inv.cnpj}`;
      if (seen[key]) {
        dupes.push(inv);
      } else {
        seen[key] = true;
      }
    }
  });
  return dupes;
}

export interface Anomaly {
  invoice: PublicInvoice;
  category: string;
  value: number;
  mean: number;
}

export function detectAnomalies(invoices: PublicInvoice[]): Anomaly[] {
  const byCat: Record<string, number[]> = {};
  invoices.forEach((inv) => {
    const cat = inv.category || 'Outros';
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(Number(inv.value) || 0);
  });
  const anomalies: Anomaly[] = [];
  Object.entries(byCat).forEach(([cat, values]) => {
    if (values.length < 3) return;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length);
    const threshold = mean + 2 * std;
    invoices.forEach((inv) => {
      if ((inv.category || 'Outros') === cat && (Number(inv.value) || 0) > threshold && threshold > 0) {
        anomalies.push({ invoice: inv, category: cat, value: inv.value, mean });
      }
    });
  });
  return anomalies;
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return '0';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return '0%';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}
