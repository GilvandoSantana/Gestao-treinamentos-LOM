/**
 * Organização (empresa dona da conta) — camada acima de "contrato", pra
 * multi-empresa de verdade. Ver comentário completo em drizzle/schema.ts.
 *
 * Cria organização + primeiro administrador ("dono") de duas formas:
 * createOrganizationWithOwner (direto, usado internamente) e
 * finalizePaidSignup (depois de confirmar pagamento via Stripe — ver
 * server/routers/signup.ts, que é quem expõe isso pra rota pública).
 */

import { eq, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { organizations, admins, pendingSignups, completedSignups, type Organization } from "../drizzle/schema";
import { getDb } from "./db";
import { createAdmin, getAdminByUsername, toPublic, type PublicAdmin } from "./db-admins";
import { getPendingSignupById, deletePendingSignup } from "./db-pending-signups";

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

export async function setOrganizationStripeInfo(
  organizationId: string,
  info: { stripeCustomerId: string; stripeSubscriptionId: string; subscriptionStatus: string }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(organizations).set(info).where(eq(organizations.id, organizationId));
}

/**
 * Ideia 5 do Gilvando (modelo de pasta padrão): lista de nomes de pasta
 * sugerida ao criar um contrato novo. Guardada como JSON — uma lista
 * simples de string, sem necessidade de tabela própria.
 */
export async function getFolderTemplate(organizationId: string | null): Promise<string[]> {
  if (!organizationId) return [];
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  const raw = rows[0]?.folderTemplate;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}

export async function setFolderTemplate(organizationId: string, folderNames: string[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const cleaned = folderNames.map((n) => n.trim()).filter(Boolean);
  await db.update(organizations).set({ folderTemplate: JSON.stringify(cleaned) }).where(eq(organizations.id, organizationId));
}

/** Additive migration, safe to run on every startup and concurrent replicas. */
export async function ensureIntegrityTables() {
  const db = await getDb();
  if (!db) return;
  try { await db.execute(sql`ALTER TABLE desktopInstaller ADD COLUMN sha512 VARCHAR(88) NULL`); }
  catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME' && error?.cause?.code !== 'ER_DUP_FIELDNAME') throw error;
  }
  for (const table of ['cloudFolders', 'cloudFiles']) {
    try { await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN trashBatchId VARCHAR(64) NULL`)); }
    catch (error: any) {
      if (error?.code !== 'ER_DUP_FIELDNAME' && error?.cause?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  await db.execute(sql`CREATE TABLE IF NOT EXISTS employeePortalInvitations (
    employeeId VARCHAR(64) PRIMARY KEY,
    tokenHash VARCHAR(64) NOT NULL,
    expiresAt TIMESTAMP NOT NULL
  ) ENGINE=InnoDB`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS completedSignups (
    pendingSignupId VARCHAR(64) PRIMARY KEY,
    checkoutSessionId VARCHAR(255) NOT NULL UNIQUE,
    organizationId VARCHAR(64) NOT NULL,
    adminId VARCHAR(64) NOT NULL,
    customerId VARCHAR(255) NOT NULL,
    subscriptionId VARCHAR(255) NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS cloudStorageReservations (
    id VARCHAR(64) PRIMARY KEY,
    contractSlug VARCHAR(60) NOT NULL,
    bytes BIGINT NOT NULL,
    expiresAt TIMESTAMP NOT NULL,
    INDEX reservation_contract (contractSlug)
  ) ENGINE=InnoDB`);

}

/** A checkout is finalized once, even when return and webhook arrive together. */
export async function finalizePaidSignup(
  pendingSignupId: string,
  stripe: { checkoutSessionId: string; customerId: string; subscriptionId: string; subscriptionStatus: string }
): Promise<{ organization: Organization; admin: PublicAdmin } | null> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível.");
  return db.transaction(async tx => {
    // Lock the pending row before checking the durable result. A waiting caller
    // reads the committed receipt after the first transaction removes pending.
    const [pending] = await tx.select().from(pendingSignups)
      .where(eq(pendingSignups.id, pendingSignupId)).for('update');
    const [receipt] = await tx.select().from(completedSignups)
      .where(eq(completedSignups.pendingSignupId, pendingSignupId)).for('update');
    if (receipt) {
      if (receipt.checkoutSessionId !== stripe.checkoutSessionId || receipt.customerId !== stripe.customerId || receipt.subscriptionId !== stripe.subscriptionId) {
        throw new Error("Este cadastro já foi concluído por outro pagamento.");
      }
      const [organization] = await tx.select().from(organizations).where(eq(organizations.id, receipt.organizationId));
      const [admin] = await tx.select().from(admins).where(and(eq(admins.id, receipt.adminId), eq(admins.organizationId, receipt.organizationId)));
      if (!organization || !admin) throw new Error("Cadastro concluído não está mais disponível. Entre em contato com o suporte.");
      return { organization, admin: toPublic(admin) };
    }
    if (!pending) {
      // Compatibility with checkouts completed before receipts existed. Never
      // infer ownership from a matching username or organization slug alone.
      const [organization] = await tx.select().from(organizations).where(and(
        eq(organizations.stripeCustomerId, stripe.customerId), eq(organizations.stripeSubscriptionId, stripe.subscriptionId)
      ));
      if (!organization) return null;
      const [admin] = await tx.select().from(admins).where(and(eq(admins.organizationId, organization.id), eq(admins.role, 'admin')));
      return admin ? { organization, admin: toPublic(admin) } : null;
    }
    const username = pending.adminUsername.trim().toLowerCase();
    const [collision] = await tx.select().from(admins).where(eq(admins.username, username));
    if (collision) throw new Error("Esse nome de usuário já está em uso. Entre em contato com o suporte.");
    const organizationId = uuidv4(), adminId = uuidv4();
    await tx.insert(organizations).values({ id: organizationId, slug: pending.organizationSlug,
      name: pending.organizationName, stripeCustomerId: stripe.customerId,
      stripeSubscriptionId: stripe.subscriptionId, subscriptionStatus: stripe.subscriptionStatus });
    await tx.insert(admins).values({ id: adminId, organizationId, username,
      passwordHash: pending.passwordHash, contract: pending.organizationSlug, role: 'admin', permissions: null });
    await tx.insert(completedSignups).values({ pendingSignupId, checkoutSessionId: stripe.checkoutSessionId,
      organizationId, adminId, customerId: stripe.customerId, subscriptionId: stripe.subscriptionId });
    await tx.delete(pendingSignups).where(eq(pendingSignups.id, pendingSignupId));
    const [organization] = await tx.select().from(organizations).where(eq(organizations.id, organizationId));
    const [admin] = await tx.select().from(admins).where(eq(admins.id, adminId));
    return { organization, admin: toPublic(admin) };
  }, { isolationLevel: 'read committed' });
}

