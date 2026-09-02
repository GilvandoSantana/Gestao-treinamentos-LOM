import { siteAdminProcedure, requirePermission, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getOsRoleConfig, countOsRoleConfigs, saveOsRoleConfig } from "../db-os";
import { getContractBySlug } from "../db-contracts";
import { extractOsFieldsFromPgr } from "../pgr-extraction";

// Documentação — Ordem de Serviço (NR-01) por função. Cada contrato
// define, por função, os textos que preenchem a OS de quem exerce
// aquela função.
export const osConfigRouter = router({
  getByRole: siteAdminProcedure
    .input(z.object({ role: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.siteContract) return null;
      return getOsRoleConfig(ctx.siteContract, input.role);
    }),

  countByRole: siteAdminProcedure.query(async ({ ctx }) => {
    if (!ctx.siteContract) return {};
    return countOsRoleConfigs(ctx.siteContract);
  }),

  saveForRole: requirePermission('editEmployees')
    .input(
      z.object({
        role: z.string().min(1),
        area: z.string().max(255).nullish(),
        setorTrabalho: z.string().max(255).nullish(),
        maquinasEquipamentos: z.string().max(2000).nullish(),
        tarefas: z.string().max(4000).nullish(),
        agentesFisicos: z.string().max(2000).nullish(),
        agentesQuimicos: z.string().max(2000).nullish(),
        agentesBiologicos: z.string().max(2000).nullish(),
        agentesErgonomicos: z.string().max(2000).nullish(),
        agentesAcidentes: z.string().max(2000).nullish(),
        medidasAdministrativas: z.string().max(2000).nullish(),
        medidasEngenharia: z.string().max(2000).nullish(),
        episMinimos: z.string().max(2000).nullish(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.siteContract) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
      }
      const { role, ...rest } = input;
      await saveOsRoleConfig(ctx.siteContract, role, rest);
      return { success: true };
    }),

  // Sugestão automática: lê o PGR anexado no contrato e extrai, via IA,
  // os campos da função pedida — o admin revisa antes de salvar (nunca
  // grava direto).
  extractFromPgr: requirePermission('editEmployees')
    .input(z.object({ role: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.siteContract) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
      }
      const contract = await getContractBySlug(ctx.siteContract);
      if (!contract?.pgrFileUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Este contrato ainda não tem o PGR anexado. Anexe o PGR no cadastro do contrato antes de extrair os dados.",
        });
      }
      try {
        return await extractOsFieldsFromPgr(contract.pgrFileUrl, input.role);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Erro ao extrair dados do PGR.",
        });
      }
    }),
});
