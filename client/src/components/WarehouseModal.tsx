/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseModal: central do Almoxarifado — itens em estoque e
 * movimentações. Migrado de um sistema separado (Vercel + Supabase).
 *
 * Tela quase em tela cheia, diferente dos outros modais do sistema — é um
 * programa completo por si só, não cabe numa caixinha pequena.
 */

import { useState } from 'react';
import {
  X,
  Warehouse,
  Boxes,
  ArrowUpCircle,
  ArrowDownCircle,
  Wrench,
  Users,
  RotateCcw,
  ShoppingCart,
  Bell,
  Calendar,
  FileBarChart,
  BarChart3,
  LineChart,
  PieChart,
  Tag,
  Database,
  HelpCircle,
} from 'lucide-react';
import WarehouseItemsPanel from '@/components/WarehouseItemsPanel';
import WarehouseMovementsPanel from '@/components/WarehouseMovementsPanel';
import WarehouseDeliveryPanel from '@/components/WarehouseDeliveryPanel';
import WarehouseToolsByEmployeePanel from '@/components/WarehouseToolsByEmployeePanel';
import WarehousePurchaseRequestsPanel from '@/components/WarehousePurchaseRequestsPanel';
import WarehouseAlertsPanel from '@/components/WarehouseAlertsPanel';
import WarehouseDailyHistoryPanel from '@/components/WarehouseDailyHistoryPanel';
import WarehouseMonthlyReportPanel from '@/components/WarehouseMonthlyReportPanel';
import WarehouseStatisticsPanel from '@/components/WarehouseStatisticsPanel';
import WarehousePriceHistoryPanel from '@/components/WarehousePriceHistoryPanel';
import WarehouseLabelsPanel from '@/components/WarehouseLabelsPanel';
import WarehouseChartsPanel from '@/components/WarehouseChartsPanel';
import WarehouseBackupPanel from '@/components/WarehouseBackupPanel';
import WarehouseHelpPanel from '@/components/WarehouseHelpPanel';

interface WarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  canManage: boolean;
  isMasterAdmin?: boolean;
}

type Tab =
  | 'items'
  | 'stockOut'
  | 'stockIn'
  | 'purchases'
  | 'alerts'
  | 'deliver'
  | 'toolsByEmployee'
  | 'return'
  | 'dailyHistory'
  | 'monthlyReport'
  | 'statistics'
  | 'prices'
  | 'charts'
  | 'labels'
  | 'backup'
  | 'help';

interface TabDef {
  key: Tab;
  label: string;
  Icon: typeof Boxes;
}

// Mesma organização em seções do menu do sistema original (Estoque /
// Ferramentas / Relatórios / Configurações), pra ficar reconhecível.
const SECTIONS: { title: string; tabs: TabDef[] }[] = [
  {
    title: 'Estoque',
    tabs: [
      { key: 'items', label: 'Controle de Estoque', Icon: Boxes },
      { key: 'stockOut', label: 'Saída de Material', Icon: ArrowUpCircle },
      { key: 'stockIn', label: 'Reposição de Estoque', Icon: ArrowDownCircle },
      { key: 'purchases', label: 'Solicitações de Compra', Icon: ShoppingCart },
      { key: 'alerts', label: 'Alertas', Icon: Bell },
    ],
  },
  {
    title: 'Ferramentas',
    tabs: [
      { key: 'deliver', label: 'Entrega de Ferramentas', Icon: Wrench },
      { key: 'toolsByEmployee', label: 'Ferramentas por Funcionário', Icon: Users },
      { key: 'return', label: 'Devolução de Ferramentas', Icon: RotateCcw },
    ],
  },
  {
    title: 'Relatórios',
    tabs: [
      { key: 'dailyHistory', label: 'Histórico Diário', Icon: Calendar },
      { key: 'monthlyReport', label: 'Relatório Mensal', Icon: FileBarChart },
      { key: 'statistics', label: 'Estatísticas', Icon: BarChart3 },
      { key: 'prices', label: 'Histórico de Preços', Icon: LineChart },
      { key: 'charts', label: 'Gráficos', Icon: PieChart },
    ],
  },
  {
    title: 'Configurações',
    tabs: [
      { key: 'labels', label: 'Etiquetas', Icon: Tag },
      { key: 'backup', label: 'Backup', Icon: Database },
      { key: 'help', label: 'Ajuda', Icon: HelpCircle },
    ],
  },
];

const ALL_TABS: TabDef[] = SECTIONS.flatMap((s) => s.tabs);

export default function WarehouseModal({ isOpen, onClose, canManage, isMasterAdmin }: WarehouseModalProps) {
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
        <div className="flex sm:flex-col sm:w-64 shrink-0 bg-navy sm:bg-navy/95 text-white">
          <div className="hidden sm:flex items-center gap-2.5 p-5 border-b border-white/10">
            <Warehouse className="text-orange shrink-0" size={22} />
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold leading-tight">Almoxarifado</h2>
              <p className="text-[11px] text-white/60">Itens do contrato</p>
            </div>
          </div>

          <div className="flex sm:flex-col flex-1 p-2 gap-1 overflow-x-auto sm:overflow-y-auto">
            {SECTIONS.map((section) => (
              <div key={section.title} className="sm:mb-1">
                <p className="hidden sm:block px-3 pt-2 pb-1 text-[10px] font-technical uppercase tracking-wider text-white/40">
                  {section.title}
                </p>
                <div className="flex sm:flex-col gap-1">
                  {section.tabs.map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      onClick={() => setTab(key)}
                      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition shrink-0 ${
                        tab === key ? 'bg-orange text-white' : 'text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="hidden sm:flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <h3 className="font-display text-lg font-bold text-foreground">
              {ALL_TABS.find((t) => t.key === tab)?.label}
            </h3>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X size={23} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {tab === 'items' && <WarehouseItemsPanel canManage={canManage} isMasterAdmin={isMasterAdmin} />}
            {tab === 'stockOut' && <WarehouseMovementsPanel canManage={canManage} fixedType="saida" />}
            {tab === 'stockIn' && <WarehouseMovementsPanel canManage={canManage} fixedType="entrada" />}
            {tab === 'purchases' && <WarehousePurchaseRequestsPanel canManage={canManage} />}
            {tab === 'alerts' && <WarehouseAlertsPanel />}
            {tab === 'deliver' && <WarehouseDeliveryPanel canManage={canManage} fixedMode="deliver" />}
            {tab === 'toolsByEmployee' && <WarehouseToolsByEmployeePanel />}
            {tab === 'return' && <WarehouseDeliveryPanel canManage={canManage} fixedMode="return" />}
            {tab === 'dailyHistory' && <WarehouseDailyHistoryPanel />}
            {tab === 'monthlyReport' && <WarehouseMonthlyReportPanel />}
            {tab === 'statistics' && <WarehouseStatisticsPanel />}
            {tab === 'prices' && <WarehousePriceHistoryPanel />}
            {tab === 'charts' && <WarehouseChartsPanel />}
            {tab === 'labels' && <WarehouseLabelsPanel />}
            {tab === 'backup' && <WarehouseBackupPanel />}
            {tab === 'help' && <WarehouseHelpPanel />}
          </div>
        </div>
      </div>
    </div>
  );
}
