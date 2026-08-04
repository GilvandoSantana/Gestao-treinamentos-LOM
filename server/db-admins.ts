/**
 * Database helpers for named admin accounts
 */

import { eq } from "drizzle-orm";
import { admins, type Admin } from "../drizzle/schema";
import { getDb } from "./db";

export type PublicAdmin = Pick<Admin, "id" | "username" | "createdAt">;

export async function listAdmins(): Promise<PublicAdmin[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({ id: admins.id, username: admins.username, createdAt: admins.createdAt })
    .from(admins);

  return rows.sort((a, b) => a.username.localeCompare(b.username));
}

export async function countAdmins(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: admins.id }).from(admins);
  return rows.length;
}

export async function getAdminByUsername(username: string): Promise<Admin | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(admins)
    .where(eq(admins.username, username.trim().toLowerCase()));

  return rows[0];
}

export async function createAdmin(input: {
  id: string;
  username: string;
  passwordHash: string;
}): Promise<PublicAdmin> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalizedUsername = input.username.trim().toLowerCase();

  await db.insert(admins).values({
    id: input.id,
    username: normalizedUsername,
    passwordHash: input.passwordHash,
  });

  return { id: input.id, username: normalizedUsername, createdAt: new Date() };
}

export async function deleteAdmin(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(admins).where(eq(admins.id, id));
}
