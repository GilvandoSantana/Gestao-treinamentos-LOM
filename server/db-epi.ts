/**
 * Documentação — EPIs padrão por função (usados para pré-preencher a Ficha
 * de EPI de cada colaborador). Cada contrato tem sua própria lista por
 * função.
 */

import { eq, and, asc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { epiRoleItems, type EpiRoleItemRow } from "../drizzle/schema";
import { getDb } from "./db";

export interface EpiRoleItemInfo {
  id: string;
  role: string;
  sortOrder: number;
  quantity: number;
  specification: string;
  ca: string | null;
  responsibleName: string | null;
}

function toInfo(row: EpiRoleItemRow): EpiRoleItemInfo {
  return {
    id: row.id,
    role: row.role,
    sortOrder: row.sortOrder,
    quantity: row.quantity,
    specification: row.specification,
    ca: row.ca,
    responsibleName: row.responsibleName,
  };
}

/** Lista os EPIs configurados para uma função, dentro de um contrato. */
export async function listEpiRoleItems(contractSlug: string, role: string): Promise<EpiRoleItemInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(epiRoleItems)
    .where(and(eq(epiRoleItems.contractSlug, contractSlug), eq(epiRoleItems.role, role)))
    .orderBy(asc(epiRoleItems.sortOrder));
  return rows.map(toInfo);
}

/** Quantidade de itens configurados por função, num contrato — usado para
 * mostrar na lista de funções quais já têm EPI configurado. */
export async function countEpiRoleItemsByRole(contractSlug: string): Promise<Record<string, number>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db
    .select({ role: epiRoleItems.role })
    .from(epiRoleItems)
    .where(eq(epiRoleItems.contractSlug, contractSlug));
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.role] = (counts[row.role] ?? 0) + 1;
  }
  return counts;
}

/** Nomes de responsáveis já usados neste contrato — sugestões para o campo
 * "Responsável pela entrega" (autocomplete, não é uma lista travada). */
export async function listEpiResponsibleSuggestions(contractSlug: string): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ responsibleName: epiRoleItems.responsibleName })
    .from(epiRoleItems)
    .where(eq(epiRoleItems.contractSlug, contractSlug));
  const names = new Set<string>();
  for (const row of rows) {
    if (row.responsibleName && row.responsibleName.trim()) names.add(row.responsibleName.trim());
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/**
 * Substitui toda a lista de EPIs de uma função (apaga os antigos e insere
 * os novos) — mais simples e seguro do que tentar casar edição/remoção
 * item a item.
 */
export async function replaceEpiRoleItems(
  contractSlug: string,
  role: string,
  items: { quantity: number; specification: string; ca?: string | null; responsibleName?: string | null }[]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  await db.delete(epiRoleItems).where(and(eq(epiRoleItems.contractSlug, contractSlug), eq(epiRoleItems.role, role)));

  if (items.length === 0) return;

  await db.insert(epiRoleItems).values(
    items.map((item, index) => ({
      id: uuidv4(),
      contractSlug,
      role,
      sortOrder: index,
      quantity: item.quantity,
      specification: item.specification,
      ca: item.ca?.trim() || null,
      responsibleName: item.responsibleName?.trim() || null,
    }))
  );
}
