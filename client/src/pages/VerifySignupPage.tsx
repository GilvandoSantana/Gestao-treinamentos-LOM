/*
 * Design: Industrial Blueprint — Neo-Industrial (mesmo estilo do LoginPage)
 * VerifySignupPage: destino do link de confirmação por e-mail. Confirma o
 * token, cria a organização de verdade, e já loga a pessoa.
 */

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { setSessionMarker } from '@/lib/session-marker';

export default function VerifySignupPage() {
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const verifyMutation = trpc.signup.verify.useMutation();
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const attempted = useRef(false);

  useEffect(() => {
    // Evita chamar duas vezes (o React roda efeitos duas vezes em
    // desenvolvimento, e um token de confirmação só pode ser usado uma
    // vez — a segunda chamada daria "link inválido" mesmo a primeira
    // tendo funcionado).
    if (attempted.current) return;
    attempted.current = true;

    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setStatus('error');
      setErrorMessage('Link incompleto — falta o código de confirmação.');
      return;
    }

    verifyMutation
      .mutateAsync({ token })
      .then(async (result) => {
        if (result?.sessionMarker) setSessionMarker(result.sessionMarker);
        setStatus('success');
        // Mesmo cuidado do LoginPage (Home.tsx): invalida a sessão em
        // cache antes de navegar, senão a tela seguinte podia achar,
        // por um instante, que ninguém está logado ainda.
        await utils.invalidate();
        setTimeout(() => setLocation('/'), 900);
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err instanceof Error && err.message ? err.message : 'Não foi possível confirmar.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        <div className="relative bg-card rounded-2xl shadow-2xl overflow-hidden p-7 text-center">
          {status === 'checking' && (
            <>
              <Loader2 size={40} className="animate-spin text-orange mx-auto mb-4" />
              <p className="text-sm text-foreground">Confirmando seu cadastro...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle2 size={40} className="text-teal mx-auto mb-4" />
              <h1 className="font-display font-bold text-xl text-foreground mb-1">Cadastro confirmado!</h1>
              <p className="text-sm text-muted-foreground">Entrando no sistema...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle size={40} className="text-danger mx-auto mb-4" />
              <h1 className="font-display font-bold text-xl text-foreground mb-2">Não foi possível confirmar</h1>
              <p className="text-sm text-muted-foreground mb-5">{errorMessage}</p>
              <Link href="/cadastro" className="text-orange hover:underline text-sm font-semibold">
                Fazer o cadastro de novo
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
