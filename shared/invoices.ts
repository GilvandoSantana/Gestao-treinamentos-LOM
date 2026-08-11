/**
 * Constantes do módulo de Notas Fiscais.
 */

export const INVOICE_DOC_TYPES = ['nota_fiscal', 'recibo'] as const;
export type InvoiceDocType = (typeof INVOICE_DOC_TYPES)[number];

export const INVOICE_DOC_TYPE_LABELS: Record<InvoiceDocType, string> = {
  nota_fiscal: 'Nota Fiscal',
  recibo: 'Recibo',
};

export const INVOICE_STATUSES = ['pendente', 'processado', 'confirmado'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  pendente: 'Pendente',
  processado: 'Processado',
  confirmado: 'Confirmado',
};

export const INVOICE_PAYMENT_METHODS = [
  'dinheiro',
  'pix',
  'cartao_credito',
  'cartao_debito',
  'boleto',
  'transferencia',
  'outro',
] as const;
export type InvoicePaymentMethod = (typeof INVOICE_PAYMENT_METHODS)[number];

export const INVOICE_PAYMENT_METHOD_LABELS: Record<InvoicePaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  outro: 'Outro',
};

export interface InvoiceProduct {
  name: string;
  qty: number;
  unit_price: number;
  total: number;
}

export function isInvoiceDocType(value: string): value is InvoiceDocType {
  return (INVOICE_DOC_TYPES as readonly string[]).includes(value);
}

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return (INVOICE_STATUSES as readonly string[]).includes(value);
}

/** Cores sugeridas para categorias — mesma paleta usada nos gráficos. */
export const INVOICE_CATEGORY_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#a855f7',
] as const;

/** Categorias padrão criadas automaticamente na primeira migração. */
export const DEFAULT_INVOICE_CATEGORIES: { name: string; color: string }[] = [
  { name: 'Combustível', color: '#f59e0b' },
  { name: 'Manutenção', color: '#ef4444' },
  { name: 'Escritório', color: '#3b82f6' },
  { name: 'Alimentação', color: '#10b981' },
  { name: 'Transporte', color: '#8b5cf6' },
  { name: 'Serviços', color: '#06b6d4' },
  { name: 'Equipamentos', color: '#f97316' },
  { name: 'Outros', color: '#64748b' },
];
