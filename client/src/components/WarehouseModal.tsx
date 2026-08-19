/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseModal: central do Almoxarifado — itens em estoque e
 * movimentações. Migrado de um sistema separado (Vercel + Supabase).
 *
 * Tela quase em tela cheia, diferente dos outros modais do sistema — é um
 * programa completo por si só (itens, movimentações, e mais abas por vir),
 * não cabe numa caixinha pequena.
 */

import { useState } from 'react';
import { X, Warehouse, Boxes, ArrowLeftRight, HandCoins, ShoppingCart, Bell, LineChart, Tag } from 'lucide-react';
import WarehouseItemsPanel from '@/components/WarehouseItemsPanel';
import WarehouseMovementsPanel from '@/components/WarehouseMovementsPanel';
import WarehouseDeliveryPanel from '@/components/WarehouseDeliveryPanel';
import WarehousePurchaseRequestsPanel from '@/components/WarehousePurchaseRequestsPanel';
import WarehouseAlertsPanel from '@/components/WarehouseAlertsPanel';
import WarehousePriceHistoryPanel from '@/components/WarehousePriceHistoryPanel';
import WarehouseLabelsPanel from '@/components/WarehouseLabelsPanel';

interface WarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  canManage: boolean;
}

type Tab = 'items' | 'movements' | 'delivery' | 'purchases' | 'alerts' | 'prices' | 'labels';

const TABS: { key: Tab; label: string; Icon: typeof Boxes }[] = [
  { key: 'items', label: 'Itens', Icon: Boxes },
  { key: 'movements', label: 'Movimentações', Icon: ArrowLeftRight },
  { key: 'delivery', label: 'Entrega/Devolução', Icon: HandCoins },
  { key: 'purchases', label: 'Solicitações de Compra', Icon: ShoppingCart },
  { key: 'alerts', label: 'Alertas', Icon: Bell },
  { key: 'prices', label: 'Histórico de Preços', Icon: LineChart },
  { key: 'labels', label: 'Etiquetas', Icon: Tag },
];

export default function WarehouseModal({ isOpen, onClose, canManage }: WarehouseModalProps) {
  const [tab, setTab] = useState<Tab>('items');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full h-full sm:h-[94vh] max-w-6xl flex flex-col sm:flex-row overflow-hidden">
        {/* Cabeçalho — só no celular, a versão desktop fica dentro do painel lateral */}
        <div className="sm:hidden flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Warehouse className="text-orange shrink-0" size={19} />
            <h2 className="font-display text-base font-bold text-foreground truncate">Almoxarifado</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={22} />
          </button>
        </div>

        {/* Barra lateral de navegação — vira barra de abas horizontal no celular */}
        <div className="flex sm:flex-col sm:w-56 shrink-0 bg-navy sm:bg-navy/95 text-white">
          <div className="hidden sm:flex items-center gap-2.5 p-5 border-b border-white/10">
            <Warehouse className="text-orange shrink-0" size={22} />
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold leading-tight">Almoxarifado</h2>
              <p className="text-[11px] text-white/60">Itens do contrato</p>
            </div>
          </div>
          <div className="flex sm:flex-col flex-1 p-2 gap-1 overflow-x-auto">
            {TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition ${
                  tab === key ? 'bg-orange text-white' : 'text-white/70 hover:bg-white/10'
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="hidden sm:flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <h3 className="font-display text-lg font-bold text-foreground">
              {TABS.find((t) => t.key === tab)?.label}
            </h3>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X size={23} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {tab === 'items' ? (
              <WarehouseItemsPanel canManage={canManage} />
            ) : tab === 'movements' ? (
              <WarehouseMovementsPanel canManage={canManage} />
            ) : tab === 'delivery' ? (
              <WarehouseDeliveryPanel canManage={canManage} />
            ) : tab === 'purchases' ? (
              <WarehousePurchaseRequestsPanel canManage={canManage} />
            ) : tab === 'alerts' ? (
              <WarehouseAlertsPanel />
            ) : tab === 'prices' ? (
              <WarehousePriceHistoryPanel />
            ) : (
              <WarehouseLabelsPanel />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
