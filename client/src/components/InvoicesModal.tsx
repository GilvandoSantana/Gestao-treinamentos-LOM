/*
 * Design: Industrial Blueprint — Neo-Industrial
 * InvoicesModal: central de Notas Fiscais e Recibos.
 */

import { Receipt, X } from 'lucide-react';
import InvoicePanel from '@/components/InvoicePanel';

interface InvoicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  canManage: boolean;
  isMasterAdmin?: boolean;
}

export default function InvoicesModal({ isOpen, onClose, canManage, isMasterAdmin = false }: InvoicesModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <Receipt className="text-orange shrink-0" size={21} />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-foreground truncate">Notas Fiscais</h2>
              <p className="text-xs text-muted-foreground truncate">Notas fiscais e recibos do contrato</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={23} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <InvoicePanel canManage={canManage} isMasterAdmin={isMasterAdmin} />
        </div>
      </div>
    </div>
  );
}
