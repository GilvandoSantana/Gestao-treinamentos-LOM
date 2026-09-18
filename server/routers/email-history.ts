import { requirePermission, router } from "../_core/trpc";
import { getDb } from "../db";
import { emailNotifications, employees, trainings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const emailHistoryRouter = router({
    // Achado de auditoria de segurança (18/09): esta consulta não filtrava
    // por contrato, então qualquer admin/usuário com permissão
    // 'viewEmployees', mesmo restrito a um único contrato, conseguia ver
    // o histórico de e-mail de TODAS as empresas cadastradas no
    // sistema. Agora, quando ctx.siteContract existe (usuário de uma
    // organização específica), o join com employees é usado também como
    // filtro. Quando é null (administrador da plataforma, sem organização
    // vinculada), mantém o comportamento antigo de ver tudo — mesmo padrão
    // já usado em auth.activity.list.
    list: requirePermission('viewEmployees').query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        return [];
      }

      try {
        const history = await db
          .select({
            id: emailNotifications.id,
            trainingId: emailNotifications.trainingId,
            employeeId: emailNotifications.employeeId,
            lastSentAt: emailNotifications.lastSentAt,
            createdAt: emailNotifications.createdAt,
            trainingName: trainings.name,
            employeeName: employees.name,
            expirationDate: trainings.expirationDate,
          })
          .from(emailNotifications)
          .leftJoin(trainings, eq(emailNotifications.trainingId, trainings.id))
          .leftJoin(employees, eq(emailNotifications.employeeId, employees.id))
          .where(ctx.siteContract ? eq(employees.contract, ctx.siteContract) : undefined);

        // Sort by lastSentAt descending (most recent first)
        return history.sort((a, b) => {
          const dateA = new Date(a.lastSentAt).getTime();
          const dateB = new Date(b.lastSentAt).getTime();
          return dateB - dateA;
        });
      } catch (error) {
        console.error("Error fetching email history:", error);
        return [];
      }
    }),
  });
