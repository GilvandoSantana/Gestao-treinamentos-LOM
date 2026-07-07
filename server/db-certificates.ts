import { getDb } from "./db";
import { certificates } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { InsertCertificate, Certificate } from "../drizzle/schema";

export async function uploadCertificate(data: InsertCertificate): Promise<Certificate> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection failed");
  }

  await db.insert(certificates).values(data);
  
  const result = await db
    .select()
    .from(certificates)
    .where(eq(certificates.id, data.id!));

  if (!result.length) {
    throw new Error("Failed to retrieve uploaded certificate");
  }

  return result[0];
}

export async function getCertificatesByTrainingId(trainingId: string): Promise<Certificate[]> {
  const db = await getDb();
  if (!db) {
    return [];
  }

  try {
    const result = await db
      .select()
      .from(certificates)
      .where(eq(certificates.trainingId, trainingId));
    return result;
  } catch (error) {
    console.error("Error fetching certificates by training ID:", error);
    return [];
  }
}

export async function getCertificatesByEmployeeId(employeeId: string): Promise<Certificate[]> {
  const db = await getDb();
  if (!db) {
    return [];
  }

  try {
    const result = await db
      .select()
      .from(certificates)
      .where(eq(certificates.employeeId, employeeId));
    return result;
  } catch (error) {
    console.error("Error fetching certificates by employee ID:", error);
    return [];
  }
}

export async function deleteCertificate(id: string): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection failed");
  }

  try {
    const result = await db.delete(certificates).where(eq(certificates.id, id));
    return true;
  } catch (error) {
    console.error("Error deleting certificate:", error);
    throw error;
  }
}

export async function getCertificateById(id: string): Promise<Certificate | null> {
  const db = await getDb();
  if (!db) {
    return null;
  }

  try {
    const result = await db
      .select()
      .from(certificates)
      .where(eq(certificates.id, id));
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("Error fetching certificate by ID:", error);
    return null;
  }
}

export async function getAllCertificates(): Promise<Certificate[]> {
  const db = await getDb();
  if (!db) {
    return [];
  }

  try {
    const result = await db.select().from(certificates);
    return result;
  } catch (error) {
    console.error("Error fetching all certificates:", error);
    return [];
  }
}
