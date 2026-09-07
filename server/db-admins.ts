/**
 * Database helpers for named admin/user accounts
 */

import { and, eq } from "drizzle-orm";
import { admins, type Admin } from "../drizzle/schema";
import { getDb } from "./db";
import { DEFAULT_CONTRACT_SLUG, DEFAULT_ORGANIZATION_ID } from "@shared/contracts";
import {
  normalizePermissions,
  DEFAULT_USER_PERMISSIONS,
  type Permissions,
  type SiteRole,
} from "@shared/permissions";

export type PublicAdmin = {
  id: string;
  username: string;
  contract: string;
  role: SiteRole;
  setor: string | null;
  permissions: Permissions;
  createdAt: Date;
  organizationId: string | null;
  /** Só diz SE a 2FA está ativa — nunca o segredo em si nem os códigos de
   * backup, que ficam só no servidor. */
  hasTwoFactorEnabled: boolean;
};

export function toPublic(row: Admin): PublicAdmin {
  const role = (row.role === "admin" ? "admin" : "user") as SiteRole;
  return {
    id: row.id,
    username: row.username,
    contract: row.contract || DEFAULT_CONTRACT_SLUG,
    role,
    setor: row.setor ?? null,
    permissions: normalizePermissions(row.permissions, role),
    createdAt: row.createdAt,
    organizationId: row.organizationId ?? null,
    hasTwoFactorEnabled: !!row.twoFactorSecret,
  };
}

/**
 * organizationId null = vê todos (só o acesso mestre de recuperação, que
 * não pertence a nenhuma organização específica, chega com null aqui —
 * mesmo espírito de siteContract:null). Uma conta nomeada com papel
 * "admin" só vê as contas da PRÓPRIA organização (achado de auditoria de
 * segurança, 07/09: antes retornava tudo, de qualquer organização).
 */
export async function listAdmins(organizationId: string | null): Promise<PublicAdmin[]> {
  const db = await getDb();
  if (!db) return [];

  const rows =
    organizationId === null
      ? await db.select().from(admins)
      : await db.select().from(admins).where(eq(admins.organizationId, organizationId));
  return rows
    .map(toPublic)
    .sort((a, b) => {
      // administradores primeiro, depois ordem alfabética
      if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
      return a.username.localeCompare(b.username);
    });
}

/**
 * organizationId null = conta globalmente (só faz sentido pro acesso
 * mestre de recuperação, que não pertence a organização nenhuma).
 * Achado de auditoria de segurança (07/09): antes sempre contava
 * globalmente — isso permitia remover o ÚLTIMO administrador de UMA
 * organização específica, desde que existisse admin em OUTRA
 * organização (o total geral parecia "seguro", mas aquela organização
 * ficava sem nenhum administrador).
 */
export async function countAdminsByRole(role: SiteRole, organizationId: string | null): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const condition =
    organizationId === null
      ? eq(admins.role, role)
      : and(eq(admins.role, role), eq(admins.organizationId, organizationId));
  const rows = await db.select().from(admins).where(condition);
  return rows.length;
}

/**
 * Decide o que fazer com as linhas encontradas por nome de usuário —
 * função pura, separada da consulta em si, pra dar pra testar isolada
 * (a parte que realmente importa proteger contra erro).
 *
 * Antes de existir mais de uma organização, um nome de usuário só podia
 * bater com uma linha (era único globalmente). Agora que a unicidade é
 * por organização (ver migração 0041), duas organizações diferentes já
 * PODEM ter, cada uma, um admin com o mesmo nome de usuário — e o login
 * de hoje ainda não pergunta "de qual organização" (isso fica pra
 * quando o cadastro público de organização existir). Enquanto isso não
 * existir, mais de uma linha aqui significa uma colisão real: em vez de
 * arriscar logar a pessoa como o admin ERRADO (de outra organização),
 * falha de forma segura — a própria criação de admin já impede esse
 * caso na entrada (ver createAdmin/createOrganizationWithOwner), então
 * isso só dispararia se os dados chegassem de outro jeito (importação
 * manual, etc.).
 */
export function pickUnambiguousAdmin(rows: Admin[]): Admin | undefined {
  if (rows.length > 1) return undefined;
  return rows[0];
}

export async function getAdminByUsername(username: string): Promise<Admin | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(admins)
    .where(eq(admins.username, username.trim().toLowerCase()));

  const result = pickUnambiguousAdmin(rows);
  if (!result && rows.length > 1) {
    console.error(
      `[Admins] Nome de usuário "${username}" existe em mais de uma organização — login bloqueado por segurança até isso ser corrigido manualmente no banco.`
    );
  }
  return result;
}

// Cache curto das contas. A checagem de permissão roda em TODA requisição, e
// sem isso cada request virava uma consulta extra ao banco. O TTL baixo mantém
// as mudanças de permissão praticamente imediatas.
const ADMIN_CACHE_TTL_MS = 10_000;
const adminCache = new Map<string, { value: PublicAdmin | undefined; at: number }>();

export function invalidateAdminCache(id?: string) {
  if (id) adminCache.delete(id);
  else adminCache.clear();
}

export async function getAdminById(id: string): Promise<PublicAdmin | undefined> {
  const cached = adminCache.get(id);
  if (cached && Date.now() - cached.at < ADMIN_CACHE_TTL_MS) {
    return cached.value;
  }

  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(admins).where(eq(admins.id, id));
  const value = rows[0] ? toPublic(rows[0]) : undefined;
  adminCache.set(id, { value, at: Date.now() });
  return value;
}

/** Busca a linha crua (com passwordHash, twoFactorSecret etc) — nunca
 * cacheada de propósito, dado sensível demais pra arriscar servir uma
 * versão desatualizada. Usada só pelo fluxo de 2FA. */
export async function getAdminRowById(id: string): Promise<Admin | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(admins).where(eq(admins.id, id));
  return rows[0];
}

/** Ativa 2FA de verdade — só chamado depois que o código de confirmação
 * já bateu (ver server/two-factor-auth.ts e a rota confirm2FASetup). */
export async function setAdminTwoFactor(id: string, secret: string, backupCodesJson: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(admins).set({ twoFactorSecret: secret, twoFactorBackupCodes: backupCodesJson }).where(eq(admins.id, id));
  invalidateAdminCache(id);
}

/** Atualiza só a lista de códigos de backup restantes (depois de um ser
 * consumido) — sem mexer no segredo TOTP. */
export async function updateAdminBackupCodes(id: string, backupCodesJson: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(admins).set({ twoFactorBackupCodes: backupCodesJson }).where(eq(admins.id, id));
}

/** Desativa 2FA — apaga segredo e códigos de backup. */
export async function clearAdminTwoFactor(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(admins).set({ twoFactorSecret: null, twoFactorBackupCodes: null }).where(eq(admins.id, id));
  invalidateAdminCache(id);
}

export async function createAdmin(input: {
  id: string;
  username: string;
  contract: string;
  passwordHash: string;
  role: SiteRole;
  setor?: string | null;
  permissions?: Permissions;
  /** Organização dona desta conta — hoje só existe uma (a padrão), então
   * quem não passar cai nela automaticamente. Quando a organização nova
   * é criada pelo próprio cadastro (createOrganizationWithOwner), passa
   * o id da organização recém-criada aqui. */
  organizationId?: string;
}): Promise<PublicAdmin> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalizedUsername = input.username.trim().toLowerCase();
  const permissions =
    input.role === "admin" ? null : JSON.stringify(input.permissions ?? DEFAULT_USER_PERMISSIONS);
  const organizationId = input.organizationId ?? DEFAULT_ORGANIZATION_ID;

  await db.insert(admins).values({
    id: input.id,
    username: normalizedUsername,
    contract: input.contract,
    passwordHash: input.passwordHash,
    role: input.role,
    setor: input.setor?.trim() || null,
    permissions,
    organizationId,
  });

  return {
    id: input.id,
    username: normalizedUsername,
    contract: input.contract,
    role: input.role,
    setor: input.setor?.trim() || null,
    permissions: normalizePermissions(permissions, input.role),
    createdAt: new Date(),
    organizationId,
    hasTwoFactorEnabled: false,
  };
}

export async function updateAdminSetor(id: string, setor: string | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(admins)
    .set({ setor: setor?.trim() || null })
    .where(eq(admins.id, id));
  invalidateAdminCache(id);
}

/** Setores já em uso neste contrato — pra sugerir na hora de criar um
 * grupo automático, em vez da pessoa ter que lembrar o nome exato. */
export async function listSetores(contract: string): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(admins).where(eq(admins.contract, contract));
  const setores = new Set<string>();
  for (const row of rows) {
    if (row.setor) setores.add(row.setor);
  }
  return Array.from(setores).sort();
}

/** Nomes de usuário de todo mundo com esse setor, neste contrato — usado
 * pra resolver quem entra num grupo automático. */
export async function listUsernamesBySetor(contract: string, setor: string): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(admins).where(eq(admins.contract, contract));
  return rows.filter((r) => r.setor?.toLowerCase() === setor.toLowerCase()).map((r) => r.username);
}

export async function updateAdminPermissions(
  id: string,
  permissions: Permissions
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(admins)
    .set({ permissions: JSON.stringify(permissions) })
    .where(eq(admins.id, id));
  invalidateAdminCache(id);
}

export async function deleteAdmin(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(admins).where(eq(admins.id, id));
  invalidateAdminCache(id);
}
