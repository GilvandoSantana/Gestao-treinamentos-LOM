/**
 * Database helpers para configurações do módulo de Notas Fiscais, por
 * contrato — hoje só o limite de gastos mensais (tela de Alertas).
 */

import { eq } from "drizzle-orm";
import { invoiceSettings } from "../drizzle/schema";
import { getDb } from "./db";

const DEFAULT_MONTHLY_LIMIT = 5000;

export async function getInvoiceMonthlyLimit(contract: string): Promise<number> {
  const db = await getDb();
  if (!db) return DEFAULT_MONTHLY_LIMIT;
  try {
    const rows = await db.select().from(invoiceSettings).where(eq(invoiceSettings.contract, contract));
    if (!rows[0]) return DEFAULT_MONTHLY_LIMIT;
    return Number(rows[0].monthlyLimit ?? DEFAULT_MONTHLY_LIMIT);
  } catch (error) {
    console.error("[InvoiceSettings] Falha ao buscar limite mensal:", error);
    return DEFAULT_MONTHLY_LIMIT;
  }
}

export async function setInvoiceMonthlyLimit(contract: string, value: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(invoiceSettings)
    .values({ contract, monthlyLimit: String(value) })
    .onDuplicateKeyUpdate({ set: { monthlyLimit: String(value) } });
}
