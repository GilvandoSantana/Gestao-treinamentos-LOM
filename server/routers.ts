import { COOKIE_NAME } from "@shared/const";
import { v4 as uuidv4 } from "uuid";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getAllEmployees, upsertEmployee, deleteEmployee, upsertTraining, getTrainingsByEmployeeId, deleteTraining, deleteTrainingsExcept } from "./db-employees";
import { getDb } from "./db";
import { emailNotifications, trainings, employees } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { uploadCertificate, getCertificatesByTrainingId, getCertificatesByEmployeeId, deleteCertificate, getCertificateById } from "./db-certificates";
import { uploadCertificateToSupabase, deleteCertificateFromSupabase, uploadPhotoToSupabase, getPhotoUrl } from "./supabase-storage";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  employees: router({
    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        try {
          await deleteEmployee(input.id);
          return { success: true };
        } catch (error) {
          console.error("Delete employee error:", error);
          throw error;
        }
      }),
    sync: publicProcedure
      .input(
        z.object({
          employees: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              registration: z.string().optional(),
              educationLevel: z.string().optional(),
              age: z.number().optional(),
              role: z.string(),
              trainings: z.array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                  completionDate: z.string(),
                  expirationDate: z.string(),
                })
              ),
            })
          ),
        })
      )
      .mutation(async ({ input }) => {
        try {
          for (const employee of input.employees) {
            // Upsert employee
            await upsertEmployee({
              id: employee.id,
              name: employee.name,
              registration: employee.registration,
              educationLevel: employee.educationLevel,
              age: employee.age,
              role: employee.role,
            });

            // Upsert trainings
            const currentTrainingIds = employee.trainings.map(t => t.id);
            
            // First, remove trainings that are no longer in the list
            await deleteTrainingsExcept(employee.id, currentTrainingIds);

            for (const training of employee.trainings) {
              await upsertTraining({
                id: training.id,
                employeeId: employee.id,
                name: training.name,
                completionDate: training.completionDate,
                expirationDate: training.expirationDate,
              });
            }
          }
          return { success: true, count: input.employees.length };
        } catch (error) {
          console.error("Sync error:", error);
          throw error;
        }
      }),
    list: publicProcedure.query(async () => {
      const employeeList = await getAllEmployees();
      const result = [];
      for (const emp of employeeList) {
        const trainings = await getTrainingsByEmployeeId(emp.id);
        // Get photo URL from Supabase Storage without database column
        const photoUrl = await getPhotoUrl(emp.id);
        result.push({
          ...emp,
          photoUrl,
          trainings,
        });
      }
      return result;
    }),

    uploadPhoto: publicProcedure
      .input(
        z.object({
          employeeId: z.string(),
          fileData: z.string(),
          mimeType: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const fileBuffer = Buffer.from(input.fileData, "base64");
          const uploadResult = await uploadPhotoToSupabase(
            fileBuffer,
            input.employeeId,
            input.mimeType || "image/jpeg"
          );
          return { url: uploadResult.url };
        } catch (error) {
          console.error("Photo upload error:", error);
          throw error;
        }
      }),
  }),

  trainings: router({
    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        try {
          await deleteTraining(input.id);
          return { success: true };
        } catch (error) {
          console.error("Delete training error:", error);
          throw error;
        }
      }),
  }),

  emailHistory: router({
    list: publicProcedure.query(async () => {
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
  }),

  certificates: router({
    upload: publicProcedure
      .input(
        z.object({
          trainingId: z.string(),
          employeeId: z.string(),
          fileName: z.string(),
          fileData: z.string().or(z.instanceof(Buffer)),
          mimeType: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const fileBuffer = typeof input.fileData === "string" 
            ? Buffer.from(input.fileData, "base64")
            : input.fileData;

          // Upload to Supabase
          const uploadResult = await uploadCertificateToSupabase(
            fileBuffer,
            input.fileName,
            input.mimeType || "application/octet-stream"
          );

          // Save to database
          const certificate = await uploadCertificate({
            id: uuidv4(),
            trainingId: input.trainingId,
            employeeId: input.employeeId,
            fileName: input.fileName,
            fileUrl: uploadResult.url,
            fileSize: uploadResult.size,
            mimeType: input.mimeType || "application/octet-stream",
          });

          return certificate;
        } catch (error) {
          console.error("Certificate upload error:", error);
          throw error;
        }
      }),

    getByTraining: publicProcedure
      .input(z.object({ trainingId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await getCertificatesByTrainingId(input.trainingId);
        } catch (error) {
          console.error("Error fetching certificates by training:", error);
          return [];
        }
      }),

    getByEmployee: publicProcedure
      .input(z.object({ employeeId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await getCertificatesByEmployeeId(input.employeeId);
        } catch (error) {
          console.error("Error fetching certificates by employee:", error);
          return [];
        }
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        try {
          const certificate = await getCertificateById(input.id);
          if (!certificate) {
            throw new Error("Certificate not found");
          }

          // Delete from Supabase
          await deleteCertificateFromSupabase(certificate.fileUrl);

          // Delete from database
          await deleteCertificate(input.id);

          return { success: true };
        } catch (error) {
          console.error("Certificate deletion error:", error);
          throw error;
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
