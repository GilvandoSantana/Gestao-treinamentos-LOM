import { siteAdminProcedure, requirePermission, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getOsRoleConfig, countOsRoleConfigs, saveOsRoleConfig } from "../db-os";
import { getContractBySlug, setContractOsDefaults } from "../db-contracts";
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
        // esse campo, ver pgr-extraction.ts). "Medidas de Controle
        // Existentes" (Administrativas/Engenharia/EPI's Mínimos) NÃO é
        // por função — é padrão do contrato, ver getContractDefaults/
        // saveContractDefaults abaixo.
        area: z.string().trim().min(1, "Preencha a Área.").max(255),
        setorTrabalho: z.string().trim().min(1, "Preencha o Setor de Trabalho.").max(255),
        maquinasEquipamentos: z.string().trim().min(1, "Preencha Máquinas, Equipamentos e Ferramentas.").max(2000),
        tarefas: z.string().trim().min(1, "Preencha a Descrição das atividades / Tarefas.").max(4000),
        agentesFisicos: z.string().trim().min(1, "Preencha os Agentes Físicos.").max(2000),
        agentesQuimicos: z.string().trim().min(1, "Preencha os Agentes Químicos.").max(2000),
        agentesBiologicos: z.string().trim().min(1, "Preencha os Agentes Biológicos (use 'NA.' se não houver).").max(2000),
        agentesErgonomicos: z.string().trim().min(1, "Preencha os Agentes Ergonômicos.").max(2000),
        agentesAcidentes: z.string().trim().min(1, "Preencha os Agentes de Acidentes.").max(2000),
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

  // "Medidas de Controle Existentes" padrão do contrato (mesmo texto pra
  // todas as funções) — configurado uma vez, não por função. Aceita um
  // slug explícito (para gerar documentos de colaboradores de outros
  // contratos, fora do contrato ativo na sessão) com fallback pro
  // contrato ativo quando omitido.
  getContractDefaults: siteAdminProcedure
    .input(z.object({ slug: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const slug = input?.slug ?? ctx.siteContract;
      if (!slug) return null;
      const contract = await getContractBySlug(slug);
      if (!contract) return null;
      return {
        osMedidasAdministrativas: contract.osMedidasAdministrativas,
        osMedidasEngenharia: contract.osMedidasEngenharia,
        osEpisMinimos: contract.osEpisMinimos,
      };
    }),

  saveContractDefaults: requirePermission('editEmployees')
    .input(
      z.object({
        osMedidasAdministrativas: z.string().trim().min(1, "Preencha as Medidas Administrativas.").max(2000),
        osMedidasEngenharia: z.string().trim().min(1, "Preencha as Medidas de Engenharia.").max(2000),
        osEpisMinimos: z.string().trim().min(1, "Preencha os EPI's Mínimos.").max(2000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.siteContract) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato selecionado." });
      }
      const contract = await getContractBySlug(ctx.siteContract);
      if (!contract) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
      }
      await setContractOsDefaults(contract.id, input);
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
