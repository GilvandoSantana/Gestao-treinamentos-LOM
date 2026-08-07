import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getSiteSession } from "../site-auth";
import { getAdminById } from "../db-admins";
import { ALL_PERMISSIONS, type Permissions, type SiteRole } from "@shared/permissions";
import { isContract, type Contract } from "@shared/contracts";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  isSiteAdmin: boolean;
  siteAdminUsername: string | null;
  siteRole: SiteRole | null;
  sitePermissions: Permissions | null;
  /** Contrato do usuário. null = administrador principal (vê todos). */
  siteContract: Contract | null;
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
  let siteContract: Contract | null = null;

  if (siteSession.isSiteAdmin) {
    if (siteSession.adminId) {
      const account = await getAdminById(siteSession.adminId);
      if (account) {
        siteRole = account.role;
        sitePermissions = account.permissions;
        siteContract = account.contract;
      } else {
        // Conta removida enquanto a sessão ainda estava válida.
        siteRole = null;
        sitePermissions = null;
      }
    } else {
      // Login pela senha mestra (recuperação): acesso total.
      siteRole = "admin";
      sitePermissions = { ...ALL_PERMISSIONS };
    }
  }

  // Administrador escolhe no cabeçalho em qual contrato está trabalhando.
  // Sem escolha, continua vendo todos. Usuários comuns ignoram este cabeçalho.
  if (siteRole === "admin") {
    const header = opts.req.headers["x-active-contract"];
    const chosen = Array.isArray(header) ? header[0] : header;
    siteContract = isContract(chosen) ? chosen : null;
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
  };
}
