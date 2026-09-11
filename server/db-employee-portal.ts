import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, isNotNull } from "drizzle-orm";
import { employeePortalInvitations, employees, type Employee } from "../drizzle/schema";
import { getDb } from "./db";

/** Deixa só os dígitos — aceita CPF digitado com ou sem pontuação
 * ("123.456.789-00" ou "12345678900"), comparando sempre da mesma
 * forma. */
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

/**
 * Busca um colaborador pelo CPF — compara os dígitos, ignorando
 * pontuação de qualquer um dos dois lados. Devolve undefined tanto se
 * não achar ninguém quanto se achar MAIS de um colaborador com o mesmo
 * CPF (mesma cautela usada em pickUnambiguousAdmin, server/db-admins.ts
 * — nunca arrisca abrir o portal de uma pessoa pra outra por engano).
 */
export async function getEmployeeByCpf(cpf: string): Promise<Employee | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const target = normalizeCpf(cpf);
  if (!target) return undefined;

  const rows = await db.select().from(employees).where(isNotNull(employees.cpf));
  const matches = rows.filter((row) => row.cpf && normalizeCpf(row.cpf) === target);

  if (matches.length !== 1) return undefined;
  return matches[0];
}

function digest(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex');
}

/** Lock order is always employee then invitation, including reset and activation. */
export async function issueEmployeePortalInvitation(employeeId: string, contract: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível.");
  return db.transaction(async tx => {
    const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId)).for('update');
    if (!employee || employee.contract !== contract || employee.dismissed || !employee.cpf || employee.portalPinHash) {
      throw new Error("Salve o CPF de um colaborador ativo e sem PIN. Para substituir um acesso existente, resete-o primeiro.");
    }
    const code = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await tx.insert(employeePortalInvitations).values({ employeeId, tokenHash: digest(code), expiresAt })
      .onDuplicateKeyUpdate({ set: { tokenHash: digest(code), expiresAt } });
    return { code, expiresAt };
  }, { isolationLevel: 'read committed' });
}

export async function activateEmployeePortal(employeeId: string, cpf: string, code: string, pinHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível.");
  return db.transaction(async tx => {
    const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId)).for('update');
    const [invitation] = await tx.select().from(employeePortalInvitations).where(eq(employeePortalInvitations.employeeId, employeeId)).for('update');
    if (!employee || employee.dismissed || employee.portalPinHash || normalizeCpf(employee.cpf ?? '') !== normalizeCpf(cpf) ||
        !invitation || invitation.expiresAt.getTime() <= Date.now() ||
        !timingSafeEqual(Buffer.from(invitation.tokenHash), Buffer.from(digest(code)))) return null;
    await tx.update(employees).set({ portalPinHash: pinHash }).where(eq(employees.id, employeeId));
    await tx.delete(employeePortalInvitations).where(eq(employeePortalInvitations.employeeId, employeeId));
    return { id: employee.id, contract: employee.contract };
  }, { isolationLevel: 'read committed' });
}

/** Changing the PIN invalidates the session version and every pending invitation. */
export async function clearEmployeePortalPin(employeeId: string, contract: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível.");
  await db.transaction(async tx => {
    const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId)).for('update');
    if (!employee || employee.contract !== contract) throw new Error("Colaborador não encontrado.");
    await tx.update(employees).set({ portalPinHash: null }).where(eq(employees.id, employeeId));
    await tx.delete(employeePortalInvitations).where(eq(employeePortalInvitations.employeeId, employeeId));
  }, { isolationLevel: 'read committed' });
}
