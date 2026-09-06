import { eq, lt } from "drizzle-orm";
import { pendingSignups, type PendingSignup } from "../drizzle/schema";
import { getDb } from "./db";

const SIGNUP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas pra confirmar

export async function createPendingSignup(input: {
  id: string;
  organizationName: string;
  organizationSlug: string;
  adminUsername: string;
  passwordHash: string;
  email: string;
  token: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível.");

  await db.insert(pendingSignups).values({
    ...input,
    expiresAt: new Date(Date.now() + SIGNUP_TOKEN_TTL_MS),
  });
}

export async function getPendingSignupById(id: string): Promise<PendingSignup | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(pendingSignups).where(eq(pendingSignups.id, id));
  return rows[0];
}

export async function getPendingSignupByToken(token: string): Promise<PendingSignup | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(pendingSignups).where(eq(pendingSignups.token, token));
  const row = rows[0];
  if (!row) return undefined;
  if (row.expiresAt.getTime() < Date.now()) return undefined; // expirado, trata como inexistente
  return row;
}

export async function deletePendingSignup(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(pendingSignups).where(eq(pendingSignups.id, id));
}

/** Limpa cadastros pendentes vencidos há muito tempo — chamado de vez em
 * quando (não em toda requisição), só pra não deixar lixo acumulando pra
 * sempre na tabela. Nunca falha a operação principal se der erro. */
export async function pruneExpiredPendingSignups(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.delete(pendingSignups).where(lt(pendingSignups.expiresAt, new Date()));
  } catch (error) {
    console.error("[PendingSignups] Falha ao limpar cadastros vencidos:", error);
  }
}
