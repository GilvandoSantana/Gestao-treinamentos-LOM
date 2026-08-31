import { requirePermission, router } from "../_core/trpc";
import { getDb } from "../db";
import { emailNotifications, employees, trainings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const emailHistoryRouter = router({
    list: requirePermission('viewEmployees').query(async () => {
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
          .leftJoin(employees, eq(emailNotifications.employeeId, employees.id));

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
