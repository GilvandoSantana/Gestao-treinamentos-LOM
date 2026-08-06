/**
 * Database helpers para FDS (Ficha de Dados de Segurança)
 */

import { and, desc, eq } from "drizzle-orm";
import { safetySheets, type SafetySheet } from "../drizzle/schema";
import { getDb } from "./db";
import { type Contract, isContract, DEFAULT_CONTRACT } from "@shared/contracts";
import { type DocumentType, isDocumentType } from "@shared/document-types";

export type PublicSafetySheet = {
  id: string;
  type: DocumentType;
  contract: Contract;
  name: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  roles: string[];
  createdAt: Date;
};

function toPublic(row: SafetySheet): PublicSafetySheet {
  let roles: string[] = [];
  if (row.roles) {
    try {
      const parsed = JSON.parse(row.roles);
      if (Array.isArray(parsed)) roles = parsed.filter((r) => typeof r === "string");
    } catch {
      roles = [];
    }
  }
  return {
    id: row.id,
    type: isDocumentType(row.type) ? row.type : 'fds',
    contract: isContract(row.contract) ? row.contract : DEFAULT_CONTRACT,
    name: row.name,
    fileName: row.fileName,
    fileUrl: row.fileUrl,
    fileSize: row.fileSize ?? null,
    roles,
    createdAt: row.createdAt,
  };
}

export async function listSafetySheets(type?: DocumentType, contract?: Contract): Promise<PublicSafetySheet[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const filters = [
      type ? eq(safetySheets.type, type) : undefined,
      contract ? eq(safetySheets.contract, contract) : undefined,
    ].filter(Boolean);

    const rows = filters.length
      ? await db.select().from(safetySheets).where(and(...(filters as any))).orderBy(desc(safetySheets.createdAt))
      : await db.select().from(safetySheets).orderBy(desc(safetySheets.createdAt));
    return rows.map(toPublic);
  } catch (error) {
    console.error("[FDS] Falha ao listar fichas:", error);
    return [];
  }
}

export async function getSafetySheetById(id: string): Promise<PublicSafetySheet | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(safetySheets).where(eq(safetySheets.id, id));
  return rows[0] ? toPublic(rows[0]) : undefined;
}

export async function createSafetySheet(input: {
  id: string;
  type: DocumentType;
  contract: Contract;
  name: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  roles: string[];
}): Promise<PublicSafetySheet> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(safetySheets).values({
    id: input.id,
    type: input.type,
    contract: input.contract,
    name: input.name,
    fileName: input.fileName,
    fileUrl: input.fileUrl,
    fileSize: input.fileSize,
    roles: JSON.stringify(input.roles),
  });

  return {
    id: input.id,
    type: input.type,
    contract: input.contract,
    name: input.name,
    fileName: input.fileName,
    fileUrl: input.fileUrl,
    fileSize: input.fileSize,
    roles: input.roles,
    createdAt: new Date(),
  };
}

export async function updateSafetySheetRoles(id: string, roles: string[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(safetySheets).set({ roles: JSON.stringify(roles) }).where(eq(safetySheets.id, id));
}

export async function deleteSafetySheet(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(safetySheets).where(eq(safetySheets.id, id));
}
