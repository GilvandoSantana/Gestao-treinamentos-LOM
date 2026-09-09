import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getSiteSession, getRawCookie, IMPERSONATION_BACKUP_COOKIE } from "../site-auth";
import { getContractBySlug, listContracts } from "../db-contracts";
import { getAdminById } from "../db-admins";
import { ALL_PERMISSIONS, type Permissions, type SiteRole } from "@shared/permissions";


export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  isSiteAdmin: boolean;
  siteAdminUsername: string | null;
  siteRole: SiteRole | null;
  sitePermissions: Permissions | null;
  /** Contrato do usuário. null = administrador principal (vê todos). */
  siteContract: string | null;
  /** null is reserved for the authenticated recovery/master account. */
  siteOrganizationId: string | null;
  /** A conta logada tem 2FA ativa? false pro login mestre (que não tem
   * linha própria na tabela admins). */
  siteHasTwoFactorEnabled: boolean;
  /** Um administrador está "vendo como" outro usuário nesta sessão. */
  isImpersonating: boolean;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  const siteSession = await getSiteSession(opts.req);

  // As permissões vêm SEMPRE do banco, nunca do cookie: assim, se o
  // administrador mudar o que alguém pode fazer, vale na hora, sem precisar
  // esperar a sessão daquela pessoa expirar.
  let sitePermissions: Permissions | null = null;
  let siteRole: SiteRole | null = siteSession.role;
  let siteContract: string | null = null;
  let siteOrganizationId: string | null = null;
  let siteHasTwoFactorEnabled = false;

  if (siteSession.isSiteAdmin) {
    if (siteSession.adminId) {
      const account = await getAdminById(siteSession.adminId);
      if (account && account.organizationId) {
        siteRole = account.role;
        sitePermissions = account.permissions;
        siteContract = account.contract;
        siteOrganizationId = account.organizationId;
        siteHasTwoFactorEnabled = account.hasTwoFactorEnabled;
      } else {
        // Conta removida enquanto a sessão ainda estava válida.
        siteRole = null;
        sitePermissions = null;
      }
    } else {
      // Login pela senha mestra (recuperação): acesso total, além de
      // uma organização só — siteOrganizationId fica null de propósito.
      siteRole = "admin";
      sitePermissions = { ...ALL_PERMISSIONS };
    }
  }

  if (siteRole === "admin") {
    const header = opts.req.headers["x-active-contract"];
    const chosen = Array.isArray(header) ? header[0] : header;
    const requested = typeof chosen === "string" && chosen.trim() ? chosen.trim() : null;
    if (siteOrganizationId !== null) {
      // An organization admin never receives the platform-wide null scope.
      const contract = requested
        ? await getContractBySlug(requested, siteOrganizationId)
        : (await listContracts(false, siteOrganizationId))[0];
      siteContract = contract && !contract.deleted ? contract.slug : null;
    } else {
      siteContract = requested;
    }
  } else if (siteRole === "user" && siteContract && siteOrganizationId) {
    const contract = await getContractBySlug(siteContract, siteOrganizationId);
    if (!contract || contract.deleted) siteContract = null;
  }

  const stillValid = siteSession.isSiteAdmin && siteRole !== null;

  return {
    req: opts.req,
    res: opts.res,
    user,
    isSiteAdmin: stillValid,
    siteAdminUsername: stillValid ? siteSession.username : null,
    siteRole: stillValid ? siteRole : null,
    sitePermissions: stillValid ? sitePermissions : null,
    // Usuário comum: sempre o próprio contrato. Administrador: o que ele
    // escolheu no cabeçalho, ou null (todos).
    siteContract: stillValid ? siteContract : null,
    siteOrganizationId: stillValid ? siteOrganizationId : null,
    siteHasTwoFactorEnabled: stillValid ? siteHasTwoFactorEnabled : false,
    isImpersonating: !!getRawCookie(opts.req, IMPERSONATION_BACKUP_COOKIE),
  };
}

