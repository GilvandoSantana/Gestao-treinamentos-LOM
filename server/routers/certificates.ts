import { v4 as uuidv4 } from "uuid";
import { requirePermission, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  deleteCertificate,
  getCertificateById,
  getCertificatesByEmployeeId,
  getCertificatesByTrainingId,
  uploadCertificate,
} from "../db-certificates";
import { getEmployeeScoped } from "../db-employees";
import { deleteCertificateFromSupabase, getSignedCertificateUrl, uploadCertificateToSupabase } from "../supabase-storage";
import { logActivity } from "../db-activity";

export const certificatesRouter = router({
    upload: requirePermission('manageCertificates')
      .input(
        z.object({
          trainingId: z.string(),
          employeeId: z.string(),
          fileName: z.string(),
          fileData: z.string().or(z.instanceof(Buffer)),
          mimeType: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const employee = await getEmployeeScoped(input.employeeId, ctx.siteContract);
          if (!employee) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
          }

          const fileBuffer = typeof input.fileData === "string" 
            ? Buffer.from(input.fileData, "base64")
            : input.fileData;

          // Reforça no servidor os mesmos limites já validados no client
          // (tamanho máximo e tipos permitidos), já que o client pode ser
          // contornado por quem chamar a API diretamente.
          const MAX_CERTIFICATE_BYTES = 10 * 1024 * 1024; // 10MB
          if (fileBuffer.length > MAX_CERTIFICATE_BYTES) {
            throw new TRPCError({
              code: "PAYLOAD_TOO_LARGE",
              message: "O arquivo excede o limite de 10MB.",
            });
          }

          const ALLOWED_CERTIFICATE_MIME_TYPES = [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ];
          if (input.mimeType && !ALLOWED_CERTIFICATE_MIME_TYPES.includes(input.mimeType)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Tipo de arquivo não suportado. Permitidos: PDF, JPG, PNG, DOC, DOCX.",
            });
          }

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

    getByTraining: requirePermission('viewCertificates')
      .input(z.object({ trainingId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await getCertificatesByTrainingId(input.trainingId);
        } catch (error) {
          console.error("Error fetching certificates by training:", error);
          return [];
        }
      }),

    getByEmployee: requirePermission('viewCertificates')
      .input(z.object({ employeeId: z.string() }))
      .query(async ({ input, ctx }) => {
        try {
          const employee = await getEmployeeScoped(input.employeeId, ctx.siteContract);
          if (!employee) return [];
          return await getCertificatesByEmployeeId(input.employeeId);
        } catch (error) {
          console.error("Error fetching certificates by employee:", error);
          return [];
        }
      }),

    // URL assinada de curta duração — usada pelo cliente em vez de
    // confiar na URL pública guardada no banco, que deixa de funcionar
    // quando o bucket do Supabase virar privado (achado de auditoria de
    // segurança, 07/09).
    getDownloadUrl: requirePermission('viewCertificates')
      .input(z.object({ id: z.string() }))
      .query(async ({ input, ctx }) => {
        const certificate = await getCertificateById(input.id);
        if (!certificate) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Certificado não encontrado." });
        }
        const employee = await getEmployeeScoped(certificate.employeeId, ctx.siteContract);
        if (!employee) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Certificado não encontrado." });
        }
        const url = await getSignedCertificateUrl(certificate.fileUrl);
        return { url } as const;
      }),

    delete: requirePermission('manageCertificates')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const certificate = await getCertificateById(input.id);
          if (!certificate) {
            throw new Error("Certificate not found");
          }
          // Confere que o colaborador dono do certificado pertence ao
          // contrato de quem está pedindo a exclusão.
          const employee = await getEmployeeScoped(certificate.employeeId, ctx.siteContract);
          if (!employee) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Certificado não encontrado." });
          }

          // Delete from Supabase
          await deleteCertificateFromSupabase(certificate.fileUrl);

          // Delete from database
          await deleteCertificate(input.id);

          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "certificate.delete",
            targetType: "certificate",
            targetId: input.id,
            targetName: certificate.fileName,
          });

          return { success: true };
        } catch (error) {
          console.error("Certificate deletion error:", error);
          throw error;
        }
      }),
  });
