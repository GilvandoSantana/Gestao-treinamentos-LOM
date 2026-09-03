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
        // Todos os campos da OS são obrigatórios — não é possível salvar a
        // configuração de uma função sem preencher tudo. "Setor de
        // Trabalho" é sempre digitado manualmente (a IA nunca preenche
        // esse campo, ver pgr-extraction.ts).
        area: z.string().trim().min(1, "Preencha a Área.").max(255),
        setorTrabalho: z.string().trim().min(1, "Preencha o Setor de Trabalho.").max(255),
        maquinasEquipamentos: z.string().trim().min(1, "Preencha Máquinas, Equipamentos e Ferramentas.").max(2000),
        tarefas: z.string().trim().min(1, "Preencha a Descrição das atividades / Tarefas.").max(4000),
        agentesFisicos: z.string().trim().min(1, "Preencha os Agentes Físicos.").max(2000),
        agentesQuimicos: z.string().trim().min(1, "Preencha os Agentes Químicos.").max(2000),
        agentesBiologicos: z.string().trim().min(1, "Preencha os Agentes Biológicos (use 'NA.' se não houver).").max(2000),
        agentesErgonomicos: z.string().trim().min(1, "Preencha os Agentes Ergonômicos.").max(2000),
        agentesAcidentes: z.string().trim().min(1, "Preencha os Agentes de Acidentes.").max(2000),
        medidasAdministrativas: z.string().trim().min(1, "Preencha as Medidas Administrativas.").max(2000),
        medidasEngenharia: z.string().trim().min(1, "Preencha as Medidas de Engenharia.").max(2000),
        episMinimos: z.string().trim().min(1, "Preencha os EPIs Mínimos.").max(2000),
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
        return await extractOsFieldsFromPgr(contract.pgrFileUrl, input.role, ctx.siteContract);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Erro ao extrair dados do PGR.",
        });
      }
    }),
});
