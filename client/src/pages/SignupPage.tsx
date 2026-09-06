/*
 * Design: Industrial Blueprint — Neo-Industrial (mesmo estilo do LoginPage)
 * SignupPage: cadastro público de organização nova. Sem confirmação por
 * e-mail, a organização e o administrador não chegam a existir de verdade —
 * ver server/routers/signup.ts.
 */

import { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';

export default function SignupPage() {
  const [organizationName, setOrganizationName] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);

  const signupMutation = trpc.signup.start.useMutation();
  const isLoading = signupMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      await signupMutation.mutateAsync({
        organizationName: organizationName.trim(),
        organizationSlug: organizationSlug.trim(),
        adminUsername: adminUsername.trim(),
        adminPassword,
        email: email.trim(),
      });
      setEmailSentTo(email.trim());
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível cadastrar.');
    }
  };

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

        <div className="relative bg-card rounded-2xl shadow-2xl overflow-hidden">
          <div className="absolute left-1/2 -translate-x-1/2 top-2.5 w-3 h-3 rounded-full bg-navy border border-black/20 z-10" />

          <div className="p-7 pb-5">
            <div className="flex flex-col items-center text-center mb-6 pt-2">
              <div className="w-[54px] h-[54px] rounded-2xl shadow-lg mb-4 overflow-hidden">
                <img src="/gescon-logo.svg" alt="GesCon" className="w-full h-full object-contain" />
              </div>
              <h1 className="font-display font-bold text-2xl tracking-tight text-foreground">
                {emailSentTo ? 'Quase lá' : 'Cadastre sua empresa'}
              </h1>
              <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground/70 mt-1">
                GesCon — Gestão de Contratos
              </p>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-brass to-transparent mb-6" />

            {emailSentTo ? (
              <div className="text-center space-y-4 py-2">
                <div className="w-14 h-14 rounded-full bg-teal/10 flex items-center justify-center mx-auto">
                  <Mail size={26} className="text-teal" />
                </div>
                <p className="text-sm text-foreground">
                  Mandamos um link de confirmação pra <strong>{emailSentTo}</strong>.
                </p>
                <p className="text-xs text-muted-foreground">
                  Clique no link do e-mail pra ativar sua conta — ele vale por 24 horas.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block font-technical text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                    Nome da empresa
                  </label>
                  <input
                    type="text"
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    placeholder="Ex: Acme Mineração"
                    disabled={isLoading}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block font-technical text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                    Identificador (sem espaço/acento)
                  </label>
                  <input
                    type="text"
                    value={organizationSlug}
                    onChange={(e) => setOrganizationSlug(e.target.value.toLowerCase())}
                    placeholder="Ex: acme-mineracao"
                    disabled={isLoading}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block font-technical text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                    Seu e-mail
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@empresa.com"
                    autoComplete="email"
                    disabled={isLoading}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block font-technical text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                    Usuário (pra você entrar depois)
                  </label>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="seu.usuario"
                    autoComplete="username"
                    disabled={isLoading}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block font-technical text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                    Senha (mínimo 8 caracteres)
                  </label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    disabled={isLoading}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent transition"
                  />
                </div>

                {error && (
                  <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-3.5 py-2.5">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-orange text-white font-semibold py-3 rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={17} className="animate-spin" />
                      Cadastrando...
                    </>
                  ) : (
                    'Cadastrar'
                  )}
                </button>

                <p className="text-center text-xs text-muted-foreground">
                  Já tem uma conta?{' '}
                  <Link href="/" className="text-orange hover:underline">
                    Entrar
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
