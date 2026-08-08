/**
 * Registro de atividades: quem fez o quê no site.
 */

import { desc, lt, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { activityLogs, type ActivityLog } from "../drizzle/schema";
import { getDb } from "./db";

export type ActivityAction =
  | "login"
  | "logout"
  | "employee.create"
  | "employee.update"
  | "employee.delete"
  | "employee.dismiss"
  | "employee.restore"
  | "employee.photo"
  | "employee.import"
  | "training.delete"
  | "certificate.upload"
  | "certificate.delete"
  | "account.create"
  | "account.delete"
  | "account.permissions"
  | "email.test"
  | "fds.upload"
  | "fds.update"
  | "fds.delete"
  | "contract.create"
  | "contract.update"
  | "contract.delete"
  | "contract.restore"
  | "contract.permanentDelete"
  | "employee.changeContract"
  | "account.impersonate"
  | "account.stopImpersonate"
  | "whatsapp.test"
  | "training.renewBulk";

export type LogActivityInput = {
  username: string | null;
  role: string | null;
  action: ActivityAction;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  details?: string;
};

/**
 * Grava uma linha no rastro. Nunca lança: registrar atividade não pode
 * derrubar a ação que o usuário acabou de fazer com sucesso.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.insert(activityLogs).values({
      id: uuidv4(),
      username: input.username ?? "desconhecido",
      role: input.role ?? "desconhecido",
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      targetName: input.targetName ?? null,
      details: input.details ?? null,
    });
  } catch (error) {
    console.error("[Activity] Falha ao registrar atividade:", error);
  }
}

export async function listActivity(options: {
  limit: number;
  username?: string;
}): Promise<ActivityLog[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const base = db.select().from(activityLogs);
    const rows = options.username
      ? await base.where(eq(activityLogs.username, options.username)).orderBy(desc(activityLogs.createdAt)).limit(options.limit)
      : await base.orderBy(desc(activityLogs.createdAt)).limit(options.limit);
    return rows;
  } catch (error) {
    console.error("[Activity] Falha ao listar atividades:", error);
    return [];
  }
}

/**
 * Remove registros antigos para o rastro não crescer indefinidamente.
 */
export async function purgeOldActivity(olderThanDays: number = 180): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    await db.delete(activityLogs).where(lt(activityLogs.createdAt, cutoff));
  } catch (error) {
    console.error("[Activity] Falha ao limpar atividades antigas:", error);
  }
}
