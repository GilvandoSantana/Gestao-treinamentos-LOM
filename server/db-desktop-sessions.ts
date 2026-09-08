import { eq, isNull } from "drizzle-orm";
import { desktopSessions, type DesktopSession } from "../drizzle/schema";
import { getDb } from "./db";

export async function createDesktopSession(input: {
  id: string;
  username: string;
  adminId: string | null;
  deviceName: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(desktopSessions).values(input);
}

/** true = sessão revogada (ou nunca existiu — trata igual, por segurança:
 * um token com id desconhecido nunca deveria ser aceito). */
export async function isDesktopSessionRevoked(id: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false; // banco fora do ar: não bloqueia login, mesma postura do resto do sistema
  const rows = await db.select().from(desktopSessions).where(eq(desktopSessions.id, id));
  const session = rows[0];
  if (!session) return true; // id desconhecido — nunca deixa passar
  return !!session.revokedAt;
}

export async function listActiveDesktopSessions(): Promise<DesktopSession[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(desktopSessions).where(isNull(desktopSessions.revokedAt));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function revokeDesktopSession(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(desktopSessions).set({ revokedAt: new Date() }).where(eq(desktopSessions.id, id));
}
