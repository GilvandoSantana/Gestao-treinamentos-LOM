/**
 * Almoxarifado — tipos compartilhados entre servidor e cliente.
 */

export const WAREHOUSE_ITEM_TYPES = [
  'epi',
  'ferramenta',
  'equipamento',
  'material_consumo',
  'material_limpeza',
  'gas',
  'material',
] as const;
export type WarehouseItemType = (typeof WAREHOUSE_ITEM_TYPES)[number];

export const WAREHOUSE_ITEM_TYPE_LABELS: Record<WarehouseItemType, string> = {
  epi: 'EPI',
  ferramenta: 'Ferramenta',
  equipamento: 'Equipamento',
  material_consumo: 'Material de Consumo',
  material_limpeza: 'Material de Limpeza',
  gas: 'Gás',
  material: 'Material',
};

export interface WarehouseItemInfo {
  id: string;
  contract: string;
  code: string;
  name: string;
  type: WarehouseItemType;
  unit: string;
  quantity: number;
  ca: string | null;
  dataValidadeCa: string | null;
  patrimonio: string | null;
  estoqueMinimo: number;
  estoqueSeguranca: number;
  localizacao: string | null;
  fornecedor: string | null;
  precoUnitario: number;
  dataValidade: string | null;
  createdAt: string;
  updatedAt: string;
}

export const WAREHOUSE_MOVEMENT_TYPES = ['entrada', 'saida'] as const;
export type WarehouseMovementType = (typeof WAREHOUSE_MOVEMENT_TYPES)[number];

export interface WarehouseMovementInfo {
  id: string;
  contract: string;
  itemId: string | null;
  itemCode: string;
  itemName: string;
  movementType: WarehouseMovementType;
  quantity: number;
  date: string;
  destination: string | null;
  responsible: string | null;
  invoiceNumber: string | null;
  purchaseOrder: string | null;
  supplier: string | null;
  unitPrice: number | null;
  notes: string | null;
  createdAt: string;
}

export interface ToolDeliveryInfo {
  id: string;
  contract: string;
  employeeId: string;
  employeeName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  status: 'entregue' | 'devolvido';
  obs: string | null;
  returnObs: string | null;
  deliveredBy: string | null;
  deliveredAt: string;
  returnedAt: string | null;
}

export const PURCHASE_REQUEST_PRIORITIES = ['baixa', 'normal', 'alta', 'urgente', 'emergencial'] as const;
export type PurchaseRequestPriority = (typeof PURCHASE_REQUEST_PRIORITIES)[number];
export const PURCHASE_REQUEST_PRIORITY_LABELS: Record<PurchaseRequestPriority, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
  emergencial: 'Emergencial',
};

export const PURCHASE_REQUEST_STATUSES = [
  'pendente',
  'aprovada',
  'em_processo',
  'concluida',
  'cancelada',
  'expirada',
] as const;
export type PurchaseRequestStatus = (typeof PURCHASE_REQUEST_STATUSES)[number];
export const PURCHASE_REQUEST_STATUS_LABELS: Record<PurchaseRequestStatus, string> = {
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  em_processo: 'Em Processo',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
};

/** Próximo status no fluxo normal — usado no botão "avançar". */
export const PURCHASE_REQUEST_NEXT_STATUS: Partial<Record<PurchaseRequestStatus, PurchaseRequestStatus>> = {
  pendente: 'aprovada',
  aprovada: 'em_processo',
  em_processo: 'concluida',
};

export interface PurchaseRequestItem {
  name: string;
  quantity: number;
  fornecedor?: string | null;
  priority: PurchaseRequestPriority;
}

export interface PurchaseRequestInfo {
  id: string;
  contract: string;
  registro: string;
  items: PurchaseRequestItem[];
  priority: PurchaseRequestPriority;
  status: PurchaseRequestStatus;
  cancelReason: string | null;
  requestedBy: string | null;
  createdAt: string;
  expiresAt: string | null;
}
