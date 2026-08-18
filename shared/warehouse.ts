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
