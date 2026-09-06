/**
 * Organização (empresa dona da conta) — camada acima de "contrato", pra
 * multi-empresa de verdade. Ver comentário completo em drizzle/schema.ts.
 *
 * Este módulo tem a capacidade de CRIAR uma organização nova + seu
 * primeiro administrador ("dono") — a base do futuro cadastro público.
 * Ainda NÃO existe nenhuma rota pública que chame isso: falta construir
 * a tela em si, com proteção contra abuso (limite de tentativas, e-mail
 * de confirmação — o mesmo cuidado que já existe em outros lugares
 * sensíveis deste sistema, como o limite de tentativas de login).
 */

import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { organizations, type Organization } from "../drizzle/schema";
import { getDb } from "./db";
import { createAdmin, getAdminByUsername, type PublicAdmin } from "./db-admins";

export async function getOrganizationBySlug(slug: string): Promise<Organization | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(organizations).where(eq(organizations.slug, slug.trim().toLowerCase()));
  return rows[0];
}

export async function getOrganizationById(id: string): Promise<Organization | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(organizations).where(eq(organizations.id, id));
  return rows[0];
}

/**
 * Cria uma organização nova com seu primeiro administrador ("dono", papel
 * "admin" — igual ao administrador principal de hoje, só que dono só da
 * organização dele, não de todas). Rejeita se o slug da organização ou o
 * nome de usuário do administrador já existirem — o nome de usuário é
 * checado GLOBALMENTE (não só dentro da organização nova), pelo mesmo
 * motivo documentado em getAdminByUsername: o login ainda não sabe
 * desambiguar por organização.
 *
 * Recebe a senha JÁ EM HASH (não em texto puro) — quem chama essa função
 * é o fluxo de confirmação por e-mail (signup.verify), que só tem o hash
 * guardado (a senha em texto puro nunca fica salva em lugar nenhum,
 * nem temporariamente, entre o cadastro e a confirmação).
 */
export async function createOrganizationWithOwner(input: {
  organizationName: string;
  organizationSlug: string;
  adminUsername: string;
  adminPasswordHash: string;
}): Promise<{ organization: Organization; admin: PublicAdmin }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível.");

  const slug = input.organizationSlug.trim().toLowerCase();
  const existingOrg = await getOrganizationBySlug(slug);
  if (existingOrg) {
    throw new Error("Já existe uma organização com esse identificador.");
  }

  const existingAdmin = await getAdminByUsername(input.adminUsername);
  if (existingAdmin) {
    throw new Error("Esse nome de usuário já está em uso.");
  }

  const organizationId = uuidv4();
  await db.insert(organizations).values({
    id: organizationId,
    slug,
    name: input.organizationName.trim(),
  });

  const admin = await createAdmin({
    id: uuidv4(),
    username: input.adminUsername,
    passwordHash: input.adminPasswordHash,
    // "admin" enxerga tudo dentro da própria organização (o campo
    // "contract" não importa pra esse papel — ver comentário em
    // server/_core/context.ts sobre siteContract). Organização nova
    // ainda não tem nenhum contrato cadastrado; o dono cria pela tela
    // "Gerenciar Contratos" depois de entrar.
    contract: slug,
    role: "admin",
    organizationId,
  });

  const organization = await getOrganizationById(organizationId);
  if (!organization) throw new Error("Falha ao criar a organização.");

  return { organization, admin };
}
