/**
 * Catálogo de funções personalizadas — compartilhado entre contratos.
 */

import { eq } from "drizzle-orm";
import { customRoles } from "../drizzle/schema";
import { getDb } from "./db";

export interface CustomRoleInfo {
  id: string;
  name: string;
}

export async function listCustomRoles(): Promise<CustomRoleInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(customRoles);
  return rows.map((r) => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function createCustomRole(id: string, name: string): Promise<CustomRoleInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(customRoles).values({ id, name: name.trim() });
  return { id, name: name.trim() };
}

export async function deleteCustomRole(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(customRoles).where(eq(customRoles.id, id));
}
