/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseHelpPanel: guia rápido de cada aba do Almoxarifado.
 */

import {
  HelpCircle,
  Boxes,
  ArrowLeftRight,
  HandCoins,
  ShoppingCart,
  Bell,
  Users,
  Calendar,
  Database,
  Tag,
  BarChart3,
  History,
} from 'lucide-react';

const TOPICS = [
  {
    Icon: Boxes,
    title: 'Itens',
    text: 'Cadastre e edite os itens do estoque (EPI, ferramenta, equipamento, material). Defina um estoque mínimo para receber aviso quando estiver acabando.',
  },
  {
    Icon: ArrowLeftRight,
    title: 'Reposição de Estoque',
    text: 'Registre entrada de material — chegou item novo do fornecedor, aumenta a quantidade em estoque.',
  },
  {
    Icon: ArrowLeftRight,
    title: 'Saída / Entrega de Ferramentas',
    text: 'Uma única tela pra tirar qualquer coisa do estoque: material de consumo, EPI ou ferramenta, misturados no mesmo atendimento. Ferramenta vira empréstimo automaticamente (rastreado, com patrimônio, precisa devolver depois); o resto é baixa direta de estoque.',
  },
  {
    Icon: HandCoins,
    title: 'Devolução de Ferramentas',
    text: 'Feche o empréstimo de uma ferramenta ou EPI que foi entregue a um colaborador. O estoque volta sozinho.',
  },
  {
    Icon: Users,
    title: 'Ferramentas por Funcionário',
    text: 'Veja de uma vez só quem está com o quê no momento, sem precisar escolher um colaborador de cada vez.',
  },
  {
    Icon: ShoppingCart,
    title: 'Solicitações de Compra',
    text: 'Peça a compra de um ou vários itens de uma vez. Acompanhe o status (pendente → aprovada → em processo → concluída) ou cancele com um motivo.',
  },
  {
    Icon: Bell,
    title: 'Alertas',
    text: 'Estoque zerado ou abaixo do mínimo, e validade de CA (EPI) vencida ou vencendo — tudo num lugar só, calculado automaticamente.',
  },
  {
    Icon: Calendar,
    title: 'Histórico Diário',
    text: 'Todas as movimentações de um dia específico — o padrão é hoje, mas dá pra escolher outra data.',
  },
  {
    Icon: History,
    title: 'Histórico de Preços',
    text: 'Acompanhe como o preço de cada item mudou ao longo do tempo, com base nas entradas registradas.',
  },
  {
    Icon: BarChart3,
    title: 'Gráficos',
    text: 'Itens mais consumidos, tendência de gasto mês a mês, e saídas por dia — a visão de cima do que está acontecendo no estoque.',
  },
  {
    Icon: Tag,
    title: 'Etiquetas',
    text: 'Gere etiquetas com QR code para colar nos itens físicos — facilita encontrar e identificar depois.',
  },
  {
    Icon: Database,
    title: 'Backup',
    text: 'Baixe uma cópia de tudo (itens, movimentações, entregas, solicitações) em um arquivo — uma segurança extra, além do backup automático do sistema.',
  },
];

export default function WarehouseHelpPanel() {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
        <HelpCircle size={16} className="text-orange" />
        Um resumo rápido do que cada aba do Almoxarifado faz.
      </div>

      <div className="space-y-2">
        {TOPICS.map(({ Icon, title, text }) => (
          <div key={title} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/20">
            <span className="p-2 rounded-lg bg-orange/10 text-orange shrink-0">
              <Icon size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
