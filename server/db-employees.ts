/**
 * Database helpers for employees and trainings
 */

import { eq, and, notInArray } from "drizzle-orm";
import { employees, trainings, type InsertEmployee, type InsertTraining } from "../drizzle/schema";
import { getDb } from "./db";

/**
 * Calcula a idade a partir da data de nascimento (formato YYYY-MM-DD).
 * Retorna undefined se a data for inválida ou ausente.
 */
function calculateAgeFromBirthDate(birthDate?: string | null): number | undefined {
  if (!birthDate) return undefined;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export async function upsertEmployee(employee: InsertEmployee): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert employee: database not available");
    throw new Error("Database not available");
  }

  // Sempre recalcula a idade a partir da data de nascimento antes de salvar
  const computedAge = calculateAgeFromBirthDate(employee.birthDate) ?? employee.age;

  try {
    const existing = await db.select({ owner: employees.contract }).from(employees).where(eq(employees.id, employee.id)).limit(1);
    if (existing.length && existing[0].owner !== employee.contract) {
      throw new Error("Registro não encontrado no escopo informado.");
    }
    if (!existing.length) {
      // A simultaneous insert with the same ID fails instead of updating another owner.
      await db.insert(employees).values({ ...employee, age: computedAge });
      return;
    }
    await db.update(employees).set({
        name: employee.name,
        registration: employee.registration,
        educationLevel: employee.educationLevel,
        age: computedAge,
        birthDate: employee.birthDate,
        admissionDate: employee.admissionDate,
        role: employee.role,
        phone: employee.phone,
        // Campo "gerencia" não vem mais do formulário de colaborador (virou
        // um campo do contrato) — só inclui na atualização se for
        // explicitamente enviado, pra não apagar o que já estava salvo em
        // quem ainda tem esse dado antigo (ainda usado no crachá).
        ...(employee.gerencia !== undefined ? { gerencia: employee.gerencia } : {}),
        cnhNumero: employee.cnhNumero,
        cnhValidade: employee.cnhValidade,
        cnhCategoria: employee.cnhCategoria,
        cpf: employee.cpf,
        customFields: employee.customFields,
        updatedAt: new Date(),
    }).where(and(eq(employees.id, employee.id), eq(employees.contract, employee.contract!)));
  } catch (error) {
    console.error("[Database] Failed to upsert employee:", error);
    throw error;
  }
}

export async function getAllEmployees(contract?: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get employees: database not available");
    return [];
  }

  try {
    const result = contract
      ? await db.select().from(employees).where(eq(employees.contract, contract))
      : await db.select().from(employees);
    return result;
  } catch (error) {
    console.error("[Database] Failed to get employees:", error);
    return [];
  }
}

export async function getEmployeeById(id: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get employee: database not available");
    throw new Error("Database not available");
  }

  try {
    const result = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error("[Database] Failed to get employee:", error);
    throw error;
  }
}

/**
 * Igual a getEmployeeById, mas SÓ devolve o colaborador se ele pertencer
 * ao contrato informado — usada em TODA operação que recebe um id vindo
 * do cliente (editar, demitir, excluir, resetar acesso do portal, etc),
 * pra impedir que alguém manipule um colaborador de outro contrato só
 * por saber (ou adivinhar) o UUID dele. Achado real numa auditoria de
 * segurança (ChatGPT + revisão própria, 07/09): essas rotas confiavam no
 * id sozinho, sem confirmar de quem era o registro.
 *
 * `contract: null` (administrador principal vendo "Todos os contratos")
 * passa direto — ele realmente enxerga tudo por design, mesma regra já
 * usada no resto do sistema (ex: siteContract null = vê todos).
 */
export async function getEmployeeScoped(id: string, contract: string | null) {
  const employee = await getEmployeeById(id);
  if (!employee) return undefined;
  if (contract !== null && employee.contract !== contract) return undefined;
  return employee;
}

export async function deleteEmployee(id: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete employee: database not available");
    return;
  }

  try {
    // Delete trainings first
    await db.delete(trainings).where(eq(trainings.employeeId, id));
    // Then delete employee
    await db.delete(employees).where(eq(employees.id, id));
  } catch (error) {
    console.error("[Database] Failed to delete employee:", error);
    throw error;
  }
}

export async function upsertTraining(training: InsertTraining): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert training: database not available");
    throw new Error("Database not available");
  }

  try {
    const existing = await db.select({ owner: trainings.employeeId }).from(trainings).where(eq(trainings.id, training.id)).limit(1);
    if (existing.length && existing[0].owner !== training.employeeId) {
      throw new Error("Registro não encontrado no escopo informado.");
    }
    if (!existing.length) {
      // A simultaneous insert with the same ID fails instead of updating another owner.
      await db.insert(trainings).values(training);
      return;
    }
    await db.update(trainings).set({
        name: training.name,
        completionDate: training.completionDate,
        expirationDate: training.expirationDate,
        updatedAt: new Date(),
    }).where(and(eq(trainings.id, training.id), eq(trainings.employeeId, training.employeeId!)));
  } catch (error) {
    console.error("[Database] Failed to upsert training:", error);
    throw error;
  }
}

export async function getTrainingsByEmployeeId(employeeId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get trainings: database not available");
    return [];
  }

  try {
    const result = await db.select().from(trainings).where(eq(trainings.employeeId, employeeId));
    return result;
  } catch (error) {
    console.error("[Database] Failed to get trainings:", error);
    return [];
  }
}

export async function deleteTraining(id: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete training: database not available");
    return;
  }

  try {
    await db.delete(trainings).where(eq(trainings.id, id));
  } catch (error) {
    console.error("[Database] Failed to delete training:", error);
    throw error;
  }
}

export async function deleteTrainingsExcept(employeeId: string, trainingIds: string[]): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    if (trainingIds.length === 0) {
      await db.delete(trainings).where(eq(trainings.employeeId, employeeId));
    } else {
      await db.delete(trainings).where(
        and(
          eq(trainings.employeeId, employeeId),
          notInArray(trainings.id, trainingIds)
        )
      );
    }
  } catch (error) {
    console.error("[Database] Failed to delete old trainings:", error);
    throw error;
  }
}

/**
 * Busca os treinamentos de TODOS os colaboradores numa única consulta e já
 * devolve agrupados por employeeId.
 *
 * Substitui o padrão anterior de chamar getTrainingsByEmployeeId() uma vez por
 * colaborador (N+1), que fazia dezenas/centenas de idas ao banco só para
 * montar a lista inicial.
 */
export async function getTrainingsGroupedByEmployee(): Promise<Map<string, typeof trainings.$inferSelect[]>> {
  const grouped = new Map<string, typeof trainings.$inferSelect[]>();

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get trainings: database not available");
    return grouped;
  }

  try {
    const rows = await db.select().from(trainings);
    for (const row of rows) {
      const list = grouped.get(row.employeeId);
      if (list) list.push(row);
      else grouped.set(row.employeeId, [row]);
    }
    return grouped;
  } catch (error) {
    console.error("[Database] Failed to get trainings in batch:", error);
    return grouped;
  }
}

/**
 * Marca ou desmarca um colaborador como demitido.
 * Não apaga nada: o registro e os treinamentos continuam no banco, apenas
 * saem das listas e das contagens do dia a dia.
 */
export async function setEmployeeDismissed(id: string, dismissed: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(employees)
    .set({
      dismissed,
      dismissedAt: dismissed ? new Date() : null,
    })
    .where(eq(employees.id, id));
}

/** Move um colaborador para outro contrato (uso exclusivo do administrador). */
export async function setEmployeeContract(id: string, contract: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employees).set({ contract }).where(eq(employees.id, id));
}

/**
 * Nomes de treinamento já usados, sem repetição — para sugerir autocompletar
 * ao cadastrar um novo treinamento e evitar variações do mesmo nome ("NR-35",
 * "NR 35", "NR35 - Trabalho em Altura") espalhadas pelo sistema.
 */
export async function getDistinctTrainingNames(contract?: string): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const rows = contract
      ? await db
          .select({ name: trainings.name })
          .from(trainings)
          .leftJoin(employees, eq(trainings.employeeId, employees.id))
          .where(eq(employees.contract, contract))
      : await db.select({ name: trainings.name }).from(trainings);

    const unique = Array.from(new Set(rows.map((r) => r.name?.trim()).filter(Boolean))) as string[];
    return unique.sort((a, b) => a.localeCompare(b));
  } catch (error) {
    console.error("[Database] Failed to get distinct training names:", error);
    return [];
  }
}


export async function getTrainingById(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(trainings).where(eq(trainings.id, id)).limit(1);
  return rows[0];
}
