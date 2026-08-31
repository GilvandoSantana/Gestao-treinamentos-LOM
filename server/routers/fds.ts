import { v4 as uuidv4 } from "uuid";
import { masterAdminProcedure, requirePermission, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { deleteFdsFromSupabase, uploadFdsToSupabase } from "../supabase-storage";
import {
  createSafetySheet,
  deleteSafetySheet,
  getSafetySheetById,
  listSafetySheets,
  setSafetySheetContract,
  updateSafetySheetRoles,
} from "../db-fds";
import { DOCUMENT_TYPES } from "@shared/document-types";
import { DEFAULT_CONTRACT_SLUG } from "@shared/contracts";
import { getContractBySlug } from "../db-contracts";
import { logActivity } from "../db-activity";

export const fdsRouter = router({
    list: requirePermission('viewCertificates')
      .input(z.object({ type: z.enum(DOCUMENT_TYPES).optional() }).optional())
      .query(async ({ input, ctx }) => {
        return listSafetySheets(input?.type, ctx.siteContract ?? undefined);
      }),

    // Reatribuir documento para outro contrato — SOMENTE o administrador.
    changeContract: masterAdminProcedure
      .input(z.object({ id: z.string(), contractSlug: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const contract = await getContractBySlug(input.contractSlug);
        if (!contract || contract.deleted) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato inválido ou excluído." });
        }
        await setSafetySheetContract(input.id, input.contractSlug);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "fds.update",
          targetType: "document",
          targetId: input.id,
          details: `movido para ${contract.name}`,
        });
        return { success: true } as const;
      }),

    upload: requirePermission('manageCertificates')
      .input(
        z.object({
          type: z.enum(DOCUMENT_TYPES).default('fds'),
          name: z.string().trim().min(1, "Informe o nome do documento").max(255),
          fileName: z.string(),
          fileData: z.string(),
          roles: z.array(z.string()).default([]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.siteRole === "admin" && !ctx.siteContract) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Escolha um contrato no cabeçalho antes de cadastrar um documento.",
          });
        }

        const fileBuffer = Buffer.from(input.fileData, "base64");

        const MAX_FDS_BYTES = 10 * 1024 * 1024;
        if (fileBuffer.length > MAX_FDS_BYTES) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: "O arquivo excede o limite de 10MB.",
          });
        }

        const contract = ctx.siteContract ?? DEFAULT_CONTRACT_SLUG;
        const upload = await uploadFdsToSupabase(fileBuffer, input.fileName, "application/pdf", contract, input.type);

        const sheet = await createSafetySheet({
          id: uuidv4(),
          type: input.type,
          contract,
          name: input.name,
          fileName: input.fileName,
          fileUrl: upload.url,
          fileSize: fileBuffer.length,
          roles: input.roles,
        });

        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "fds.upload",
          targetType: "fds",
          targetId: sheet.id,
          targetName: sheet.name,
          details: input.roles.length ? `${input.roles.length} função(ões)` : "sem função vinculada",
        });

        return sheet;
      }),

    setRoles: requirePermission('manageCertificates')
      .input(z.object({ id: z.string(), roles: z.array(z.string()) }))
      .mutation(async ({ input, ctx }) => {
        const sheet = await getSafetySheetById(input.id);
        if (!sheet) throw new TRPCError({ code: "NOT_FOUND", message: "FDS não encontrada." });

        await updateSafetySheetRoles(input.id, input.roles);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "fds.update",
          targetType: "fds",
          targetId: input.id,
          targetName: sheet.name,
        });
        return { success: true } as const;
      }),

    delete: requirePermission('manageCertificates')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const sheet = await getSafetySheetById(input.id);
        if (!sheet) return { success: true } as const;

        await deleteFdsFromSupabase(sheet.fileUrl);
        await deleteSafetySheet(input.id);

        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "fds.delete",
          targetType: "fds",
          targetId: input.id,
          targetName: sheet.name,
        });
        return { success: true } as const;
      }),
  });
