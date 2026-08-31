import { v4 as uuidv4 } from "uuid";
import { masterAdminProcedure, requirePermission, router } from "../_core/trpc";
import { z } from "zod";
import { createCustomRole, deleteCustomRole, listCustomRoles } from "../db-roles";
import { logActivity } from "../db-activity";

export const rolesRouter = router({
    list: requirePermission('viewEmployees').query(async () => {
      return listCustomRoles();
    }),

    create: masterAdminProcedure
      .input(z.object({ name: z.string().trim().min(2, "Informe o nome da função").max(120) }))
      .mutation(async ({ input, ctx }) => {
        const role = await createCustomRole(uuidv4(), input.name);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "role.create",
          targetType: "role",
          targetId: role.id,
          targetName: role.name,
        });
        return role;
      }),

    delete: masterAdminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await deleteCustomRole(input.id);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "role.delete",
          targetType: "role",
          targetId: input.id,
        });
        return { success: true } as const;
      }),
  });
