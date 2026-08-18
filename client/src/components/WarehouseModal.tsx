/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseModal: central do Almoxarifado — itens em estoque e
 * movimentações. Migrado de um sistema separado (Vercel + Supabase).
 */

import { useState } from 'react';
import { X, Warehouse, ArrowLeftRight } from 'lucide-react';
import WarehouseItemsPanel from '@/components/WarehouseItemsPanel';
import WarehouseMovementsPanel from '@/components/WarehouseMovementsPanel';

interface WarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  canManage: boolean;
}

type Tab = 'items' | 'movements';

export default function WarehouseModal({ isOpen, onClose, canManage }: WarehouseModalProps) {
  const [tab, setTab] = useState<Tab>('items');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <Warehouse className="text-orange shrink-0" size={21} />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-foreground truncate">Almoxarifado</h2>
              <p className="text-xs text-muted-foreground">Itens em estoque do contrato</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={23} />
          </button>
        </div>

        <div className="flex gap-2 px-4 pt-3">
          <button
            onClick={() => setTab('items')}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold border transition ${
              tab === 'items'
                ? 'bg-navy text-white border-navy'
                : 'bg-card text-muted-foreground border-border hover:border-muted-foreground/40'
            }`}
          >
            Itens
          </button>
          <button
            onClick={() => setTab('movements')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border transition ${
              tab === 'movements'
                ? 'bg-navy text-white border-navy'
                : 'bg-card text-muted-foreground border-border hover:border-muted-foreground/40'
            }`}
          >
            <ArrowLeftRight size={14} />
            Movimentações
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'items' ? (
            <WarehouseItemsPanel canManage={canManage} />
          ) : (
            <WarehouseMovementsPanel canManage={canManage} />
          )}
        </div>
      </div>
    </div>
  );
}
