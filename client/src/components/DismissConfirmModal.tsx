/*
 * Design: Industrial Blueprint — Neo-Industrial
 * DismissConfirmModal: confirmação para marcar um colaborador como demitido
 * ou readmiti-lo, no mesmo padrão da confirmação de exclusão.
 *
 * Diferente da exclusão, nenhuma das duas ações perde dados — por isso o texto
 * deixa claro o que acontece e a cor não é de alerta vermelho na readmissão.
 */

import { UserRoundX, RotateCcw } from 'lucide-react';

interface DismissConfirmModalProps {
  isOpen: boolean;
  /** true = marcando como demitido; false = readmitindo */
  dismissing: boolean;
  employeeName: string;
  isProcessing?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DismissConfirmModal({
  isOpen,
  dismissing,
  employeeName,
  isProcessing = false,
  onConfirm,
  onCancel,
}: DismissConfirmModalProps) {
  if (!isOpen) return null;

  const Icon = dismissing ? UserRoundX : RotateCcw;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in-up">
        <div className="flex items-center gap-4 mb-4">
          <div className={`p-3 rounded-full ${dismissing ? 'bg-warning/15' : 'bg-teal/10'}`}>
            <Icon className={dismissing ? 'text-warning' : 'text-teal'} size={24} />
          </div>
          <h3 className="text-xl font-bold text-foreground">
            {dismissing ? 'Confirmar Demissão' : 'Confirmar Readmissão'}
          </h3>
        </div>

        <p className="text-muted-foreground mb-6 leading-relaxed">
          {dismissing ? (
            <>
              Tem certeza que deseja marcar <span className="font-semibold text-foreground">{employeeName}</span> como
              demitido? Ele sairá das listas, contagens e alertas de vencimento, mas o cadastro e os
              treinamentos continuarão guardados e poderão ser consultados na aba Demitidos.
            </>
          ) : (
            <>
              Tem certeza que deseja readmitir{' '}
              <span className="font-semibold text-foreground">{employeeName}</span>? Ele voltará para
              a lista ativa e seus treinamentos passarão a contar novamente nas estatísticas e nos
              alertas de vencimento.
            </>
          )}
        </p>

        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={isProcessing}
            className={`flex-1 text-white py-3 rounded-xl font-bold transition-all text-sm disabled:opacity-50 ${
              dismissing ? 'bg-warning hover:opacity-90' : 'bg-teal hover:opacity-90'
            }`}
          >
            {isProcessing
              ? 'Aguarde...'
              : dismissing
                ? 'Sim, Marcar como Demitido'
                : 'Sim, Readmitir'}
          </button>
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1 bg-muted hover:bg-warm-gray-dark text-foreground py-3 rounded-xl font-bold transition-all text-sm disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
