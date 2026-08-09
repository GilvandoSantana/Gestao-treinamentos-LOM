/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WelcomeSummary: resumo rápido ao entrar, em vez de cair direto na lista
 * inteira. Mostra o que precisa de atenção esta semana e os próximos
 * aniversários — tudo calculado a partir dos dados já carregados, sem
 * consulta extra ao servidor.
 */

import { useMemo } from 'react';
import { AlertTriangle, Clock, Cake, PartyPopper } from 'lucide-react';
import type { Employee } from '@/lib/types';
import { useTrainingAlerts } from '@/hooks/useTrainingAlerts';

interface WelcomeSummaryProps {
  username?: string | null;
  employees: Employee[];
  onSeeExpiring: (status: 'expired' | 'expiring') => void;
}

type UpcomingBirthday = { name: string; date: Date; daysUntil: number };

function parseBirthDate(raw?: string): { month: number; day: number } | null {
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return { month: parsed.getMonth(), day: parsed.getDate() };
}

/** Próximo aniversário a partir de hoje (empurra pro ano seguinte se já passou). */
function nextOccurrence(month: number, day: number, today: Date): Date {
  const candidate = new Date(today.getFullYear(), month, day);
  candidate.setHours(0, 0, 0, 0);
  if (candidate.getTime() < today.getTime()) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }
  return candidate;
}

export default function WelcomeSummary({ username, employees, onSeeExpiring }: WelcomeSummaryProps) {
  const { expiredCount, expiringThisWeek } = useTrainingAlerts(employees);

  const { birthdays } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming: UpcomingBirthday[] = [];
    for (const emp of employees) {
      const parsed = parseBirthDate(emp.birthDate);
      if (!parsed) continue;
      const date = nextOccurrence(parsed.month, parsed.day, today);
      const daysUntil = Math.round((date.getTime() - today.getTime()) / (1000 * 3600 * 24));
      if (daysUntil <= 30) upcoming.push({ name: emp.name, date, daysUntil });
    }
    upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

    return { birthdays: upcoming.slice(0, 4) };
  }, [employees]);

  const firstName = username?.split(/[.\s]/)[0];
  const hasAlerts = expiringThisWeek > 0 || expiredCount > 0;

  return (
    <div className="mb-6 animate-fade-in-up">
      <h2 className="font-display text-xl font-bold text-foreground mb-3">
        {firstName ? `Olá, ${firstName}` : 'Bem-vindo'}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Pendências da semana */}
        <div className="bg-card rounded-xl border border-border p-4">
          {hasAlerts ? (
            <div className="space-y-2">
              {expiredCount > 0 && (
                <button
                  onClick={() => onSeeExpiring('expired')}
                  className="w-full flex items-center gap-2.5 text-left hover:opacity-80 transition-opacity"
                >
                  <span className="p-1.5 rounded-lg bg-danger/10 text-danger shrink-0">
                    <AlertTriangle size={16} />
                  </span>
                  <span className="text-sm text-foreground">
                    <strong>{expiredCount}</strong> treinamento{expiredCount !== 1 ? 's' : ''} vencido
                    {expiredCount !== 1 ? 's' : ''}
                  </span>
                </button>
              )}
              {expiringThisWeek > 0 && (
                <button
                  onClick={() => onSeeExpiring('expiring')}
                  className="w-full flex items-center gap-2.5 text-left hover:opacity-80 transition-opacity"
                >
                  <span className="p-1.5 rounded-lg bg-warning/10 text-warning shrink-0">
                    <Clock size={16} />
                  </span>
                  <span className="text-sm text-foreground">
                    <strong>{expiringThisWeek}</strong> vencendo essa semana
                  </span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-teal/10 text-teal shrink-0">
                <PartyPopper size={16} />
              </span>
              <span className="text-sm text-foreground">Nada vencendo essa semana. Tudo em dia!</span>
            </div>
          )}
        </div>

        {/* Próximos aniversários */}
        <div className="bg-card rounded-xl border border-border p-4">
          {birthdays.length > 0 ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-xs font-technical uppercase tracking-wider text-muted-foreground">
                <Cake size={14} />
                Próximos aniversários
              </p>
              {birthdays.map((b) => (
                <p key={`${b.name}-${b.date.toISOString()}`} className="text-sm text-foreground truncate">
                  <strong>{b.name}</strong>{' '}
                  <span className="text-muted-foreground font-technical text-xs">
                    {b.daysUntil === 0
                      ? 'hoje'
                      : b.daysUntil === 1
                        ? 'amanhã'
                        : `em ${b.daysUntil} dias`}
                  </span>
                </p>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-muted text-muted-foreground shrink-0">
                <Cake size={16} />
              </span>
              <span className="text-sm text-muted-foreground">
                Nenhum aniversário nos próximos 30 dias.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
