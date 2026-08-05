/*
 * Design: Industrial Blueprint — Neo-Industrial
 * LoginPage: porta de entrada do site. Nada é exibido antes do login.
 */

import { useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { setSessionMarker } from '@/lib/session-marker';

interface LoginPageProps {
  onSuccess: () => void;
}

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loginMutation = trpc.auth.siteLogin.useMutation();
  const isLoading = loginMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await loginMutation.mutateAsync({
        username: username.trim() || undefined,
        password,
      });
      // Guarda o marcador da sessão do navegador antes de seguir; sem ele o
      // servidor recusa o cookie recém-criado.
      if (result?.sessionMarker) setSessionMarker(result.sessionMarker);
      setPassword('');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível entrar.');
      setPassword('');
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

        <div className="bg-card rounded-2xl shadow-2xl p-7">
          <div className="flex flex-col items-center text-center mb-7">
            <div className="bg-orange p-3 rounded-2xl shadow-lg mb-4">
              <Shield size={30} className="text-white" />
            </div>
            <h1 className="font-display font-bold text-2xl tracking-tight text-foreground">
              Gestão de Treinamentos <span className="text-orange">LOM</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1.5">
              Entre para acessar os registros
            </p>
          </div>

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
              disabled={isLoading || !password}
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
          </form>

          <p className="text-center text-muted-foreground/70 text-xs mt-6 font-technical">
            Deixe o usuário em branco para entrar com a senha mestra
          </p>
        </div>

        <p className="text-center text-white/30 text-xs mt-5 font-technical tracking-wide">
          Criado por Gilvando Santana
        </p>
      </div>
    </div>
  );
}
