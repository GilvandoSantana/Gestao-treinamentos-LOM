/*
 * Design: Industrial Blueprint — Neo-Industrial
 * PlanningCharts: indicadores voltados a DECIDIR, não só a descrever.
 *
 * Os gráficos que já existiam (escolaridade, faixa etária) mostram o perfil da
 * equipe; estes respondem perguntas de planejamento: quando os treinamentos
 * vencem, quais funções estão mais descobertas e quais treinamentos concentram
 * os problemas.
 */

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { Employee } from '@/lib/types';
import { getTrainingStatus } from '@/lib/training-utils';

interface PlanningChartsProps {
  employees: Employee[];
}

const COLORS = {
  expired: '#d64550',
  expiring: '#d99a20',
  valid: '#2d9f7f',
  navy: '#243040',
};

const MONTH_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default function PlanningCharts({ employees }: PlanningChartsProps) {
  /** Quantos treinamentos vencem em cada um dos próximos 12 meses. */
  const expirationCalendar = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const buckets: { key: string; label: string; count: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: `${MONTH_LABELS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
        count: 0,
      });
    }
    const index = new Map(buckets.map((b, i) => [b.key, i]));

    employees.forEach((emp) => {
      emp.trainings?.forEach((t) => {
        if (!t.expirationDate) return;
        const d = new Date(`${t.expirationDate}T00:00:00`);
        if (Number.isNaN(d.getTime())) return;
        const i = index.get(`${d.getFullYear()}-${d.getMonth()}`);
        if (i !== undefined) buckets[i].count++;
      });
    });

    return buckets;
  }, [employees]);

  /** Conformidade por função: quantos colaboradores com pendência em cada. */
  const byRole = useMemo(() => {
    const map = new Map<string, { role: string; expired: number; expiring: number; valid: number }>();

    employees.forEach((emp) => {
      const role = emp.role?.trim() || 'Sem função';
      const entry = map.get(role) ?? { role, expired: 0, expiring: 0, valid: 0 };

      emp.trainings?.forEach((t) => {
        const s = getTrainingStatus(t.expirationDate).status;
        if (s === 'expired') entry.expired++;
        else if (s === 'expiring') entry.expiring++;
        else if (s === 'valid') entry.valid++;
      });

      map.set(role, entry);
    });

    return Array.from(map.values())
      .filter((r) => r.expired + r.expiring + r.valid > 0)
      .sort((a, b) => b.expired + b.expiring - (a.expired + a.expiring))
      .slice(0, 8)
      .map((r) => ({ ...r, role: r.role.length > 22 ? `${r.role.slice(0, 21)}…` : r.role }));
  }, [employees]);

  /** Treinamentos que mais concentram pendências. */
  const criticalTrainings = useMemo(() => {
    const map = new Map<string, { name: string; pending: number }>();

    employees.forEach((emp) => {
      emp.trainings?.forEach((t) => {
        const s = getTrainingStatus(t.expirationDate).status;
        if (s !== 'expired' && s !== 'expiring') return;
        const name = t.name?.trim() || 'Sem nome';
        const entry = map.get(name) ?? { name, pending: 0 };
        entry.pending++;
        map.set(name, entry);
      });
    });

    return Array.from(map.values())
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 8)
      .map((t) => ({ ...t, name: t.name.length > 24 ? `${t.name.slice(0, 23)}…` : t.name }));
  }, [employees]);

  const hasCalendarData = expirationCalendar.some((b) => b.count > 0);

  const sectionTitle = 'text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1';
  const sectionHint = 'text-xs text-muted-foreground/80 mb-3';
  const emptyBox =
    'flex items-center justify-center h-[240px] w-full bg-muted/40 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground text-center px-4';

  return (
    <div className="space-y-8 mt-10 pt-8 border-t border-border">
      {/* Calendário de vencimentos */}
      <div>
        <h4 className={sectionTitle}>Vencimentos nos próximos 12 meses</h4>
        <p className={sectionHint}>
          Quantos treinamentos vencem em cada mês — serve para agendar turmas com antecedência.
        </p>
        {hasCalendarData ? (
          <div className="w-full h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expirationCalendar} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-35} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v} treinamento(s)`, 'Vencem']} />
                <Bar dataKey="count" radius={[5, 5, 0, 0]}>
                  {expirationCalendar.map((entry, i) => (
                    <Cell
                      key={i}
                      // Os três primeiros meses são os que exigem ação agora.
                      fill={i === 0 ? COLORS.expired : i <= 2 ? COLORS.expiring : COLORS.navy}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className={emptyBox}>Nenhum vencimento previsto para os próximos 12 meses.</div>
        )}
      </div>

      {/* Conformidade por função */}
      <div>
        <h4 className={sectionTitle}>Situação por função</h4>
        <p className={sectionHint}>
          Funções ordenadas pelo total de pendências — mostra onde a cobertura está mais fraca.
        </p>
        {byRole.length > 0 ? (
          <div className="w-full" style={{ height: Math.max(240, byRole.length * 42) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byRole} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.25} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="role" width={150} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="expired" stackId="s" name="Vencidos" fill={COLORS.expired} />
                <Bar dataKey="expiring" stackId="s" name="Vencendo" fill={COLORS.expiring} />
                <Bar dataKey="valid" stackId="s" name="Válidos" fill={COLORS.valid} radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className={emptyBox}>Sem treinamentos cadastrados para comparar funções.</div>
        )}
      </div>

      {/* Treinamentos críticos */}
      <div>
        <h4 className={sectionTitle}>Treinamentos com mais pendências</h4>
        <p className={sectionHint}>
          Soma de vencidos e vencendo por tipo de treinamento — ajuda a priorizar qual turma abrir primeiro.
        </p>
        {criticalTrainings.length > 0 ? (
          <div className="w-full" style={{ height: Math.max(240, criticalTrainings.length * 42) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={criticalTrainings}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.25} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v} pendência(s)`, 'Total']} />
                <Bar dataKey="pending" fill={COLORS.expired} radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className={emptyBox}>Nenhuma pendência no momento — todos os treinamentos em dia.</div>
        )}
      </div>
    </div>
  );
}
