/**
 * Database helpers for employees and trainings
 */

import { eq, and, notInArray } from "drizzle-orm";
import { employees, trainings, type InsertEmployee, type InsertTraining } from "../drizzle/schema";
import { getDb } from "./db";

export async function upsertEmployee(employee: InsertEmployee): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert employee: database not available");
    return;
  }

  try {
    await db.insert(employees).values(employee).onDuplicateKeyUpdate({
      set: {
        name: employee.name,
        registration: employee.registration,
        educationLevel: employee.educationLevel,
        age: employee.age,
        role: employee.role,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("[Database] Failed to upsert employee:", error);
    throw error;
  }
}

export async function getAllEmployees() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get employees: database not available");
    return [];
  }

  try {
    const result = await db.select().from(employees);
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
