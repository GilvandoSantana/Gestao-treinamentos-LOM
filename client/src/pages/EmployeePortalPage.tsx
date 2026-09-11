/*
 * Design: Industrial Blueprint — Neo-Industrial (mesmo estilo do LoginPage)
 * EmployeePortalPage: acesso próprio do colaborador, só de leitura, aos
 * seus treinamentos — CPF + PIN, bem mais simples que o login
 * administrativo (ver server/routers/employee-portal.ts pro porquê).
 */

import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, LogOut, KeyRound } from 'lucide-react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { getTrainingStatus } from '@/lib/training-utils';

type Step = 'checking' | 'cpf' | 'firstAccess' | 'login' | 'dashboard';

const statusColors: Record<string, string> = {
  expired: 'bg-danger/10 text-danger border-danger/20',
  expiring: 'bg-warning/15 text-warning border-warning/25',
  valid: 'bg-teal/10 text-teal border-teal/20',
  unknown: 'bg-muted text-muted-foreground border-border',
};

function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export default function EmployeePortalPage() {
  const [step, setStep] = useState<Step>('checking');
  const [cpf, setCpf] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const meQuery = trpc.employeePortal.me.useQuery(undefined, { retry: false });
  const firstAccessMutation = trpc.employeePortal.firstAccessSetup.useMutation();
  const loginMutation = trpc.employeePortal.login.useMutation();
  const logoutMutation = trpc.employeePortal.logout.useMutation();

  const isLoading =
    firstAccessMutation.isPending ||
    loginMutation.isPending ||
    logoutMutation.isPending;

  // Ao carregar a página, confere se já existe uma sessão válida (cookie
  // ainda não expirado) — se tiver, pula direto pro painel.
  useEffect(() => {
    if (meQuery.isLoading) return;
    if (meQuery.data) {
      setStep('dashboard');
    } else if (step === 'checking') {
      setStep('cpf');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meQuery.isLoading, meQuery.data]);

  async function handleCpfSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (cpf.replace(/\D/g, '').length !== 11) {
      setError('Digite os 11 números do CPF.');
      return;
    }
    setStep('login');
  }

  async function handleFirstAccessSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pin.length !== 6) {
      setError('O PIN deve ter exatamente 6 números.');
      return;
    }
    if (pin !== pinConfirm) {
      setError('Os PINs digitados são diferentes.');
      return;
    }
    try {
      await firstAccessMutation.mutateAsync({ cpf, activationCode, pin });
      setPin('');
      setPinConfirm('');
      await meQuery.refetch();
      setStep('dashboard');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível confirmar.');
    }
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await loginMutation.mutateAsync({ cpf, pin });
      setPin('');
      await meQuery.refetch();
      setStep('dashboard');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'CPF ou PIN incorretos.');
      setPin('');
    }
  }

  async function handleLogout() {
    await logoutMutation.mutateAsync();
    setCpf('');
    setActivationCode('');
    setPin('');
    setPinConfirm('');
    setError(null);
    setStep('cpf');
    meQuery.refetch();
  }

  if (step === 'checking' || meQuery.isLoading) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-orange" />
      </div>
    );
  }

  if (step === 'dashboard' && meQuery.data) {
    const { name, role, trainings } = meQuery.data;
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-lg mx-auto">
          <div className="bg-navy rounded-2xl p-5 mb-4 text-white">
            <p className="font-technical text-[11px] uppercase tracking-wider text-orange-light">GesCon</p>
            <h1 className="font-display font-bold text-xl mt-1">{name}</h1>
            <p className="text-sm text-white/70">{role}</p>
          </div>

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <h2 className="font-display font-bold text-foreground">Meus treinamentos</h2>
            </div>
            {trainings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10 px-5">
                Nenhum treinamento cadastrado ainda.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {trainings.map((t) => {
                  const status = getTrainingStatus(t.expirationDate);
                  return (
                    <div key={t.id} className="flex items-center justify-between px-5 py-3.5 gap-3">
                      <span className="text-sm font-medium text-foreground truncate">{t.name}</span>
                      <span
                        className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusColors[status.status]}`}
                      >
                        {status.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={handleLogout}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground mt-4 py-2.5 hover:text-foreground transition"
          >
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 40px),repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 40px)',
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="absolute -top-2 -left-2 w-4 h-4 border-t border-l border-white/25" />
        <div className="absolute -top-2 -right-2 w-4 h-4 border-t border-r border-white/25" />
        <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b border-l border-white/25" />
        <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b border-r border-white/25" />

        <div className="relative bg-card rounded-2xl shadow-2xl overflow-hidden p-7">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-[54px] h-[54px] rounded-2xl shadow-lg mb-4 overflow-hidden">
              <img src="/gescon-logo.svg" alt="GesCon" className="w-full h-full object-contain" />
            </div>
            <h1 className="font-display font-bold text-2xl tracking-tight text-foreground">
              {step === 'firstAccess' ? 'Primeiro acesso' : 'Meus treinamentos'}
            </h1>
            <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground/70 mt-1">
              Portal do colaborador
            </p>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-brass to-transparent mb-6" />

          {step === 'cpf' && (
            <form onSubmit={handleCpfSubmit} className="space-y-4">
              <div>
                <label htmlFor="portal-field-1" className="block font-technical text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                  CPF
                </label>
                <input id="portal-field-1"
                  type="text"
                  inputMode="numeric"
                  value={cpf}
                  onChange={(e) => setCpf(formatCpfInput(e.target.value))}
                  placeholder="000.000.000-00"
                  autoFocus
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent transition"
                />
              </div>

              {error && (
                <div role="alert" className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-3.5 py-2.5">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-orange rounded-xl py-3 hover:opacity-90 disabled:opacity-50 transition"
              >
                {isLoading && <Loader2 size={16} className="animate-spin" />}
                Continuar
              </button>
            </form>
          )}

          {step === 'firstAccess' && (
            <form onSubmit={handleFirstAccessSubmit} className="space-y-4">
              <div className="flex items-start gap-2.5 bg-muted/60 rounded-xl px-3.5 py-3 text-xs text-muted-foreground">
                <ShieldCheck size={15} className="shrink-0 mt-0.5 text-orange" />
                <span>Solicite ao RH um código de ativação, informe-o abaixo e crie um PIN de 6 números.</span>
              </div>

              <div>
                <label htmlFor="portal-field-2" className="block font-technical text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                  Código de ativação
                </label>
                <input id="portal-field-2"
                  type="text"
                  autoComplete="one-time-code"
                  maxLength={128}
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent transition"
                />
              </div>

              <div>
                <label htmlFor="portal-field-3" className="block font-technical text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                  Criar PIN (6 números)
                </label>
                <input id="portal-field-3"
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-center text-lg tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent transition"
                />
              </div>

              <div>
                <label htmlFor="portal-field-4" className="block font-technical text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                  Confirmar PIN
                </label>
                <input id="portal-field-4"
                  type="password"
                  inputMode="numeric"
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-center text-lg tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent transition"
                />
              </div>

              {error && (
                <div role="alert" className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-3.5 py-2.5">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-orange rounded-xl py-3 hover:opacity-90 disabled:opacity-50 transition"
              >
                {isLoading && <Loader2 size={16} className="animate-spin" />}
                Criar acesso
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('cpf');
                  setError(null);
                }}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition"
              >
                Voltar
              </button>
            </form>
          )}

          {step === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="flex items-start gap-2.5 bg-muted/60 rounded-xl px-3.5 py-3 text-xs text-muted-foreground">
                <KeyRound size={15} className="shrink-0 mt-0.5 text-orange" />
                <span>Digite o PIN que você criou no primeiro acesso.</span>
              </div>

              <div>
                <label htmlFor="portal-field-5" className="block font-technical text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                  PIN
                </label>
                <input id="portal-field-5"
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-center text-lg tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent transition"
                />
              </div>

              {error && (
                <div role="alert" className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-3.5 py-2.5">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-orange rounded-xl py-3 hover:opacity-90 disabled:opacity-50 transition"
              >
                {isLoading && <Loader2 size={16} className="animate-spin" />}
                Entrar
              </button>
              <button type="button" onClick={() => { setStep('firstAccess'); setPin(''); setPinConfirm(''); setError(null); }}
                className="w-full text-center text-sm text-orange hover:underline">
                Tenho código de ativação
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('cpf');
                  setError(null);
                }}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition"
              >
                Voltar
              </button>
            </form>
          )}

          <p className="text-center text-xs text-muted-foreground mt-5">
            <Link href="/" className="hover:underline">
              Sou administrador
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

