/*
 * Design: Industrial Blueprint — Neo-Industrial
 * DocumentsModal: central de documentos do sistema.
 *
 * Nasceu com uma única aba (FDS), mas a estrutura de abas já está pronta para
 * receber outros tipos de documento sem mexer no menu do cabeçalho — basta
 * adicionar uma entrada em TABS e o painel correspondente.
 */

import { useState } from 'react';
import { X, FolderOpen, FileWarning } from 'lucide-react';
import type { Employee } from '@/lib/types';
import FdsPanel from '@/components/FdsPanel';

interface DocumentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  canManage: boolean;
}

type DocumentTab = 'fds';

const TABS: { key: DocumentTab; label: string; Icon: typeof FileWarning }[] = [
  { key: 'fds', label: 'FDS', Icon: FileWarning },
];

export default function DocumentsModal({
  isOpen,
  onClose,
  employees,
  canManage,
}: DocumentsModalProps) {
  const [tab, setTab] = useState<DocumentTab>('fds');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <FolderOpen className="text-orange shrink-0" size={21} />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-foreground truncate">Documentos</h2>
              <p className="text-xs text-muted-foreground">
                {tab === 'fds' && 'Fichas de Dados de Segurança por função'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={23} />
          </button>
        </div>

        {/* Abas — hoje só FDS; a barra aparece assim que houver mais de um tipo */}
        {TABS.length > 1 && (
          <div className="flex gap-2 px-4 pt-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border transition ${
                  tab === key
                    ? 'bg-navy text-white border-navy'
                    : 'bg-card text-muted-foreground border-border hover:border-muted-foreground/40'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'fds' && <FdsPanel employees={employees} canManage={canManage} />}
        </div>
      </div>
    </div>
  );
}
