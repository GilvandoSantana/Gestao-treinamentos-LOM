/*
 * Design: Industrial Blueprint — Neo-Industrial (mesmo estilo do LoginPage)
 * PaymentSuccessPage: destino de volta do Stripe Checkout (success_url).
 * Confirma o pagamento direto com o Stripe, cria a organização de
 * verdade (se ainda não tiver sido criada pelo webhook) e já loga a
 * pessoa.
 */

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';

export default function PaymentSuccessPage() {
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const finalizeMutation = trpc.signup.finalizeAfterPayment.useMutation();
  const attempted = useRef(false);

  useEffect(() => {
    // Mesmo cuidado do VerifySignupPage: evita chamar duas vezes.
    if (attempted.current) return;
    attempted.current = true;

    const sessionId = new URLSearchParams(window.location.search).get('session_id');
    if (!sessionId) {
      setStatus('error');
      setErrorMessage('Link incompleto — falta a confirmação do pagamento.');
      return;
    }

    finalizeMutation
      .mutateAsync({ sessionId })
      .then(() => { setStatus('success'); })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err instanceof Error && err.message ? err.message : 'Não foi possível concluir.');
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
              <p className="text-sm text-foreground">Confirmando o pagamento...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle2 size={40} className="text-teal mx-auto mb-4" />
              <h1 className="font-display font-bold text-xl text-foreground mb-1">Pagamento confirmado!</h1>
              <p className="text-sm text-muted-foreground mb-4">Sua conta está pronta. Entre com seu usuário e senha.</p>
              <Link href="/" className="text-orange hover:underline font-semibold">Ir para o login</Link>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle size={40} className="text-danger mx-auto mb-4" />
              <h1 className="font-display font-bold text-xl text-foreground mb-2">Não foi possível concluir</h1>
              <p className="text-sm text-muted-foreground mb-5">{errorMessage}</p>
              <Link href="/cadastro" className="text-orange hover:underline text-sm font-semibold">
                Voltar ao cadastro
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

