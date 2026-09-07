/*
 * Design: Industrial Blueprint — Neo-Industrial
 * TwoFactorSettingsModal: ativar/desativar a autenticação em duas etapas
 * (2FA) na própria conta — não é sobre gerenciar OUTRAS contas (isso é
 * AdminManagementModal, só pro administrador principal), qualquer conta
 * logada acessa isto pra proteger a si mesma.
 */

import { useState } from 'react';
import { X, ShieldCheck, ShieldOff, Loader2, Copy, Check, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface TwoFactorSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasTwoFactorEnabled: boolean;
  onStatusChange: () => void;
}

type Step = 'status' | 'scan' | 'backupCodes' | 'disable';

export default function TwoFactorSettingsModal({
  isOpen,
  onClose,
  hasTwoFactorEnabled,
  onStatusChange,
}: TwoFactorSettingsModalProps) {
  const [step, setStep] = useState<Step>('status');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [savedBackupCodes, setSavedBackupCodes] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setupStartMutation = trpc.auth.setup2FAStart.useMutation();
  const confirmMutation = trpc.auth.confirm2FASetup.useMutation();
  const disableMutation = trpc.auth.disable2FA.useMutation();
  const isLoading = setupStartMutation.isPending || confirmMutation.isPending || disableMutation.isPending;

  function resetAndClose() {
    setStep('status');
    setQrCodeDataUrl('');
    setSecret('');
    setCode('');
    setPassword('');
    setBackupCodes([]);
    setSavedBackupCodes(false);
    setCopied(false);
    setError(null);
    onClose();
  }

  async function handleStartSetup() {
    setError(null);
    try {
      const result = await setupStartMutation.mutateAsync();
      setQrCodeDataUrl(result.qrCodeDataUrl);
      setSecret(result.secret);
      setStep('scan');
    } catch (err) {
      toast.error('Não foi possível iniciar a configuração.');
    }
  }

  async function handleConfirmSetup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await confirmMutation.mutateAsync({ secret, code: code.trim() });
      setBackupCodes(result.backupCodes);
      setStep('backupCodes');
      setCode('');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Código incorreto.');
    }
  }

  function handleFinishSetup() {
    onStatusChange();
    toast.success('Autenticação em duas etapas ativada!');
    resetAndClose();
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await disableMutation.mutateAsync({ password });
      onStatusChange();
      toast.success('Autenticação em duas etapas desativada.');
      resetAndClose();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Senha incorreta.');
      setPassword('');
    }
  }

  function handleCopyBackupCodes() {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <ShieldCheck className="text-muted-foreground shrink-0" size={21} />
            <h2 className="font-display text-lg font-bold text-foreground truncate">
              Autenticação em duas etapas
            </h2>
          </div>
          <button onClick={resetAndClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={23} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 'status' && (
            <div className="space-y-4">
              {hasTwoFactorEnabled ? (
                <>
                  <div className="flex items-center gap-3 bg-teal/10 border border-teal/20 rounded-xl px-4 py-3">
                    <ShieldCheck className="text-teal shrink-0" size={22} />
                    <div>
                      <p className="text-sm font-semibold text-foreground">2FA está ativada</p>
                      <p className="text-xs text-muted-foreground">
                        Sua conta pede um código extra a cada login.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setStep('disable')}
                    className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-danger border border-danger/30 rounded-xl py-2.5 hover:bg-danger/5 transition"
                  >
                    <ShieldOff size={16} />
                    Desativar
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 bg-muted/60 rounded-xl px-4 py-3">
                    <ShieldOff className="text-muted-foreground shrink-0" size={22} />
                    <div>
                      <p className="text-sm font-semibold text-foreground">2FA está desativada</p>
                      <p className="text-xs text-muted-foreground">
                        Ative pra exigir um código extra do celular a cada login.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleStartSetup}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-orange rounded-xl py-2.5 hover:opacity-90 disabled:opacity-50 transition"
                  >
                    {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                    Ativar
                  </button>
                </>
              )}
            </div>
          )}

          {step === 'scan' && (
            <form onSubmit={handleConfirmSetup} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Escaneie este código com um aplicativo autenticador (Google Authenticator, Authy, etc.):
              </p>
              {qrCodeDataUrl && (
                <div className="flex justify-center bg-white rounded-xl p-4">
                  <img src={qrCodeDataUrl} alt="QR code de configuração" className="w-44 h-44" />
                </div>
              )}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground">
                  Não consegue escanear? Digite manualmente
                </summary>
                <p className="mt-2 font-mono bg-muted/60 rounded-lg px-3 py-2 break-all">{secret}</p>
              </details>

              <div>
                <label className="block font-technical text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                  Código do aplicativo
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="000000"
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
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-orange rounded-xl py-2.5 hover:opacity-90 disabled:opacity-50 transition"
              >
                {isLoading && <Loader2 size={16} className="animate-spin" />}
                Confirmar
              </button>
            </form>
          )}

          {step === 'backupCodes' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 bg-warning/10 border border-warning/25 rounded-xl px-3.5 py-3 text-xs text-foreground">
                <KeyRound size={15} className="shrink-0 mt-0.5 text-warning" />
                <span>
                  Guarde estes códigos num lugar seguro. Cada um funciona uma única vez, e servem pra
                  entrar caso você perca acesso ao aplicativo autenticador.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-muted/60 rounded-xl p-4">
                {backupCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>

              <button
                onClick={handleCopyBackupCodes}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-foreground border border-border rounded-xl py-2.5 hover:bg-muted/60 transition"
              >
                {copied ? <Check size={16} className="text-teal" /> : <Copy size={16} />}
                {copied ? 'Copiado!' : 'Copiar códigos'}
              </button>

              <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={savedBackupCodes}
                  onChange={(e) => setSavedBackupCodes(e.target.checked)}
                  className="w-4 h-4 accent-orange cursor-pointer"
                />
                Já guardei esses códigos num lugar seguro
              </label>

              <button
                onClick={handleFinishSetup}
                disabled={!savedBackupCodes}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-orange rounded-xl py-2.5 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Concluir
              </button>
            </div>
          )}

          {step === 'disable' && (
            <form onSubmit={handleDisable} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Digite sua senha atual pra confirmar a desativação da 2FA.
              </p>
              <div>
                <label className="block font-technical text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                  Senha
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
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
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-danger rounded-xl py-2.5 hover:opacity-90 disabled:opacity-50 transition"
              >
                {isLoading && <Loader2 size={16} className="animate-spin" />}
                Confirmar desativação
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('status');
                  setError(null);
                  setPassword('');
                }}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition"
              >
                Cancelar
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
