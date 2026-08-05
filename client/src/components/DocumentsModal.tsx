/*
 * Design: Industrial Blueprint — Neo-Industrial
 * DocumentsModal: central de documentos do sistema.
 *
 * Cada tipo (ARA, Checklist, FDS, LTCAT, PGR, POS) é uma aba, em ordem
 * alfabética, e todas compartilham o mesmo painel — um PDF com nome e, se
 * quiser, as funções que o utilizam. Para acrescentar um tipo novo basta
 * incluí-lo em shared/document-types.ts.
 */

import { useState } from 'react';
import { X, FolderOpen } from 'lucide-react';
import type { Employee } from '@/lib/types';
import DocumentPanel from '@/components/DocumentPanel';
import { DOCUMENT_TYPES, DOCUMENT_LABELS, type DocumentType } from '@shared/document-types';

interface DocumentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  canManage: boolean;
}

export default function DocumentsModal({
  isOpen,
  onClose,
  employees,
  canManage,
}: DocumentsModalProps) {
  const [tab, setTab] = useState<DocumentType>('ara');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <FolderOpen className="text-orange shrink-0" size={21} />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-foreground truncate">Documentos</h2>
              <p className="text-xs text-muted-foreground truncate">
                {DOCUMENT_LABELS[tab].description}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={23} />
          </button>
        </div>

        {/* Abas em ordem alfabética */}
        <div className="flex gap-2 px-4 pt-3 pb-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {DOCUMENT_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setTab(type)}
              className={`shrink-0 px-3.5 py-2 rounded-lg text-sm font-semibold border transition ${
                tab === type
                  ? 'bg-navy text-white border-navy'
                  : 'bg-card text-muted-foreground border-border hover:border-muted-foreground/40'
              }`}
            >
              {DOCUMENT_LABELS[type].label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <DocumentPanel key={tab} type={tab} employees={employees} canManage={canManage} />
        </div>
      </div>
    </div>
  );
}
