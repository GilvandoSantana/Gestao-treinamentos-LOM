import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import { getContractBySlug } from "./db-contracts";

/** Checks explicit slugs too: a validated active header cannot authorize another input. */
export async function requireContractAccess(ctx: TrpcContext, slug: string) {
  if (!ctx.isSiteAdmin || (ctx.siteRole !== "admin" && ctx.siteContract !== slug)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
  }
  const contract = await getContractBySlug(slug, ctx.siteOrganizationId);
  if (!contract || contract.deleted) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
  }
  return contract;
}
