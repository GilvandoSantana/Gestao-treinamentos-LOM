/**
 * Organização (empresa dona da conta) — camada acima de "contrato", pra
 * multi-empresa de verdade. Ver comentário completo em drizzle/schema.ts.
 *
 * Cria organização + primeiro administrador ("dono") de duas formas:
 * createOrganizationWithOwner (direto, usado internamente) e
 * finalizePaidSignup (depois de confirmar pagamento via Stripe — ver
 * server/routers/signup.ts, que é quem expõe isso pra rota pública).
 */

import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { organizations, type Organization } from "../drizzle/schema";
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
 * Finaliza um cadastro pendente DEPOIS do pagamento confirmado — cria a
 * organização e o administrador de verdade, salva os dados da assinatura,
 * e apaga o registro pendente. IDEMPOTENTE de propósito: tanto o webhook
 * do Stripe quanto a página de "pagamento concluído" (fallback caso o
 * webhook demore) podem chamar isso pro MESMO cadastro pendente — se já
 * tiver sido finalizado por um dos dois (registro pendente já apagado),
 * devolve null em vez de tentar criar tudo de novo.
 */
export async function finalizePaidSignup(
  pendingSignupId: string,
  stripe: { customerId: string; subscriptionId: string; subscriptionStatus: string }
): Promise<{ organization: Organization; admin: PublicAdmin } | null> {
  const pending = await getPendingSignupById(pendingSignupId);
  if (!pending) return null; // já finalizado por outro caminho, ou nunca existiu

  let result: { organization: Organization; admin: PublicAdmin };
  try {
    result = await createOrganizationWithOwner({
      organizationName: pending.organizationName,
      organizationSlug: pending.organizationSlug,
      adminUsername: pending.adminUsername,
      adminPasswordHash: pending.passwordHash,
    });
  } catch (error) {
    // Corrida real possível: o webhook do Stripe e a página de "pagamento
    // concluído" (fallback) podem chegar quase ao mesmo tempo, os dois
    // vendo o pendente ainda existir antes de qualquer um apagar. Se o
    // erro for justamente "já existe" (a MESMA mensagem que
    // createOrganizationWithOwner lança nesse caso), quem ganhou a
    // corrida já criou tudo — busca o resultado em vez de falhar.
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Já existe uma organização") || message.includes("nome de usuário já está em uso")) {
      const existingOrg = await getOrganizationBySlug(pending.organizationSlug);
      const existingAdminRow = await getAdminByUsername(pending.adminUsername);
      if (existingOrg && existingAdminRow) {
        await deletePendingSignup(pending.id);
        return { organization: existingOrg, admin: toPublic(existingAdminRow) };
      }
    }
    throw error;
  }

  await setOrganizationStripeInfo(result.organization.id, {
    stripeCustomerId: stripe.customerId,
    stripeSubscriptionId: stripe.subscriptionId,
    subscriptionStatus: stripe.subscriptionStatus,
  });

  await deletePendingSignup(pending.id);

  return result;
}
