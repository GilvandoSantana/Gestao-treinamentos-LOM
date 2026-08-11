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
