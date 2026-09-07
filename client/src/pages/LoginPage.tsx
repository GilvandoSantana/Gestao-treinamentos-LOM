/*
 * Design: Industrial Blueprint — Neo-Industrial
 * LoginPage: porta de entrada do site. Nada é exibido antes do login.
 */

import { useState } from 'react';
import { Loader2, KeyRound } from 'lucide-react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { setSessionMarker } from '@/lib/session-marker';

interface LoginPageProps {
  onSuccess: () => void;
}

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [justAuthorized, setJustAuthorized] = useState(false);
  // Preenchido só quando o servidor pede o segundo passo (2FA ativada na
  // conta) — a partir daí a tela troca pra pedir o código, em vez do
  // usuário/senha. Nunca vira cookie nem fica salvo em lugar nenhum além
  // da memória desta tela.
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [twoFACode, setTwoFACode] = useState('');

  const loginMutation = trpc.auth.siteLogin.useMutation();
  const verify2FAMutation = trpc.auth.verify2FALogin.useMutation();
  const isLoading = loginMutation.isPending || verify2FAMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Os dois campos são obrigatórios. Além de evitar envio incompleto, isso
    // mantém a interface uniforme para todos os acessos.
    const trimmedUsername = username.trim();
    if (!trimmedUsername && !password) {
      setError('Informe o usuário e a senha.');
      return;
    }
    if (!trimmedUsername) {
      setError('Informe o usuário.');
      return;
    }
    if (!password) {
      setError('Informe a senha.');
      return;
    }

    try {
      const result = await loginMutation.mutateAsync({
        username: trimmedUsername,
        password,
      });
      // Conta com 2FA ativada: o servidor ainda não criou a sessão de
      // verdade — só devolveu um token curto provando que a senha bateu.
      // Troca a tela pra pedir o código do app autenticador.
      if (result?.requires2FA && result.pendingToken) {
        setPendingToken(result.pendingToken);
        setPassword('');
        return;
      }
      // Guarda o marcador da sessão do navegador antes de seguir; sem ele o
      // servidor recusa o cookie recém-criado.
      if (result?.sessionMarker) setSessionMarker(result.sessionMarker);
      setPassword('');
      // Carimba o crachá de "acesso liberado" antes de trocar de tela — o
      // único momento de animação orquestrado desta página.
      setJustAuthorized(true);
      setTimeout(onSuccess, 620);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível entrar.');
      setPassword('');
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!pendingToken) return;
    if (!twoFACode.trim()) {
      setError('Informe o código.');
      return;
    }

    try {
      const result = await verify2FAMutation.mutateAsync({
        pendingToken,
        code: twoFACode.trim(),
      });
      if (result?.sessionMarker) setSessionMarker(result.sessionMarker);
      setTwoFACode('');
      setJustAuthorized(true);
      setTimeout(onSuccess, 620);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Código incorreto.');
      setTwoFACode('');
    }
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4 relative overflow-hidden">
      {/* Grade técnica de fundo */}
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 40px),repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 40px)',
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Marcas de canto */}
        <div className="absolute -top-2 -left-2 w-4 h-4 border-t border-l border-white/25" />
        <div className="absolute -top-2 -right-2 w-4 h-4 border-t border-r border-white/25" />
        <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b border-l border-white/25" />
        <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b border-r border-white/25" />

        <div className="relative bg-card rounded-2xl shadow-2xl overflow-hidden">
          {/* Ilhós do crachá */}
          <div className="absolute left-1/2 -translate-x-1/2 top-2.5 w-3 h-3 rounded-full bg-navy border border-black/20 z-10" />

          <div className="p-7 pb-5">
            <div className="flex flex-col items-center text-center mb-6 pt-2">
              <div className="w-[54px] h-[54px] rounded-2xl shadow-lg mb-4 overflow-hidden">
                <img src="/gescon-logo.svg" alt="GesCon" className="w-full h-full object-contain" />
              </div>
              <h1 className="font-display font-bold text-2xl tracking-tight text-foreground">
                GesCon
              </h1>
              <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground/70 mt-1">
                {pendingToken ? 'Verificação em duas etapas' : 'Gestão de Contratos'}
              </p>
            </div>

            {/* Friso de latão — acabamento da credencial */}
            <div className="h-px bg-gradient-to-r from-transparent via-brass to-transparent mb-6" />

            {pendingToken ? (
              <form onSubmit={handleVerify2FA} className="space-y-4">
                <div className="flex items-start gap-2.5 bg-muted/60 rounded-xl px-3.5 py-3 text-xs text-muted-foreground">
                  <KeyRound size={15} className="shrink-0 mt-0.5 text-orange" />
                  <span>
                    Abra o aplicativo autenticador no seu celular e digite o código de 6 dígitos. Perdeu o
                    acesso? Use um dos seus códigos de backup.
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="two-fa-code"
                    className="block font-technical text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5"
                  >
                    Código
                  </label>
                  <input
                    id="two-fa-code"
                    type="text"
                    inputMode="numeric"
                    value={twoFACode}
                    onChange={(e) => setTwoFACode(e.target.value)}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    autoFocus
                    disabled={isLoading}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-center text-lg tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent transition"
                  />
                </div>

                {error && (
                  <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-3.5 py-2.5">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || justAuthorized}
                  className="w-full bg-orange text-white font-semibold py-3 rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={17} className="animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    'Confirmar'
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPendingToken(null);
                    setTwoFACode('');
                    setError(null);
                  }}
                  disabled={isLoading}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition"
                >
                  Voltar
                </button>
              </form>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-username"
                  className="block font-technical text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5"
                >
                  Usuário
                </label>
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="seu.usuario"
                  autoComplete="username"
                  autoFocus
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange focus:border-transparent transition"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block font-technical text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5"
                >
                  Senha
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
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
                disabled={isLoading || justAuthorized}
                className="w-full bg-orange text-white font-semibold py-3 rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={17} className="animate-spin" />
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </button>

              <p className="text-center text-xs text-muted-foreground">
                Sua empresa ainda não usa o sistema?{' '}
                <Link href="/cadastro" className="text-orange hover:underline">
                  Cadastre-se
                </Link>
              </p>
            </form>
            )}
          </div>

          {/* Canhoto destacável do crachá */}
          <div className="border-t border-dashed border-border/70 bg-muted/40 px-7 py-2.5 flex items-center justify-between">
            <span className="font-technical text-[10px] text-muted-foreground/70 tracking-wide">
              Criado por Gilvando Santana
            </span>
            <span className="font-technical text-[10px] text-muted-foreground/50">GC-01</span>
          </div>

          {/* Selo de acesso liberado */}
          {justAuthorized && (
            <div
              className="absolute inset-0 bg-navy/80 flex items-center justify-center z-20"
              aria-hidden="true"
            >
              <div className="w-28 h-28 rounded-full border-4 border-double border-teal flex items-center justify-center -rotate-6 animate-stamp-punch">
                <span className="font-display font-bold text-teal text-xs text-center leading-tight px-2">
                  ACESSO
                  <br />
                  LIBERADO
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
