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
    return;
  }

  // Sempre recalcula a idade a partir da data de nascimento antes de salvar
  const computedAge = calculateAgeFromBirthDate(employee.birthDate) ?? employee.age;

  try {
    await db.insert(employees).values({ ...employee, age: computedAge }).onDuplicateKeyUpdate({
      set: {
        name: employee.name,
        registration: employee.registration,
        educationLevel: employee.educationLevel,
        age: computedAge,
        birthDate: employee.birthDate,
        role: employee.role,
        phone: employee.phone,
        customFields: employee.customFields,
        updatedAt: new Date(),
      },
    });
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
    return undefined;
  }

  try {
    const result = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    console.error("[Database] Failed to get employee:", error);
    return undefined;
  }
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
    return;
  }

  try {
    await db.insert(trainings).values(training).onDuplicateKeyUpdate({
      set: {
        name: training.name,
        completionDate: training.completionDate,
        expirationDate: training.expirationDate,
        updatedAt: new Date(),
      },
    });
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
