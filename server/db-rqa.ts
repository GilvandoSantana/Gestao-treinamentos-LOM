/**
 * Lançamentos RQA's (Registro de Quase Acidente) — substitui a planilha de
 * Excel mensal que o Gilvando usava (ideia dele, 16/09). Um lançamento por
 * colaborador por mês (quantidade entregue + situação daquele mês); tudo o
 * resto (% alcançada, status, ranking, resumo por líder/área) é CALCULADO
 * aqui, nunca guardado — igual a planilha fazia com fórmula, só que sem
 * precisar duplicar a aba inteira todo mês.
 */

import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { employees, rqaEntries } from "../drizzle/schema";
import { getDb } from "./db";

export type RqaSituacao = "ATIVO" | "FERIAS" | "AFASTADO" | "INATIVO";

export interface RqaEmployeeInput {
  id: string;
  registration: string | null;
  name: string;
  role: string;
  leader: string | null;
  area: string | null;
}

export interface RqaEntryInput {
  quantidade: number;
  situacao: RqaSituacao;
}

export interface RqaEmployeeRow {
  employeeId: string;
  registration: string | null;
  name: string;
  role: string;
  leader: string | null;
  area: string | null;
  situacao: RqaSituacao;
  quantidade: number;
  metaIndividual: number;
  /** null quando a meta individual é 0 (colaborador não ATIVO no mês) — não faz sentido calcular %. */
  percentAlcancada: number | null;
  /** "OK" | "ATENÇÃO" | "ABAIXO", ou a própria situação quando não é ATIVO. */
  status: string;
  /** null quando a meta individual é 0 — mesma regra do % (não participa do ranking de meta). */
  ranking: number | null;
}

export interface RqaGroupSummary {
  nome: string;
  ativos: number;
  meta: number;
  totalRqa: number;
  percentAtingimento: number;
}

export interface RqaReport {
  totalColaboradores: number;
  ativos: number;
  metaUnidade: number;
  totalEntregue: number;
  percentGeral: number;
  colaboradoresAbaixoMeta: number;
  colaboradoresAtingiramMeta: number;
  porLider: RqaGroupSummary[];
  porArea: RqaGroupSummary[];
  porColaborador: RqaEmployeeRow[];
}

function computeStatus(situacao: RqaSituacao, metaIndividual: number, percentAlcancada: number | null): string {
  if (metaIndividual === 0) return situacao;
  if (percentAlcancada === null) return situacao;
  if (percentAlcancada >= 1) return "OK";
  if (percentAlcancada >= 0.8) return "ATENÇÃO";
  return "ABAIXO";
}

function computeGroupSummary(
  nome: string,
  membros: RqaEmployeeRow[],
  metaIndividualBase: number
): RqaGroupSummary {
  const ativos = membros.filter((m) => m.situacao === "ATIVO").length;
  const meta = ativos * metaIndividualBase;
  const totalRqa = membros.reduce((sum, m) => sum + m.quantidade, 0);
  const percentAtingimento = meta === 0 ? 0 : totalRqa / meta;
  return { nome, ativos, meta, totalRqa, percentAtingimento };
}

/**
 * Monta o relatório completo do mês a partir dos colaboradores (já filtrados
 * pelo contrato, sem demitido) e dos lançamentos daquele mês — função pura,
 * sem banco, fácil de testar. entriesByEmployeeId sem entrada pra alguém
 * significa "ainda não lançado este mês" — vira ATIVO/quantidade 0 por
 * padrão (a pessoa que lança ajusta se for diferente).
 */
export function computeRqaReport(
  employeesList: RqaEmployeeInput[],
  entriesByEmployeeId: Map<string, RqaEntryInput>,
  metaIndividualBase: number
): RqaReport {
  const rows: RqaEmployeeRow[] = employeesList.map((emp) => {
    const entry = entriesByEmployeeId.get(emp.id);
    const situacao = entry?.situacao ?? "ATIVO";
    const quantidade = entry?.quantidade ?? 0;
    const metaIndividual = situacao === "ATIVO" ? metaIndividualBase : 0;
    const percentAlcancada = metaIndividual === 0 ? null : quantidade / metaIndividual;
    return {
      employeeId: emp.id,
      registration: emp.registration,
      name: emp.name,
      role: emp.role,
      leader: emp.leader,
      area: emp.area,
      situacao,
      quantidade,
      metaIndividual,
      percentAlcancada,
      status: computeStatus(situacao, metaIndividual, percentAlcancada),
      ranking: null, // preenchido abaixo
    };
  });

  // Ranking: do maior pra menor quantidade, só entre quem tem meta de
  // verdade (metaIndividual > 0 — igual a planilha, que também não
  // rankeava quem tinha META INDIVIDUAL 0). Empate desfeito por nome,
  // pra ordem sempre igual (a planilha desfazia por posição na lista,
  // que também é arbitrária — nome é mais previsível de conferir).
  const ranked = rows
    .filter((r) => r.metaIndividual > 0)
    .sort((a, b) => b.quantidade - a.quantidade || a.name.localeCompare(b.name));
  ranked.forEach((row, index) => {
    row.ranking = index + 1;
  });

  const totalColaboradores = rows.length;
  const ativos = rows.filter((r) => r.situacao === "ATIVO").length;
  const metaUnidade = ativos * metaIndividualBase;
  const totalEntregue = rows.reduce((sum, r) => sum + r.quantidade, 0);
  const percentGeral = metaUnidade === 0 ? 0 : totalEntregue / metaUnidade;
  const colaboradoresAbaixoMeta = rows.filter((r) => r.status === "ABAIXO" || r.status === "ATENÇÃO").length;
  const colaboradoresAtingiramMeta = ativos - colaboradoresAbaixoMeta;

  const liderNomes = Array.from(new Set(rows.map((r) => r.leader).filter((v): v is string => !!v))).sort((a, b) =>
    a.localeCompare(b)
  );
  const areaNomes = Array.from(new Set(rows.map((r) => r.area).filter((v): v is string => !!v))).sort((a, b) =>
    a.localeCompare(b)
  );

  const porLider = liderNomes.map((nome) =>
    computeGroupSummary(
      nome,
      rows.filter((r) => r.leader === nome),
      metaIndividualBase
    )
  );
  const porArea = areaNomes.map((nome) =>
    computeGroupSummary(
      nome,
      rows.filter((r) => r.area === nome),
      metaIndividualBase
    )
  );

  return {
    totalColaboradores,
    ativos,
    metaUnidade,
    totalEntregue,
    percentGeral,
    colaboradoresAbaixoMeta,
    colaboradoresAtingiramMeta,
    porLider,
    porArea,
    porColaborador: rows,
  };
}

export async function getRqaEmployees(contractSlug: string): Promise<RqaEmployeeInput[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: employees.id,
      registration: employees.registration,
      name: employees.name,
      role: employees.role,
      leader: employees.leader,
      area: employees.area,
    })
    .from(employees)
    .where(and(eq(employees.contract, contractSlug), eq(employees.dismissed, false)));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getRqaEntriesForMonth(
  employeeIds: string[],
  yearMonth: string
): Promise<Map<string, RqaEntryInput>> {
  const map = new Map<string, RqaEntryInput>();
  if (employeeIds.length === 0) return map;
  const db = await getDb();
  if (!db) return map;
  const rows = await db.select().from(rqaEntries).where(eq(rqaEntries.yearMonth, yearMonth));
  const idSet = new Set(employeeIds);
  for (const row of rows) {
    if (!idSet.has(row.employeeId)) continue;
    map.set(row.employeeId, {
      quantidade: row.quantidade,
      situacao: (row.situacao as RqaSituacao) || "ATIVO",
    });
  }
  return map;
}

/** Salva/atualiza vários lançamentos de uma vez (um por colaborador) — a
 * tela sempre manda a lista inteira do mês visível, não um item por vez. */
export async function saveRqaEntries(
  entries: { employeeId: string; yearMonth: string; quantidade: number; situacao: RqaSituacao }[],
  updatedBy: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (const entry of entries) {
    const existing = await db
      .select({ id: rqaEntries.id })
      .from(rqaEntries)
      .where(and(eq(rqaEntries.employeeId, entry.employeeId), eq(rqaEntries.yearMonth, entry.yearMonth)))
      .limit(1);
    if (existing.length) {
      await db
        .update(rqaEntries)
        .set({ quantidade: entry.quantidade, situacao: entry.situacao, updatedBy, updatedAt: new Date() })
        .where(eq(rqaEntries.id, existing[0].id));
    } else {
      await db.insert(rqaEntries).values({
        id: uuidv4(),
        employeeId: entry.employeeId,
        yearMonth: entry.yearMonth,
        quantidade: entry.quantidade,
        situacao: entry.situacao,
        updatedBy,
      });
    }
  }
}
