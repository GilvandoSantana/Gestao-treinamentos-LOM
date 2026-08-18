/**
 * Almoxarifado — solicitações de compra.
 */

import { eq, and, desc } from "drizzle-orm";
import { purchaseRequests } from "../drizzle/schema";
import { getDb } from "./db";
import type {
  PurchaseRequestInfo,
  PurchaseRequestItem,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
} from "@shared/warehouse";

function toInfo(row: typeof purchaseRequests.$inferSelect): PurchaseRequestInfo {
  let items: PurchaseRequestItem[] = [];
  try {
    const parsed = JSON.parse(row.items);
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    items = [];
  }
  return {
    id: row.id,
    contract: row.contract,
    registro: row.registro,
    items,
    priority: row.priority as PurchaseRequestPriority,
    status: row.status as PurchaseRequestStatus,
    cancelReason: row.cancelReason,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

/** Lista e, de quebra, marca como "expirada" quem passou do prazo ainda pendente. */
export async function listPurchaseRequests(contract: string): Promise<PurchaseRequestInfo[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(purchaseRequests)
    .where(eq(purchaseRequests.contract, contract))
    .orderBy(desc(purchaseRequests.createdAt));

  const now = new Date();
  const expiredIds = rows
    .filter((r) => r.status === "pendente" && r.expiresAt && r.expiresAt < now)
    .map((r) => r.id);

  if (expiredIds.length > 0) {
    for (const id of expiredIds) {
      await db.update(purchaseRequests).set({ status: "expirada" }).where(eq(purchaseRequests.id, id));
    }
    // Reflete a mudança no que será devolvido, sem precisar reconsultar tudo.
    for (const r of rows) {
      if (expiredIds.includes(r.id)) r.status = "expirada";
    }
  }

  return rows.map(toInfo);
}

async function generateRegistro(contract: string): Promise<string> {
  const db = await getDb();
  if (!db) return "SC-0001";
  const rows = await db
    .select({ registro: purchaseRequests.registro })
    .from(purchaseRequests)
    .where(eq(purchaseRequests.contract, contract));
  let max = 0;
  for (const r of rows) {
    const match = r.registro.match(/^SC-(\d+)$/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `SC-${String(max + 1).padStart(4, "0")}`;
}

export async function createPurchaseRequest(
  id: string,
  contract: string,
  items: PurchaseRequestItem[],
  requestedBy: string | null
): Promise<PurchaseRequestInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const priorityOrder: Record<PurchaseRequestPriority, number> = {
    emergencial: 5,
    urgente: 4,
    alta: 3,
    normal: 2,
    baixa: 1,
  };
  const topPriority = items.reduce<PurchaseRequestPriority>((best, it) => {
    return priorityOrder[it.priority] > priorityOrder[best] ? it.priority : best;
  }, "normal");

  const registro = await generateRegistro(contract);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(purchaseRequests).values({
    id,
    contract,
    registro,
    items: JSON.stringify(items),
    priority: topPriority,
    status: "pendente",
    requestedBy,
    expiresAt,
  });

  const rows = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, id));
  return toInfo(rows[0]);
}

export async function updatePurchaseRequestStatus(
  id: string,
  contract: string,
  status: PurchaseRequestStatus
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(purchaseRequests)
    .set({ status })
    .where(and(eq(purchaseRequests.id, id), eq(purchaseRequests.contract, contract)));
}

export async function cancelPurchaseRequest(id: string, contract: string, reason: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(purchaseRequests)
    .set({ status: "cancelada", cancelReason: reason.trim() || null })
    .where(and(eq(purchaseRequests.id, id), eq(purchaseRequests.contract, contract)));
}

export async function deletePurchaseRequest(id: string, contract: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(purchaseRequests)
    .where(and(eq(purchaseRequests.id, id), eq(purchaseRequests.contract, contract)));
}
