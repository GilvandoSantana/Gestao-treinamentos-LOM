import { notifyOwner } from "./_core/notification";
import { sendEmail } from "./mailer";
import { getDb } from "./db";
import { eq, and, gte } from "drizzle-orm";
import { employees, trainings, emailNotifications } from "../drizzle/schema";
import { nanoid } from "nanoid";

export interface TrainingAlert {
  employeeName: string;
  trainingName: string;
  daysRemaining: number;
  expirationDate: string;
  status: "expiring_soon" | "expired";
  trainingId: string;
  employeeId: string;
}

/**
 * Calculate days remaining until training expiration
 */
export function calculateDaysRemaining(expirationDate: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expDate = new Date(expirationDate);
  expDate.setHours(0, 0, 0, 0);
  
  const timeDiff = expDate.getTime() - today.getTime();
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
}

/**
 * Check if email was already sent in the last 24 hours
 */
async function wasEmailSentInLast24Hours(trainingId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const result = await db
      .select()
      .from(emailNotifications)
      .where(
        and(
          eq(emailNotifications.trainingId, trainingId),
          gte(emailNotifications.lastSentAt, twentyFourHoursAgo)
        )
      )
      .limit(1);

    return result.length > 0;
  } catch (error) {
    console.error("[Email Service] Error checking last email sent:", error);
    return false;
  }
}

/**
 * Record email notification in database
 */
async function recordEmailNotification(trainingId: string, employeeId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    // Check if record exists
    const existing = await db
      .select()
      .from(emailNotifications)
      .where(eq(emailNotifications.trainingId, trainingId))
      .limit(1);

    if (existing.length > 0) {
      // Update existing record
      await db
        .update(emailNotifications)
        .set({ lastSentAt: new Date() })
        .where(eq(emailNotifications.trainingId, trainingId));
    } else {
      // Create new record
      await db.insert(emailNotifications).values({
        id: nanoid(),
        trainingId,
        employeeId,
        lastSentAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  } catch (error) {
    console.error("[Email Service] Error recording email notification:", error);
  }
}

/**
 * Get all trainings that need alerts (expiring within 30 days or already expired)
 * and haven't been emailed in the last 24 hours
 */
export async function getTrainingAlertsToSend(): Promise<TrainingAlert[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Email Service] Database not available");
    return [];
  }

  try {
    const allTrainings = await db
      .select({
        id: trainings.id,
        employeeId: trainings.employeeId,
        name: trainings.name,
        expirationDate: trainings.expirationDate,
        employeeName: employees.name,
      })
      .from(trainings)
      .leftJoin(employees, eq(trainings.employeeId, employees.id));

    const alerts: TrainingAlert[] = [];

    for (const training of allTrainings) {
      if (!training.expirationDate || !training.employeeName) continue;

      const daysRemaining = calculateDaysRemaining(new Date(training.expirationDate));

      // Alert if expiring within 30 days or already expired
      if (daysRemaining <= 30) {
        // Check if email was already sent in last 24 hours
        const alreadySent = await wasEmailSentInLast24Hours(training.id);
        
        if (!alreadySent) {
          alerts.push({
            employeeName: training.employeeName,
            trainingName: training.name || "Treinamento sem nome",
            daysRemaining,
            expirationDate: new Date(training.expirationDate).toLocaleDateString("pt-BR"),
            status: daysRemaining < 0 ? "expired" : "expiring_soon",
            trainingId: training.id,
            employeeId: training.employeeId,
          });
        }
      }
    }

    return alerts;
  } catch (error) {
    console.error("[Email Service] Error fetching training alerts:", error);
    return [];
  }
}

/**
 * Send email notification for training alerts
 */
export async function sendTrainingAlerts(): Promise<boolean> {
  try {
    const alerts = await getTrainingAlertsToSend();

    if (alerts.length === 0) {
      console.log("[Email Service] No training alerts to send");
      return true;
    }

    // Group alerts by status
    const expiringAlerts = alerts.filter((a) => a.status === "expiring_soon");
    const expiredAlerts = alerts.filter((a) => a.status === "expired");

    let emailContent = "<h2>Relatório de Treinamentos</h2>";

    if (expiredAlerts.length > 0) {
      emailContent += "<h3 style='color: #dc2626;'>⚠️ Treinamentos Vencidos</h3>";
      emailContent += "<ul>";
      for (const alert of expiredAlerts) {
        emailContent += `
          <li>
            <strong>${alert.employeeName}</strong> - ${alert.trainingName}
            <br/>
            <span style='color: #dc2626;'>Vencido há ${Math.abs(alert.daysRemaining)} dias (${alert.expirationDate})</span>
          </li>
        `;
      }
      emailContent += "</ul>";
    }

    if (expiringAlerts.length > 0) {
      emailContent += "<h3 style='color: #f59e0b;'>⏰ Treinamentos a Vencer</h3>";
      emailContent += "<ul>";
      for (const alert of expiringAlerts) {
        emailContent += `
          <li>
            <strong>${alert.employeeName}</strong> - ${alert.trainingName}
            <br/>
            <span style='color: #f59e0b;'>Vence em ${alert.daysRemaining} dias (${alert.expirationDate})</span>
          </li>
        `;
      }
      emailContent += "</ul>";
    }

    emailContent += `
      <hr/>
      <p><small>Total de alertas: ${alerts.length}</small></p>
      <p><small>Gerado em: ${new Date().toLocaleString("pt-BR")}</small></p>
    `;

    const result = await sendEmail({
      subject: `Relatório de Treinamentos - ${alerts.length} alertas`,
      html: emailContent,
    });

    // Notificação interna da plataforma original (best-effort, não crítica —
    // se falhar não impede o e-mail real de já ter sido enviado acima).
    notifyOwner({
      title: `Relatório de Treinamentos - ${alerts.length} alertas`,
      content: emailContent,
    }).catch(() => {});

    if (result) {
      console.log(`[Email Service] Successfully sent ${alerts.length} training alerts`);
      
      // Record each email notification
      for (const alert of alerts) {
        await recordEmailNotification(alert.trainingId, alert.employeeId);
      }
    } else {
      console.warn("[Email Service] Failed to send training alerts");
    }

    return result;
  } catch (error) {
    console.error("[Email Service] Error sending training alerts:", error);
    return false;
  }
}

/**
 * Schedule periodic email checks (call this from a cron job or interval)
 */
export function scheduleTrainingAlerts(intervalMinutes: number = 1440) {
  // Default to 24 hours (1440 minutes)
  const intervalMs = intervalMinutes * 60 * 1000;
  
  console.log(`[Email Service] Scheduling training alerts check every ${intervalMinutes} minutes`);
  
  // Run immediately on startup
  sendTrainingAlerts();
  
  // Then schedule for every interval
  setInterval(() => {
    sendTrainingAlerts();
  }, intervalMs);
}
