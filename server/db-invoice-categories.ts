/**
 * Database helpers para categorias de Nota Fiscal.
 */

import { eq } from "drizzle-orm";
import { invoiceCategories, type InvoiceCategoryRow } from "../drizzle/schema";
import { getDb } from "./db";

export type PublicInvoiceCategory = {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
};

function toPublic(row: InvoiceCategoryRow): PublicInvoiceCategory {
  return { id: row.id, name: row.name, color: row.color, isDefault: row.isDefault };
}

export async function listInvoiceCategories(): Promise<PublicInvoiceCategory[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.select().from(invoiceCategories);
    return rows.map(toPublic).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  } catch (error) {
    console.error("[InvoiceCategories] Falha ao listar categorias:", error);
    return [];
  }
}

export async function getInvoiceCategoryById(id: string): Promise<PublicInvoiceCategory | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(invoiceCategories).where(eq(invoiceCategories.id, id));
  return rows[0] ? toPublic(rows[0]) : undefined;
}

export async function createInvoiceCategory(input: {
  id: string;
  name: string;
  color: string;
}): Promise<PublicInvoiceCategory> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(invoiceCategories).values({
    id: input.id,
    name: input.name,
    color: input.color,
    isDefault: false,
  });
  return { id: input.id, name: input.name, color: input.color, isDefault: false };
}

export async function updateInvoiceCategory(id: string, input: { name: string; color: string }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(invoiceCategories).set({ name: input.name, color: input.color }).where(eq(invoiceCategories.id, id));
}

export async function deleteInvoiceCategory(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(invoiceCategories).where(eq(invoiceCategories.id, id));
}
