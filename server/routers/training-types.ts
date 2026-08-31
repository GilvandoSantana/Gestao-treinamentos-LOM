import { v4 as uuidv4 } from "uuid";
import { masterAdminProcedure, requirePermission, router } from "../_core/trpc";
import { z } from "zod";
import {
  createTrainingType,
  deleteTrainingType,
  listTrainingTypes,
  updateTrainingType,
} from "../db-training-types";
import { logActivity } from "../db-activity";

export const trainingTypesRouter = router({
    list: requirePermission('viewEmployees').query(async () => {
      return listTrainingTypes();
    }),

    create: masterAdminProcedure
      .input(
        z.object({
          name: z.string().trim().min(2, "Informe o nome do treinamento").max(150),
          validityMonths: z.number().int().min(1, "A validade deve ser de pelo menos 1 mês").max(120),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const type = await createTrainingType(uuidv4(), input.name, input.validityMonths);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "trainingType.create",
          targetType: "trainingType",
          targetId: type.id,
          targetName: `${type.name} (${type.validityMonths} meses)`,
        });
        return type;
      }),

    update: masterAdminProcedure
      .input(
        z.object({
          id: z.string(),
          name: z.string().trim().min(2).max(150),
          validityMonths: z.number().int().min(1).max(120),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await updateTrainingType(input.id, input.name, input.validityMonths);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "trainingType.update",
          targetType: "trainingType",
          targetId: input.id,
          targetName: `${input.name} (${input.validityMonths} meses)`,
        });
        return { success: true } as const;
      }),

    delete: masterAdminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await deleteTrainingType(input.id);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "trainingType.delete",
          targetType: "trainingType",
          targetId: input.id,
        });
        return { success: true } as const;
      }),
  });
