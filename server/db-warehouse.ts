/**
 * Almoxarifado — itens em estoque e movimentações, por contrato.
 */

import { eq, and, desc } from "drizzle-orm";
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
    ca: row.ca,
    dataValidadeCa: row.dataValidadeCa,
    patrimonio: row.patrimonio,
    estoqueMinimo: Number(row.estoqueMinimo),
    estoqueSeguranca: Number(row.estoqueSeguranca),
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
  ca?: string | null;
  dataValidadeCa?: string | null;
  patrimonio?: string | null;
  estoqueMinimo: number;
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
    ca: input.ca?.trim() || null,
    dataValidadeCa: input.dataValidadeCa || null,
    patrimonio: input.patrimonio?.trim() || null,
    estoqueMinimo: String(input.estoqueMinimo),
    estoqueSeguranca: String(estoqueSeguranca),
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
      quantity: String(input.quantity),
      ca: input.ca?.trim() || null,
      dataValidadeCa: input.dataValidadeCa || null,
      patrimonio: input.patrimonio?.trim() || null,
      estoqueMinimo: String(input.estoqueMinimo),
      estoqueSeguranca: String(estoqueSeguranca),
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

export async function adjustWarehouseItemQuantity(id: string, delta: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const item = await getWarehouseItemById(id);
  if (!item) return;
  const newQuantity = Math.max(0, item.quantity + delta);
  await db.update(warehouseItems).set({ quantity: String(newQuantity) }).where(eq(warehouseItems.id, id));
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

  const item = await getWarehouseItemById(input.itemId);
  if (!item || item.contract !== contract) {
    throw new Error("Item não encontrado neste contrato");
  }

  if (input.movementType === "saida" && item.quantity < input.quantity) {
    throw new Error(`Estoque insuficiente: há apenas ${item.quantity} ${item.unit} disponível.`);
  }

  await db.insert(warehouseMovements).values({
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
  await adjustWarehouseItemQuantity(item.id, delta);

  const rows = await db.select().from(warehouseMovements).where(eq(warehouseMovements.id, id));
  return toMovementInfo(rows[0]);
}
