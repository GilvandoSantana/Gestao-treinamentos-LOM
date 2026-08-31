import { requirePermission, router } from "../_core/trpc";
import { z } from "zod";
import { deleteTraining } from "../db-employees";
import { logActivity } from "../db-activity";

export const trainingsRouter = router({
    delete: requirePermission('editEmployees')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          await deleteTraining(input.id);
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "training.delete",
            targetType: "training",
            targetId: input.id,
          });
          return { success: true };
        } catch (error) {
          console.error("Delete training error:", error);
          throw error;
        }
      }),
  });
