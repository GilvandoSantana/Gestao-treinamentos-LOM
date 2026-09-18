/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WelcomeSummary: resumo rápido ao entrar, em vez de cair direto na lista
 * inteira. Mostra o que precisa de atenção esta semana e os próximos
 * aniversários — tudo calculado a partir dos dados já carregados, sem
 * consulta extra ao servidor.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, Clock, Cake, PartyPopper, X } from 'lucide-react';
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

/** Formata uma data como DD/MM, pro dia do aniversário ao lado do nome. */
function formatDayMonth(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

export default function WelcomeSummary({ username, employees, onSeeExpiring }: WelcomeSummaryProps) {
  const { expiredCount, expiringThisWeek } = useTrainingAlerts(employees);

  const { birthdays, allBirthdays } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const all: UpcomingBirthday[] = [];
    for (const emp of employees) {
      const parsed = parseBirthDate(emp.birthDate);
      if (!parsed) continue;
      const date = nextOccurrence(parsed.month, parsed.day, today);
      const daysUntil = Math.round((date.getTime() - today.getTime()) / (1000 * 3600 * 24));
      all.push({ name: emp.name, date, daysUntil });
    }
    all.sort((a, b) => a.daysUntil - b.daysUntil);

    return { birthdays: all.filter((b) => b.daysUntil <= 30).slice(0, 4), allBirthdays: all };
  }, [employees]);

  const [showAllBirthdays, setShowAllBirthdays] = useState(false);

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

        {/* Próximos aniversários — clicável, abre a lista completa de todos os colaboradores */}
        <button
          type="button"
          onClick={() => setShowAllBirthdays(true)}
          className="bg-card rounded-xl border border-border p-4 text-left hover:border-orange/50 transition-colors"
        >
          {birthdays.length > 0 ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-xs font-technical uppercase tracking-wider text-muted-foreground">
                <Cake size={14} />
                Próximos aniversários
              </p>
              {birthdays.map((b) => (
                <div key={`${b.name}-${b.date.toISOString()}`} className="text-sm">
                  <p className="text-foreground font-semibold leading-snug break-words">{b.name}</p>
                  <p className="text-muted-foreground font-technical text-xs">
                    {formatDayMonth(b.date)} —{' '}
                    {b.daysUntil === 0
                      ? 'hoje'
                      : b.daysUntil === 1
                        ? 'amanhã'
                        : `em ${b.daysUntil} dias`}
                  </p>
                </div>
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
        </button>
      </div>

      {showAllBirthdays && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
          onClick={() => setShowAllBirthdays(false)}
        >
          <div
            className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <p className="flex items-center gap-2 font-display font-bold text-foreground">
                <Cake size={18} className="text-orange" />
                Todos os aniversários
              </p>
              <button onClick={() => setShowAllBirthdays(false)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {allBirthdays.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum colaborador com data de nascimento cadastrada.
                </p>
              ) : (
                <div className="space-y-3">
                  {allBirthdays.map((b) => (
                    <div key={`${b.name}-${b.date.toISOString()}`} className="text-sm border-b border-border/60 pb-2 last:border-0">
                      <p className="text-foreground font-semibold leading-snug break-words">{b.name}</p>
                      <p className="text-muted-foreground font-technical text-xs">
                        {formatDayMonth(b.date)} —{' '}
                        {b.daysUntil === 0
                          ? 'hoje'
                          : b.daysUntil === 1
                            ? 'amanhã'
                            : `em ${b.daysUntil} dias`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
