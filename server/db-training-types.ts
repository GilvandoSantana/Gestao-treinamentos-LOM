/**
 * Catálogo de tipos de treinamento — nome + validade em meses. A data de
 * vencimento de um treinamento é sempre calculada a partir da validade
 * cadastrada aqui, nunca digitada à mão pelo usuário.
 */

import { eq } from "drizzle-orm";
import { trainingTypes } from "../drizzle/schema";
import { getDb } from "./db";

export interface TrainingTypeInfo {
  id: string;
  name: string;
  validityMonths: number;
}

export async function listTrainingTypes(): Promise<TrainingTypeInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(trainingTypes);
  return rows
    .map((r) => ({ id: r.id, name: r.name, validityMonths: r.validityMonths }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTrainingTypeByName(name: string): Promise<TrainingTypeInfo | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(trainingTypes).where(eq(trainingTypes.name, name));
  return rows[0] ? { id: rows[0].id, name: rows[0].name, validityMonths: rows[0].validityMonths } : undefined;
}

export async function createTrainingType(
  id: string,
  name: string,
  validityMonths: number
): Promise<TrainingTypeInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(trainingTypes).values({ id, name: name.trim(), validityMonths });
  return { id, name: name.trim(), validityMonths };
}

export async function updateTrainingType(id: string, name: string, validityMonths: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(trainingTypes).set({ name: name.trim(), validityMonths }).where(eq(trainingTypes.id, id));
}

export async function deleteTrainingType(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(trainingTypes).where(eq(trainingTypes.id, id));
}

/** Soma meses a uma data (AAAA-MM-DD) e devolve no mesmo formato. */
export function addMonthsToDate(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCMonth(date.getUTCMonth() + months);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
