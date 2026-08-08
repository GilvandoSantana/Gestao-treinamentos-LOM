/**
 * Contratos — CRUD e a proteção contra excluir permanentemente um contrato
 * ainda em uso.
 */

import { eq, and, count } from "drizzle-orm";
import { contracts, employees, admins, safetySheets, trainings } from "../drizzle/schema";
import { getDb } from "./db";
import { slugifyContract, type ContractInfo, type ContractPreposition } from "@shared/contracts";

function toInfo(row: typeof contracts.$inferSelect): ContractInfo {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    preposition: row.preposition === "da" ? "da" : "do",
    alertEmail: row.alertEmail || null,
    alertWhatsapp: row.alertWhatsapp || null,
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
  alertEmail?: string | null;
  alertWhatsapp?: string | null;
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
    alertEmail: input.alertEmail?.trim() || null,
    alertWhatsapp: input.alertWhatsapp?.trim() || null,
  });

  return {
    id: input.id,
    slug,
    name: input.name.trim(),
    preposition: input.preposition,
    alertEmail: input.alertEmail?.trim() || null,
    alertWhatsapp: input.alertWhatsapp?.trim() || null,
    deleted: false,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  };
}

export async function updateContract(
  id: string,
  input: {
    name: string;
    preposition: ContractPreposition;
    alertEmail?: string | null;
    alertWhatsapp?: string | null;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // O slug não muda: é a chave que já está gravada em colaboradores, contas e
  // documentos. Só o nome exibido, a preposição e os contatos de alerta são editáveis.
  await db
    .update(contracts)
    .set({
      name: input.name.trim(),
      preposition: input.preposition,
      alertEmail: input.alertEmail?.trim() || null,
      alertWhatsapp: input.alertWhatsapp?.trim() || null,
    })
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

/**
 * Panorama por contrato: colaboradores ativos e a situação dos treinamentos
 * deles — para o comparativo entre contratos que só o administrador vê.
 */
export async function getContractsOverview(): Promise<
  Array<{
    slug: string;
    name: string;
    employees: number;
    expired: number;
    expiring: number;
    valid: number;
  }>
> {
  const db = await getDb();
  if (!db) return [];

  const activeContracts = await listContracts(false);

  const [employeeRows, trainingRows] = await Promise.all([
    db
      .select({ id: employees.id, contract: employees.contract, dismissed: employees.dismissed })
      .from(employees),
    db
      .select({
        expirationDate: trainings.expirationDate,
        employeeId: trainings.employeeId,
      })
      .from(trainings),
  ]);

  const contractByEmployeeId = new Map(employeeRows.map((e) => [e.id, e.contract]));
  const activeEmployeeCountByContract = new Map<string, number>();
  for (const e of employeeRows) {
    if (e.dismissed) continue;
    activeEmployeeCountByContract.set(e.contract, (activeEmployeeCountByContract.get(e.contract) ?? 0) + 1);
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const statusCountByContract = new Map<string, { expired: number; expiring: number; valid: number }>();
  for (const t of trainingRows) {
    const contract = contractByEmployeeId.get(t.employeeId);
    if (!contract || !t.expirationDate) continue;

    const expDate = new Date(t.expirationDate);
    expDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

    const entry = statusCountByContract.get(contract) ?? { expired: 0, expiring: 0, valid: 0 };
    if (diffDays < 0) entry.expired++;
    else if (diffDays <= 30) entry.expiring++;
    else entry.valid++;
    statusCountByContract.set(contract, entry);
  }

  return activeContracts.map((c) => {
    const status = statusCountByContract.get(c.slug) ?? { expired: 0, expiring: 0, valid: 0 };
    return {
      slug: c.slug,
      name: c.name,
      employees: activeEmployeeCountByContract.get(c.slug) ?? 0,
      ...status,
    };
  });
}
