/**
 * Documentação — Ordem de Serviço (NR-01) por função. Cada contrato define,
 * por função, os textos que preenchem a OS de quem exerce aquela função
 * (área, tarefas, agentes ambientais, medidas de controle, EPIs mínimos).
 * Um registro por (contractSlug, role) — substituído por inteiro a cada
 * salvamento (mesma lógica de db-epi.ts).
 */

import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { osRoleConfig, type OsRoleConfigRow } from "../drizzle/schema";
import { getDb } from "./db";

export interface OsRoleConfigInfo {
  role: string;
  area: string | null;
  setorTrabalho: string | null;
  maquinasEquipamentos: string | null;
  tarefas: string | null;
  agentesFisicos: string | null;
  agentesQuimicos: string | null;
  agentesBiologicos: string | null;
  agentesErgonomicos: string | null;
  agentesAcidentes: string | null;
  medidasAdministrativas: string | null;
  medidasEngenharia: string | null;
  episMinimos: string | null;
}

function toInfo(row: OsRoleConfigRow): OsRoleConfigInfo {
  return {
    role: row.role,
    area: row.area,
    setorTrabalho: row.setorTrabalho,
    maquinasEquipamentos: row.maquinasEquipamentos,
    tarefas: row.tarefas,
    agentesFisicos: row.agentesFisicos,
    agentesQuimicos: row.agentesQuimicos,
    agentesBiologicos: row.agentesBiologicos,
    agentesErgonomicos: row.agentesErgonomicos,
    agentesAcidentes: row.agentesAcidentes,
    medidasAdministrativas: row.medidasAdministrativas,
    medidasEngenharia: row.medidasEngenharia,
    episMinimos: row.episMinimos,
  };
}

/** Busca a configuração de OS de uma função, dentro de um contrato. */
export async function getOsRoleConfig(contractSlug: string, role: string): Promise<OsRoleConfigInfo | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(osRoleConfig)
    .where(and(eq(osRoleConfig.contractSlug, contractSlug), eq(osRoleConfig.role, role)))
    .limit(1);
  return rows[0] ? toInfo(rows[0]) : null;
}

/** Quantas funções já têm OS configurada, num contrato — usado para marcar
 * na lista de funções quais já estão prontas. */
export async function countOsRoleConfigs(contractSlug: string): Promise<Record<string, boolean>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db
    .select({ role: osRoleConfig.role })
    .from(osRoleConfig)
    .where(eq(osRoleConfig.contractSlug, contractSlug));
  const configured: Record<string, boolean> = {};
  for (const row of rows) {
    configured[row.role] = true;
  }
  return configured;
}

/**
 * Substitui a configuração de OS de uma função (apaga a antiga e insere a
 * nova) — mesma lógica simples e segura de replaceEpiRoleItems.
 */
export async function saveOsRoleConfig(
  contractSlug: string,
  role: string,
  input: {
    area?: string | null;
    setorTrabalho?: string | null;
    maquinasEquipamentos?: string | null;
    tarefas?: string | null;
    agentesFisicos?: string | null;
    agentesQuimicos?: string | null;
    agentesBiologicos?: string | null;
    agentesErgonomicos?: string | null;
    agentesAcidentes?: string | null;
    medidasAdministrativas?: string | null;
    medidasEngenharia?: string | null;
    episMinimos?: string | null;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  await db.delete(osRoleConfig).where(and(eq(osRoleConfig.contractSlug, contractSlug), eq(osRoleConfig.role, role)));

  await db.insert(osRoleConfig).values({
    id: uuidv4(),
    contractSlug,
    role,
    area: input.area?.trim() || null,
    setorTrabalho: input.setorTrabalho?.trim() || null,
    maquinasEquipamentos: input.maquinasEquipamentos?.trim() || null,
    tarefas: input.tarefas?.trim() || null,
    agentesFisicos: input.agentesFisicos?.trim() || null,
    agentesQuimicos: input.agentesQuimicos?.trim() || null,
    agentesBiologicos: input.agentesBiologicos?.trim() || null,
    agentesErgonomicos: input.agentesErgonomicos?.trim() || null,
    agentesAcidentes: input.agentesAcidentes?.trim() || null,
    medidasAdministrativas: input.medidasAdministrativas?.trim() || null,
    medidasEngenharia: input.medidasEngenharia?.trim() || null,
    episMinimos: input.episMinimos?.trim() || null,
  });
}
