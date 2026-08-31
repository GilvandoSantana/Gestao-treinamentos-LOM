import { v4 as uuidv4 } from "uuid";
import { masterAdminProcedure, requirePermission, router, siteAdminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { employees } from "../../drizzle/schema";
import { deleteFdsFromSupabase, uploadFdsToSupabase } from "../supabase-storage";
import {
  countContractUsage,
  createContract,
  getContractById,
  getContractBySlug,
  getContractsOverview,
  listContracts,
  permanentlyDeleteContract,
  removeContractPgr,
  restoreContract,
  setContractPgr,
  softDeleteContract,
  updateContract,
} from "../db-contracts";
import { createCustomField, deleteCustomField, listCustomFields } from "../db-contract-fields";
import { logActivity } from "../db-activity";

export const contractsRouter = router({
    // Nome do gestor de um contrato - usado no cracha padrao, liberado pra
    // qualquer usuario logado (nao so administrador principal), ja que e
    // so um nome de exibicao, nao um dado sensivel de gestao do contrato.
    getManagerName: siteAdminProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const contract = await getContractBySlug(input.slug);
        return {
          managerName: contract?.managerName ?? null,
          contractName: contract?.name ?? null,
          companyName: contract?.companyName ?? null,
          pgrFileUrl: contract?.pgrFileUrl ?? null,
        };
      }),

    list: masterAdminProcedure
      .input(z.object({ includeDeleted: z.boolean().default(false) }).optional())
      .query(async ({ input }) => {
        return listContracts(input?.includeDeleted ?? false);
      }),

    create: masterAdminProcedure
      .input(
        z.object({
          name: z.string().trim().min(2, "Informe o nome do contrato").max(120),
          preposition: z.enum(["do", "da"]),
          alertEmail: z.string().email().optional().or(z.literal("")),
          alertWhatsapp: z.string().optional().or(z.literal("")),
          managerName: z.string().trim().max(120).nullish(),
          companyName: z.string().trim().max(255).nullish(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const contract = await createContract({
          id: uuidv4(),
          name: input.name,
          preposition: input.preposition,
          alertEmail: input.alertEmail || null,
          alertWhatsapp: input.alertWhatsapp || null,
          managerName: input.managerName,
          companyName: input.companyName,
        });
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "contract.create",
          targetType: "contract",
          targetId: contract.id,
          targetName: contract.name,
        });
        return contract;
      }),

    update: masterAdminProcedure
      .input(
        z.object({
          id: z.string(),
          name: z.string().trim().min(2, "Informe o nome do contrato").max(120),
          preposition: z.enum(["do", "da"]),
          alertEmail: z.string().email().optional().or(z.literal("")),
          alertWhatsapp: z.string().optional().or(z.literal("")),
          managerName: z.string().trim().max(120).nullish(),
          companyName: z.string().trim().max(255).nullish(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const existing = await getContractById(input.id);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
        }
        await updateContract(input.id, {
          name: input.name,
          preposition: input.preposition,
          alertEmail: input.alertEmail || null,
          alertWhatsapp: input.alertWhatsapp || null,
          managerName: input.managerName,
          companyName: input.companyName,
        });
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "contract.update",
          targetType: "contract",
          targetId: input.id,
          targetName: input.name,
        });
        return { success: true } as const;
      }),

    // Move para a lixeira — reversível pelo restore.
    delete: masterAdminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getContractById(input.id);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
        }
        await softDeleteContract(input.id);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "contract.delete",
          targetType: "contract",
          targetId: input.id,
          targetName: existing.name,
        });
        return { success: true } as const;
      }),

    restore: masterAdminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getContractById(input.id);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
        }
        await restoreContract(input.id);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "contract.restore",
          targetType: "contract",
          targetId: input.id,
          targetName: existing.name,
        });
        return { success: true } as const;
      }),

    // Anexa (ou substitui) o PGR do contrato — pré-requisito para a geração
    // de Ordem de Serviço (ver fds.upload, tipo "os").
    uploadPgr: masterAdminProcedure
      .input(
        z.object({
          id: z.string(),
          fileName: z.string(),
          fileData: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const existing = await getContractById(input.id);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
        }

        const fileBuffer = Buffer.from(input.fileData, "base64");
        const MAX_PGR_BYTES = 10 * 1024 * 1024;
        if (fileBuffer.length > MAX_PGR_BYTES) {
          throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "O arquivo excede o limite de 10MB." });
        }

        // Se já havia um PGR anexado, remove o arquivo antigo do Storage.
        if (existing.pgrFileUrl) {
          await deleteFdsFromSupabase(existing.pgrFileUrl);
        }

        const upload = await uploadFdsToSupabase(
          fileBuffer,
          input.fileName,
          "application/pdf",
          existing.slug,
          "contract-pgr"
        );

        await setContractPgr(input.id, { fileUrl: upload.url, fileName: input.fileName });

        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "contract.uploadPgr",
          targetType: "contract",
          targetId: input.id,
          targetName: existing.name,
        });
        return { success: true } as const;
      }),

    removePgr: masterAdminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getContractById(input.id);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
        }
        if (existing.pgrFileUrl) {
          await deleteFdsFromSupabase(existing.pgrFileUrl);
        }
        await removeContractPgr(input.id);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "contract.removePgr",
          targetType: "contract",
          targetId: input.id,
          targetName: existing.name,
        });
        return { success: true } as const;
      }),

    // Quantos colaboradores/contas/documentos ainda usam este contrato —
    // exibido na tela antes de permitir a exclusão definitiva.
    usage: masterAdminProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const existing = await getContractById(input.id);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
        }
        return countContractUsage(existing.slug);
      }),

    permanentDelete: masterAdminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getContractById(input.id);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
        }
        if (!existing.deleted) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Mova o contrato para a lixeira antes de excluir definitivamente.",
          });
        }
        const usage = await countContractUsage(existing.slug);
        if (usage.total > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Ainda há ${usage.total} registro(s) usando este contrato (${usage.employees} colaborador(es), ${usage.admins} conta(s), ${usage.documents} documento(s)). Reatribua-os antes de excluir definitivamente.`,
          });
        }
        await permanentlyDeleteContract(input.id);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "contract.permanentDelete",
          targetType: "contract",
          targetId: input.id,
          targetName: existing.name,
        });
        return { success: true } as const;
      }),

    // Panorama comparativo entre contratos — colaboradores e situação dos
    // treinamentos lado a lado, só para o administrador principal.
    overview: masterAdminProcedure.query(async () => {
      return getContractsOverview();
    }),

    // Campos personalizados por contrato.
    fields: router({
      // Qualquer pessoa logada — é o que monta o formulário de colaborador.
      // Usa o contrato da sessão por padrão (o próprio do usuário, ou o que
      // o admin escolheu no cabeçalho); o administrador pode informar
      // explicitamente outro contrato (usado na tela de Contratos, ao
      // gerenciar campos de um contrato diferente do que está ativo).
      list: requirePermission('viewEmployees')
        .input(z.object({ contractSlug: z.string().optional() }).optional())
        .query(async ({ input, ctx }) => {
          const slug = ctx.siteRole === "admin" && input?.contractSlug ? input.contractSlug : ctx.siteContract;
          if (!slug) return [];
          return listCustomFields(slug);
        }),

      // Gerenciar quais campos existem — só o administrador principal.
      create: masterAdminProcedure
        .input(
          z.object({
            contractSlug: z.string().min(1),
            label: z.string().trim().min(2, "Informe o nome do campo").max(120),
            fieldType: z.enum(["text", "number", "date"]),
          })
        )
        .mutation(async ({ input, ctx }) => {
          const field = await createCustomField({ ...input, id: uuidv4() });
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "contract.fieldCreate",
            targetType: "contractField",
            targetId: field.id,
            targetName: `${input.contractSlug}: ${field.label}`,
          });
          return field;
        }),

      delete: masterAdminProcedure
        .input(z.object({ id: z.string(), contractSlug: z.string() }))
        .mutation(async ({ input, ctx }) => {
          await deleteCustomField(input.id, input.contractSlug);
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "contract.fieldDelete",
            targetType: "contractField",
            targetId: input.id,
          });
          return { success: true } as const;
        }),
    }),
  });
