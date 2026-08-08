/**
 * Campos personalizados por contrato.
 */

import { eq, and } from "drizzle-orm";
import { contractCustomFields } from "../drizzle/schema";
import { getDb } from "./db";
import { slugifyContract } from "@shared/contracts";

export type CustomFieldType = "text" | "number" | "date";

export interface CustomFieldInfo {
  id: string;
  contractSlug: string;
  fieldKey: string;
  label: string;
  fieldType: CustomFieldType;
}

const MAX_FIELDS_PER_CONTRACT = 5;

function toInfo(row: typeof contractCustomFields.$inferSelect): CustomFieldInfo {
  const type = row.fieldType;
  return {
    id: row.id,
    contractSlug: row.contractSlug,
    fieldKey: row.fieldKey,
    label: row.label,
    fieldType: type === "number" || type === "date" ? type : "text",
  };
}

export async function listCustomFields(contractSlug: string): Promise<CustomFieldInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(contractCustomFields)
    .where(eq(contractCustomFields.contractSlug, contractSlug));
  return rows.map(toInfo);
}

export async function createCustomField(input: {
  id: string;
  contractSlug: string;
  label: string;
  fieldType: CustomFieldType;
}): Promise<CustomFieldInfo> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await listCustomFields(input.contractSlug);
  if (existing.length >= MAX_FIELDS_PER_CONTRACT) {
    throw new Error(`Cada contrato pode ter no máximo ${MAX_FIELDS_PER_CONTRACT} campos personalizados.`);
  }

  const baseKey = slugifyContract(input.label) || "campo";
  let fieldKey = baseKey;
  let attempt = 1;
  while (existing.some((f) => f.fieldKey === fieldKey)) {
    attempt++;
    fieldKey = `${baseKey}-${attempt}`;
  }

  await db.insert(contractCustomFields).values({
    id: input.id,
    contractSlug: input.contractSlug,
    fieldKey,
    label: input.label.trim(),
    fieldType: input.fieldType,
  });

  return { id: input.id, contractSlug: input.contractSlug, fieldKey, label: input.label.trim(), fieldType: input.fieldType };
}

export async function deleteCustomField(id: string, contractSlug: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // contractSlug na condição evita que alguém apague o campo de outro
  // contrato adivinhando um id.
  await db
    .delete(contractCustomFields)
    .where(and(eq(contractCustomFields.id, id), eq(contractCustomFields.contractSlug, contractSlug)));
}

/** JSON salvo em employees.customFields -> objeto {fieldKey: valor}. */
export function parseCustomFieldValues(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}
