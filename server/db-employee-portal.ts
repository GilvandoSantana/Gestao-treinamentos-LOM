import { eq, isNotNull } from "drizzle-orm";
import { employees, type Employee } from "../drizzle/schema";
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

export async function setEmployeePortalPin(employeeId: string, pinHash: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(employees).set({ portalPinHash: pinHash }).where(eq(employees.id, employeeId));
}

/** Admin pode resetar o PIN de um colaborador (esqueceu, perdeu acesso)
 * — volta pro estado de "primeiro acesso", sem precisar mexer em nada
 * mais do cadastro. */
export async function clearEmployeePortalPin(employeeId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(employees).set({ portalPinHash: null }).where(eq(employees.id, employeeId));
}
