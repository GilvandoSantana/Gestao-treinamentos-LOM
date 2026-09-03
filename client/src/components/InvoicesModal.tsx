/*
 * Design: Industrial Blueprint — Neo-Industrial
 * InvoicesModal: central de Notas Fiscais — cadastro, dashboard,
 * relatórios, alertas e categorias, tudo num só modal com abas (mesmo
 * padrão do DocumentsModal).
 */

import { useState } from 'react';
import { Receipt, X, LayoutDashboard, FileBarChart, Bell, Tag, ListChecks } from 'lucide-react';
import InvoicePanel from '@/components/InvoicePanel';
import InvoiceDashboard from '@/components/InvoiceDashboard';
import InvoiceReports from '@/components/InvoiceReports';
import InvoiceAlerts from '@/components/InvoiceAlerts';
import InvoiceCategoriesPanel from '@/components/InvoiceCategoriesPanel';

type InvoiceTab = 'notas' | 'dashboard' | 'relatorios' | 'alertas' | 'categorias';

const TABS: { key: InvoiceTab; label: string; icon: typeof Receipt }[] = [
  { key: 'notas', label: 'Notas', icon: ListChecks },
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'relatorios', label: 'Relatórios', icon: FileBarChart },
  { key: 'alertas', label: 'Alertas', icon: Bell },
  { key: 'categorias', label: 'Categorias', icon: Tag },
];

interface InvoicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  canManage: boolean;
  isMasterAdmin?: boolean;
}

export default function InvoicesModal({ isOpen, onClose, canManage, isMasterAdmin = false }: InvoicesModalProps) {
  const [tab, setTab] = useState<InvoiceTab>('notas');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-1.5 sm:p-3">
      <div className="bg-card rounded-2xl shadow-2xl w-full h-full sm:h-[97vh] sm:w-[97vw] max-w-none flex flex-col">
        <div className="relative bg-gradient-to-r from-navy to-navy-light p-5 pt-6">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 w-3.5 h-3.5 rounded-full bg-background border border-black/10" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <Receipt className="text-orange-light shrink-0" size={21} />
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold text-white truncate">Notas Fiscais</h2>
                <p className="text-xs text-white/60 truncate">Cadastro, dashboard, relatórios e alertas</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white shrink-0">
              <X size={23} />
            </button>
          </div>
        </div>
        <div className="h-0 border-t border-dashed border-border/70" aria-hidden="true" />

        <div className="flex gap-2 px-4 pt-3 pb-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border transition ${
                tab === key
                  ? 'bg-navy text-white border-navy'
                  : 'bg-card text-muted-foreground border-border hover:border-muted-foreground/40'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'notas' && <InvoicePanel canManage={canManage} isMasterAdmin={isMasterAdmin} />}
          {tab === 'dashboard' && <InvoiceDashboard />}
          {tab === 'relatorios' && <InvoiceReports />}
          {tab === 'alertas' && <InvoiceAlerts canManage={canManage} />}
          {tab === 'categorias' && <InvoiceCategoriesPanel canManage={canManage} />}
        </div>
      </div>
    </div>
  );
}
