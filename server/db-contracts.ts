/**
 * Contratos — CRUD e a proteção contra excluir permanentemente um contrato
 * ainda em uso.
 */

import { eq, and, count } from "drizzle-orm";
import { contracts, employees, admins, safetySheets } from "../drizzle/schema";
import { getDb } from "./db";
import { slugifyContract, type ContractInfo, type ContractPreposition } from "@shared/contracts";

function toInfo(row: typeof contracts.$inferSelect): ContractInfo {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    preposition: row.preposition === "da" ? "da" : "do",
    deleted: row.deleted,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listContracts(includeDeleted: boolean): Promise<ContractInfo[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = includeDeleted
    ? await db.select().from(contracts)
    : await db.select().from(contracts).where(eq(contracts.deleted, false));

  return rows.map(toInfo).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getContractBySlug(slug: string): Promise<ContractInfo | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(contracts).where(eq(contracts.slug, slug));
  return rows[0] ? toInfo(rows[0]) : undefined;
}

export async function getContractById(id: string): Promise<ContractInfo | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(contracts).where(eq(contracts.id, id));
  return rows[0] ? toInfo(rows[0]) : undefined;
}

export async function createContract(input: {
  id: string;
  name: string;
  preposition: ContractPreposition;
}): Promise<ContractInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const baseSlug = slugifyContract(input.name) || "contrato";
  let slug = baseSlug;
  let attempt = 1;
  // Evita colidir com um contrato já existente (inclusive na lixeira).
  while (await getContractBySlug(slug)) {
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  await db.insert(contracts).values({
    id: input.id,
    slug,
    name: input.name.trim(),
    preposition: input.preposition,
  });

  return {
    id: input.id,
    slug,
    name: input.name.trim(),
    preposition: input.preposition,
    deleted: false,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  };
}

export async function updateContract(
  id: string,
  input: { name: string; preposition: ContractPreposition }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // O slug não muda: é a chave que já está gravada em colaboradores, contas e
  // documentos. Só o nome exibido e a preposição são editáveis.
  await db
    .update(contracts)
    .set({ name: input.name.trim(), preposition: input.preposition })
    .where(eq(contracts.id, id));
}

export async function softDeleteContract(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(contracts).set({ deleted: true, deletedAt: new Date() }).where(eq(contracts.id, id));
}

export async function restoreContract(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(contracts).set({ deleted: false, deletedAt: null }).where(eq(contracts.id, id));
}

/** Quantos registros (colaboradores, contas e documentos) ainda usam este contrato. */
export async function countContractUsage(
  slug: string
): Promise<{ employees: number; admins: number; documents: number; total: number }> {
  const db = await getDb();
  if (!db) return { employees: 0, admins: 0, documents: 0, total: 0 };

  const [empRows, adminRows, docRows] = await Promise.all([
    db.select({ n: count() }).from(employees).where(eq(employees.contract, slug)),
    db.select({ n: count() }).from(admins).where(eq(admins.contract, slug)),
    db.select({ n: count() }).from(safetySheets).where(eq(safetySheets.contract, slug)),
  ]);

  const employeesCount = empRows[0]?.n ?? 0;
  const adminsCount = adminRows[0]?.n ?? 0;
  const documentsCount = docRows[0]?.n ?? 0;

  return {
    employees: employeesCount,
    admins: adminsCount,
    documents: documentsCount,
    total: employeesCount + adminsCount + documentsCount,
  };
}

export async function permanentlyDeleteContract(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(contracts).where(and(eq(contracts.id, id), eq(contracts.deleted, true)));
}
