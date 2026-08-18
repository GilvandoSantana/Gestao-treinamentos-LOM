/**
 * Almoxarifado — entrega e devolução de ferramentas/EPIs para colaboradores.
 */

import { eq, and, desc } from "drizzle-orm";
import { toolDeliveries } from "../drizzle/schema";
import { getDb } from "./db";
import { getWarehouseItemById, adjustWarehouseItemQuantity } from "./db-warehouse";

export interface ToolDeliveryInfo {
  id: string;
  contract: string;
  employeeId: string;
  employeeName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  status: "entregue" | "devolvido";
  obs: string | null;
  returnObs: string | null;
  deliveredBy: string | null;
  deliveredAt: string;
  returnedAt: string | null;
}

function toInfo(row: typeof toolDeliveries.$inferSelect): ToolDeliveryInfo {
  return {
    id: row.id,
    contract: row.contract,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    itemId: row.itemId,
    itemCode: row.itemCode,
    itemName: row.itemName,
    quantity: Number(row.quantity),
    status: row.status as "entregue" | "devolvido",
    obs: row.obs,
    returnObs: row.returnObs,
    deliveredBy: row.deliveredBy,
    deliveredAt: row.deliveredAt.toISOString(),
    returnedAt: row.returnedAt ? row.returnedAt.toISOString() : null,
  };
}

export async function listToolDeliveries(contract: string, limit = 300): Promise<ToolDeliveryInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(toolDeliveries)
    .where(eq(toolDeliveries.contract, contract))
    .orderBy(desc(toolDeliveries.deliveredAt))
    .limit(limit);
  return rows.map(toInfo);
}

/** Ferramentas que um colaborador tem em mãos agora (ainda não devolveu). */
export async function listActiveDeliveriesForEmployee(
  contract: string,
  employeeId: string
): Promise<ToolDeliveryInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(toolDeliveries)
    .where(
      and(
        eq(toolDeliveries.contract, contract),
        eq(toolDeliveries.employeeId, employeeId),
        eq(toolDeliveries.status, "entregue")
      )
    )
    .orderBy(desc(toolDeliveries.deliveredAt));
  return rows.map(toInfo);
}

export async function createToolDelivery(
  id: string,
  contract: string,
  input: {
    employeeId: string;
    employeeName: string;
    itemId: string;
    quantity: number;
    obs?: string | null;
    deliveredBy?: string | null;
  }
): Promise<ToolDeliveryInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const item = await getWarehouseItemById(input.itemId);
  if (!item || item.contract !== contract) {
    throw new Error("Item não encontrado neste contrato.");
  }
  if (item.quantity < input.quantity) {
    throw new Error(`Estoque insuficiente: há apenas ${item.quantity} ${item.unit} disponível.`);
  }

  await db.insert(toolDeliveries).values({
    id,
    contract,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    itemId: item.id,
    itemCode: item.code,
    itemName: item.name,
    quantity: String(input.quantity),
    status: "entregue",
    obs: input.obs?.trim() || null,
    deliveredBy: input.deliveredBy || null,
  });

  await adjustWarehouseItemQuantity(item.id, -input.quantity);

  const rows = await db.select().from(toolDeliveries).where(eq(toolDeliveries.id, id));
  return toInfo(rows[0]);
}

export async function returnToolDelivery(
  id: string,
  contract: string,
  returnObs?: string | null
): Promise<ToolDeliveryInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select()
    .from(toolDeliveries)
    .where(and(eq(toolDeliveries.id, id), eq(toolDeliveries.contract, contract)));
  const delivery = rows[0];
  if (!delivery) throw new Error("Entrega não encontrada.");
  if (delivery.status === "devolvido") throw new Error("Este item já foi devolvido.");

  await db
    .update(toolDeliveries)
    .set({
      status: "devolvido",
      returnObs: returnObs?.trim() || null,
      returnedAt: new Date(),
    })
    .where(eq(toolDeliveries.id, id));

  await adjustWarehouseItemQuantity(delivery.itemId, Number(delivery.quantity));

  const updated = await db.select().from(toolDeliveries).where(eq(toolDeliveries.id, id));
  return toInfo(updated[0]);
}
