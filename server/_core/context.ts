import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getSiteSession } from "../site-auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  isSiteAdmin: boolean;
  siteAdminUsername: string | null;
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

  return {
    req: opts.req,
    res: opts.res,
    user,
    isSiteAdmin: siteSession.isSiteAdmin,
    siteAdminUsername: siteSession.username,
  };
}
