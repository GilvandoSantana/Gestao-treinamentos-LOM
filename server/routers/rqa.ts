import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { organizationAdminProcedure, requirePermission, router } from "../_core/trpc";
import { computeRqaReport, getRqaEmployees, getRqaEntriesForMonth, saveRqaEntries } from "../db-rqa";
import { getContractBySlug, setRqaSettings } from "../db-contracts";
import { logActivity } from "../db-activity";

const YEAR_MONTH_REGEX = /^\d{4}-\d{2}$/;
const SITUACAO_VALUES = ["ATIVO", "FERIAS", "AFASTADO", "INATIVO"] as const;

export const rqaRouter = router({
  // Ideia do Gilvando (16/09) — substitui a planilha de Excel mensal.
  // Monta o relatório inteiro do mês (resumo, por líder, por área, por
  // colaborador com % alcançada/status/ranking) a partir dos lançamentos
  // já salvos — sem lançamento ainda, todo mundo aparece como
  // ATIVO/quantidade 0 (a pessoa que lança ajusta o que for diferente).
  getReport: requirePermission("viewRQA")
    .input(z.object({ yearMonth: z.string().regex(YEAR_MONTH_REGEX) }))
    .query(async ({ input, ctx }) => {
      if (!ctx.siteContract) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha um contrato no cabeçalho." });
      }
      const employeesList = await getRqaEmployees(ctx.siteContract);
      const entriesMap = await getRqaEntriesForMonth(
        employeesList.map((e) => e.id),
        input.yearMonth
      );
      const contract = await getContractBySlug(ctx.siteContract, ctx.siteOrganizationId);
      return computeRqaReport(employeesList, entriesMap, contract?.rqaMetaIndividual ?? 2);
    }),

  // Salva a lista inteira do mês visível de uma vez (não um lançamento
  // por vez) — é assim que a tela sempre manda.
  saveEntries: requirePermission("manageRQA")
    .input(
      z.object({
        yearMonth: z.string().regex(YEAR_MONTH_REGEX),
        entries: z
          .array(
            z.object({
              employeeId: z.string().min(1),
              quantidade: z.number().int().min(0),
              situacao: z.enum(SITUACAO_VALUES),
            })
          )
          .max(2000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.siteContract) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha um contrato no cabeçalho." });
      }
      // Confere que todo employeeId enviado pertence de verdade a este
      // contrato — sem essa checagem, alguém sabendo o UUID de um
      // colaborador de outro contrato conseguiria lançar RQA nele.
      const employeesList = await getRqaEmployees(ctx.siteContract);
      const validIds = new Set(employeesList.map((e) => e.id));
      const filtered = input.entries.filter((e) => validIds.has(e.employeeId));

      await saveRqaEntries(
        filtered.map((e) => ({ ...e, yearMonth: input.yearMonth })),
        ctx.siteAdminUsername ?? ""
      );

      void logActivity({
        username: ctx.siteAdminUsername,
        role: ctx.siteRole,
        action: "rqa.saveEntries",
        targetType: "rqa",
        targetId: input.yearMonth,
        targetName: `${filtered.length} lançamento(s) — ${input.yearMonth}`,
      });

      return { saved: filtered.length } as const;
    }),

  // Habilita/desabilita o módulo pra este contrato e ajusta a meta
  // individual — só administrador da organização (não conta comum).
  setSettings: organizationAdminProcedure
    .input(z.object({ enabled: z.boolean(), metaIndividual: z.number().int().min(1).max(100) }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.siteContract) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha um contrato no cabeçalho." });
      }
      const contract = await getContractBySlug(ctx.siteContract, ctx.siteOrganizationId);
      if (!contract) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
      }
      await setRqaSettings(contract.id, input);
      return { success: true } as const;
    }),
});
