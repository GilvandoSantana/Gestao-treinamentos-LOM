/**
 * Almoxarifado — itens em estoque e movimentações, por contrato.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { warehouseItems, warehouseMovements } from "../drizzle/schema";
import { getDb } from "./db";
import type { WarehouseItemInfo, WarehouseItemType, WarehouseMovementInfo, WarehouseMovementType } from "@shared/warehouse";

function toItemInfo(row: typeof warehouseItems.$inferSelect): WarehouseItemInfo {
  return {
    id: row.id,
    contract: row.contract,
    code: row.code,
    name: row.name,
    type: row.type as WarehouseItemType,
    unit: row.unit,
    quantity: Number(row.quantity),
    marca: row.marca,
    modelo: row.modelo,
    categoria: row.categoria,
    observacoes: row.observacoes,
    ca: row.ca,
    dataValidadeCa: row.dataValidadeCa,
    tamanho: row.tamanho,
    periodicidadeTrocaMeses: row.periodicidadeTrocaMeses,
    patrimonio: row.patrimonio,
    numeroSerie: row.numeroSerie,
    dataAquisicao: row.dataAquisicao,
    estadoConservacao: row.estadoConservacao as WarehouseItemInfo['estadoConservacao'],
    estoqueMinimo: Number(row.estoqueMinimo),
    estoqueSeguranca: Number(row.estoqueSeguranca),
    estoqueMaximo: row.estoqueMaximo != null ? Number(row.estoqueMaximo) : null,
    localizacao: row.localizacao,
    fornecedor: row.fornecedor,
    precoUnitario: Number(row.precoUnitario),
    dataValidade: row.dataValidade,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMovementInfo(row: typeof warehouseMovements.$inferSelect): WarehouseMovementInfo {
  return {
    id: row.id,
    contract: row.contract,
    itemId: row.itemId,
    itemCode: row.itemCode,
    itemName: row.itemName,
    movementType: row.movementType as WarehouseMovementType,
    quantity: Number(row.quantity),
    date: row.date.toISOString(),
    destination: row.destination,
    responsible: row.responsible,
    invoiceNumber: row.invoiceNumber,
    purchaseOrder: row.purchaseOrder,
    supplier: row.supplier,
    unitPrice: row.unitPrice != null ? Number(row.unitPrice) : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listWarehouseItems(contract: string): Promise<WarehouseItemInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(warehouseItems).where(eq(warehouseItems.contract, contract));
  return rows.map(toItemInfo).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getWarehouseItemById(id: string): Promise<WarehouseItemInfo | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(warehouseItems).where(eq(warehouseItems.id, id));
  return rows[0] ? toItemInfo(rows[0]) : undefined;
}

export interface WarehouseItemInput {
  code: string;
  name: string;
  type: WarehouseItemType;
  unit: string;
  quantity: number;
  marca?: string | null;
  modelo?: string | null;
  categoria?: string | null;
  observacoes?: string | null;
  ca?: string | null;
  dataValidadeCa?: string | null;
  tamanho?: string | null;
  periodicidadeTrocaMeses?: number | null;
  patrimonio?: string | null;
  numeroSerie?: string | null;
  dataAquisicao?: string | null;
  estadoConservacao?: WarehouseItemInfo['estadoConservacao'];
  estoqueMinimo: number;
  estoqueMaximo?: number | null;
  localizacao?: string | null;
  fornecedor?: string | null;
  precoUnitario: number;
  dataValidade?: string | null;
}

export async function createWarehouseItem(
  id: string,
  contract: string,
  input: WarehouseItemInput
): Promise<WarehouseItemInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Estoque de segurança é sempre 20% acima do mínimo — regra herdada do
  // sistema original, recalculada a cada gravação (não é editável direto).
  const estoqueSeguranca = input.estoqueMinimo * 1.2;

  await db.insert(warehouseItems).values({
    id,
    contract,
    code: input.code.trim(),
    name: input.name.trim(),
    type: input.type,
    unit: input.unit.trim() || "un",
    quantity: String(input.quantity),
    marca: input.marca?.trim() || null,
    modelo: input.modelo?.trim() || null,
    categoria: input.categoria?.trim() || null,
    observacoes: input.observacoes?.trim() || null,
    ca: input.ca?.trim() || null,
    dataValidadeCa: input.dataValidadeCa || null,
    tamanho: input.tamanho?.trim() || null,
    periodicidadeTrocaMeses: input.periodicidadeTrocaMeses ?? null,
    patrimonio: input.patrimonio?.trim() || null,
    numeroSerie: input.numeroSerie?.trim() || null,
    dataAquisicao: input.dataAquisicao || null,
    estadoConservacao: input.estadoConservacao || null,
    estoqueMinimo: String(input.estoqueMinimo),
    estoqueSeguranca: String(estoqueSeguranca),
    estoqueMaximo: input.estoqueMaximo != null ? String(input.estoqueMaximo) : null,
    localizacao: input.localizacao?.trim() || null,
    fornecedor: input.fornecedor?.trim() || null,
    precoUnitario: String(input.precoUnitario),
    dataValidade: input.dataValidade || null,
  });

  const created = await getWarehouseItemById(id);
  if (!created) throw new Error("Failed to read back created item");
  return created;
}

export async function updateWarehouseItem(
  id: string,
  contract: string,
  input: WarehouseItemInput
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const estoqueSeguranca = input.estoqueMinimo * 1.2;

  await db
    .update(warehouseItems)
    .set({
      code: input.code.trim(),
      name: input.name.trim(),
      type: input.type,
      unit: input.unit.trim() || "un",
      marca: input.marca?.trim() || null,
      modelo: input.modelo?.trim() || null,
      categoria: input.categoria?.trim() || null,
      observacoes: input.observacoes?.trim() || null,
      ca: input.ca?.trim() || null,
      dataValidadeCa: input.dataValidadeCa || null,
      tamanho: input.tamanho?.trim() || null,
      periodicidadeTrocaMeses: input.periodicidadeTrocaMeses ?? null,
      patrimonio: input.patrimonio?.trim() || null,
      numeroSerie: input.numeroSerie?.trim() || null,
      dataAquisicao: input.dataAquisicao || null,
      estadoConservacao: input.estadoConservacao || null,
      estoqueMinimo: String(input.estoqueMinimo),
      estoqueSeguranca: String(estoqueSeguranca),
      estoqueMaximo: input.estoqueMaximo != null ? String(input.estoqueMaximo) : null,
      localizacao: input.localizacao?.trim() || null,
      fornecedor: input.fornecedor?.trim() || null,
      precoUnitario: String(input.precoUnitario),
      dataValidade: input.dataValidade || null,
    })
    .where(and(eq(warehouseItems.id, id), eq(warehouseItems.contract, contract)));
}

export async function deleteWarehouseItem(id: string, contract: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(warehouseItems).where(and(eq(warehouseItems.id, id), eq(warehouseItems.contract, contract)));
}

export type StockTransaction = Parameters<Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>['transaction']>[0]>[0];

export async function lockWarehouseItem(tx: StockTransaction, id: string, contract: string) {
  const rows = await tx.select().from(warehouseItems)
    .where(and(eq(warehouseItems.id, id), eq(warehouseItems.contract, contract))).for('update');
  if (!rows[0]) throw new Error("Item não encontrado neste contrato.");
  return toItemInfo(rows[0]);
}

export function validateStockQuantity(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 9999999999.99 || Math.abs(quantity * 100 - Math.round(quantity * 100)) > 0.0001) {
    throw new Error("Quantidade inválida.");
  }
}

export async function adjustWarehouseItemQuantity(tx: StockTransaction, id: string, contract: string, delta: number): Promise<void> {
  validateStockQuantity(Math.abs(delta));
  const item = await lockWarehouseItem(tx, id, contract);
  if (item.quantity + delta < 0) throw new Error("Estoque insuficiente.");
  await tx.update(warehouseItems).set({ quantity: sql`${warehouseItems.quantity} + ${delta}` })
    .where(and(eq(warehouseItems.id, id), eq(warehouseItems.contract, contract)));
}

// ---------------------------------------------------------------------
// Movimentações
// ---------------------------------------------------------------------

export async function listWarehouseMovements(contract: string, limit = 200): Promise<WarehouseMovementInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(warehouseMovements)
    .where(eq(warehouseMovements.contract, contract))
    .orderBy(desc(warehouseMovements.date))
    .limit(limit);
  return rows.map(toMovementInfo);
}

export interface WarehouseMovementInput {
  itemId: string;
  movementType: WarehouseMovementType;
  quantity: number;
  destination?: string | null;
  responsible?: string | null;
  invoiceNumber?: string | null;
  purchaseOrder?: string | null;
  supplier?: string | null;
  unitPrice?: number | null;
  notes?: string | null;
}

export async function createWarehouseMovement(
  id: string,
  contract: string,
  input: WarehouseMovementInput
): Promise<WarehouseMovementInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  validateStockQuantity(input.quantity);
  return db.transaction(async tx => {
  const item = await lockWarehouseItem(tx, input.itemId, contract);
  if (!item || item.contract !== contract) {
    throw new Error("Item não encontrado neste contrato");
  }

  if (input.movementType === "saida" && item.quantity < input.quantity) {
    throw new Error(`Estoque insuficiente: há apenas ${item.quantity} ${item.unit} disponível.`);
  }

  await tx.insert(warehouseMovements).values({
    id,
    contract,
    itemId: item.id,
    itemCode: item.code,
    itemName: item.name,
    movementType: input.movementType,
    quantity: String(input.quantity),
    destination: input.destination?.trim() || null,
    responsible: input.responsible?.trim() || null,
    invoiceNumber: input.invoiceNumber?.trim() || null,
    purchaseOrder: input.purchaseOrder?.trim() || null,
    supplier: input.supplier?.trim() || null,
    unitPrice: input.unitPrice != null ? String(input.unitPrice) : null,
    notes: input.notes?.trim() || null,
  });

  const delta = input.movementType === "entrada" ? input.quantity : -input.quantity;
  await adjustWarehouseItemQuantity(tx, item.id, contract, delta);

  const rows = await tx.select().from(warehouseMovements).where(eq(warehouseMovements.id, id));
  return toMovementInfo(rows[0]);
  });
}

// ---------------------------------------------------------------------
// Histórico de preços — cada entrada com preço registrado vira um ponto no
// histórico do item. Diferente do sistema original (que só mostrava o
// preço atual, sem historico de verdade), aqui usa as entradas reais.
// ---------------------------------------------------------------------

export interface PriceHistoryPoint {
  date: string;
  unitPrice: number;
  quantity: number;
  supplier: string | null;
  invoiceNumber: string | null;
}

export interface ItemPriceHistory {
  itemId: string;
  itemCode: string;
  itemName: string;
  currentPrice: number;
  history: PriceHistoryPoint[];
}

export async function getPriceHistory(contract: string): Promise<ItemPriceHistory[]> {
  const db = await getDb();
  if (!db) return [];

  const items = await listWarehouseItems(contract);
  const movements = await db
    .select()
    .from(warehouseMovements)
    .where(and(eq(warehouseMovements.contract, contract), eq(warehouseMovements.movementType, "entrada")))
    .orderBy(desc(warehouseMovements.date));

  const byItem = new Map<string, PriceHistoryPoint[]>();
  for (const m of movements) {
    if (!m.itemId || m.unitPrice == null) continue;
    const list = byItem.get(m.itemId) ?? [];
    list.push({
      date: m.date.toISOString(),
      unitPrice: Number(m.unitPrice),
      quantity: Number(m.quantity),
      supplier: m.supplier,
      invoiceNumber: m.invoiceNumber,
    });
    byItem.set(m.itemId, list);
  }

  const result: ItemPriceHistory[] = [];
  for (const item of items) {
    const history = byItem.get(item.id);
    if (!history || history.length === 0) continue;
    result.push({
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      currentPrice: item.precoUnitario,
      // Mais antigo primeiro, pra mostrar a evolução na ordem certa.
      history: [...history].reverse(),
    });
  }

  return result.sort((a, b) => a.itemName.localeCompare(b.itemName));
}

