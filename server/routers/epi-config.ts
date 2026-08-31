import { requirePermission, router, siteAdminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  countEpiRoleItemsByRole,
  listEpiResponsibleSuggestions,
  listEpiRoleItems,
  replaceEpiRoleItems,
} from "../db-epi";

export const epiConfigRouter = router({
    listByRole: siteAdminProcedure
      .input(z.object({ role: z.string() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.siteContract) return [];
        return listEpiRoleItems(ctx.siteContract, input.role);
      }),

    countByRole: siteAdminProcedure.query(async ({ ctx }) => {
      if (!ctx.siteContract) return {};
      return countEpiRoleItemsByRole(ctx.siteContract);
    }),

    responsibleSuggestions: siteAdminProcedure.query(async ({ ctx }) => {
      if (!ctx.siteContract) return [];
      return listEpiResponsibleSuggestions(ctx.siteContract);
    }),

    saveForRole: requirePermission('editEmployees')
      .input(
        z.object({
          role: z.string().min(1),
          items: z.array(
            z.object({
              quantity: z.number().int().min(1).max(999),
              specification: z.string().min(1).max(255),
              ca: z.string().max(50).nullish(),
              responsibleName: z.string().max(150).nullish(),
            })
          ),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.siteContract) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
        }
        await replaceEpiRoleItems(ctx.siteContract, input.role, input.items);
        return { success: true };
      }),
  });
