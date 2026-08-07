/**
 * Database helpers for named admin/user accounts
 */

import { eq } from "drizzle-orm";
import { admins, type Admin } from "../drizzle/schema";
import { getDb } from "./db";
import { DEFAULT_CONTRACT_SLUG } from "@shared/contracts";
import {
  normalizePermissions,
  DEFAULT_USER_PERMISSIONS,
  type Permissions,
  type SiteRole,
} from "@shared/permissions";

export type PublicAdmin = {
  id: string;
  username: string;
  contract: string;
  role: SiteRole;
  permissions: Permissions;
  createdAt: Date;
};

function toPublic(row: Admin): PublicAdmin {
  const role = (row.role === "admin" ? "admin" : "user") as SiteRole;
  return {
    id: row.id,
    username: row.username,
    contract: row.contract || DEFAULT_CONTRACT_SLUG,
    role,
    permissions: normalizePermissions(row.permissions, role),
    createdAt: row.createdAt,
  };
}

export async function listAdmins(): Promise<PublicAdmin[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select().from(admins);
  return rows
    .map(toPublic)
    .sort((a, b) => {
      // administradores primeiro, depois ordem alfabética
      if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
      return a.username.localeCompare(b.username);
    });
}

export async function countAdminsByRole(role: SiteRole): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select().from(admins).where(eq(admins.role, role));
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

// Cache curto das contas. A checagem de permissão roda em TODA requisição, e
// sem isso cada request virava uma consulta extra ao banco. O TTL baixo mantém
// as mudanças de permissão praticamente imediatas.
const ADMIN_CACHE_TTL_MS = 10_000;
const adminCache = new Map<string, { value: PublicAdmin | undefined; at: number }>();

export function invalidateAdminCache(id?: string) {
  if (id) adminCache.delete(id);
  else adminCache.clear();
}

export async function getAdminById(id: string): Promise<PublicAdmin | undefined> {
  const cached = adminCache.get(id);
  if (cached && Date.now() - cached.at < ADMIN_CACHE_TTL_MS) {
    return cached.value;
  }

  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(admins).where(eq(admins.id, id));
  const value = rows[0] ? toPublic(rows[0]) : undefined;
  adminCache.set(id, { value, at: Date.now() });
  return value;
}

export async function createAdmin(input: {
  id: string;
  username: string;
  contract: string;
  passwordHash: string;
  role: SiteRole;
  permissions?: Permissions;
}): Promise<PublicAdmin> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalizedUsername = input.username.trim().toLowerCase();
  const permissions =
    input.role === "admin" ? null : JSON.stringify(input.permissions ?? DEFAULT_USER_PERMISSIONS);

  await db.insert(admins).values({
    id: input.id,
    username: normalizedUsername,
    contract: input.contract,
    passwordHash: input.passwordHash,
    role: input.role,
    permissions,
  });

  return {
    id: input.id,
    username: normalizedUsername,
    contract: input.contract,
    role: input.role,
    permissions: normalizePermissions(permissions, input.role),
    createdAt: new Date(),
  };
}

export async function updateAdminPermissions(
  id: string,
  permissions: Permissions
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(admins)
    .set({ permissions: JSON.stringify(permissions) })
    .where(eq(admins.id, id));
  invalidateAdminCache(id);
}

export async function deleteAdmin(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(admins).where(eq(admins.id, id));
  invalidateAdminCache(id);
}
