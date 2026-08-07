import { COOKIE_NAME } from "@shared/const";
import { v4 as uuidv4 } from "uuid";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, siteAdminProcedure, masterAdminProcedure, requirePermission, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAllEmployees, upsertEmployee, deleteEmployee, upsertTraining, getTrainingsByEmployeeId, getTrainingsGroupedByEmployee, setEmployeeDismissed, deleteTraining, deleteTrainingsExcept } from "./db-employees";
import { getDb } from "./db";
import { emailNotifications, trainings, employees } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { uploadCertificate, getCertificatesByTrainingId, getCertificatesByEmployeeId, deleteCertificate, getCertificateById } from "./db-certificates";
import { uploadCertificateToSupabase, deleteCertificateFromSupabase, uploadPhotoToSupabase, getPhotoUrl, getAllPhotoUrls, uploadFdsToSupabase, deleteFdsFromSupabase } from "./supabase-storage";
import { listSafetySheets, getSafetySheetById, createSafetySheet, updateSafetySheetRoles, deleteSafetySheet } from "./db-fds";
import { checkSitePassword, createSiteSessionToken, SITE_SESSION_COOKIE, generateSessionMarker, checkLoginRateLimit, registerFailedLoginAttempt, clearLoginAttempts, getClientKey, hashAdminPassword, verifyAdminPassword } from "./site-auth";
import { listAdmins, getAdminByUsername, createAdmin, deleteAdmin, countAdminsByRole, updateAdminPermissions, getAdminById } from "./db-admins";
import { PERMISSION_KEYS, DEFAULT_USER_PERMISSIONS, normalizePermissions, type Permissions } from "@shared/permissions";
import { DOCUMENT_TYPES } from "@shared/document-types";
import { DEFAULT_CONTRACT_SLUG } from "@shared/contracts";
import {
  listContracts,
  getContractBySlug,
  getContractById,
  createContract,
  updateContract,
  softDeleteContract,
  restoreContract,
  permanentlyDeleteContract,
  countContractUsage,
} from "./db-contracts";
import { logActivity, listActivity } from "./db-activity";
import { sendTestEmail } from "./mailer";

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

    // Login com a senha única do site (substitui a checagem que era feita
    // só no frontend). A senha correta fica em APP_PASSWORD no servidor,
    // nunca no código do cliente.
    // Login com senha do site. Aceita duas formas:
    // 1) username + password → confere contra a tabela de admins nomeados
    // 2) só password (sem username) → senha mestra (APP_PASSWORD), usada
    //    como acesso de recuperação caso os admins nomeados sejam perdidos
    siteLogin: publicProcedure
      .input(
        z.object({
          username: z.string().trim().min(1).optional(),
          password: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const clientKey = getClientKey(ctx.req);

        const remainingMs = checkLoginRateLimit(clientKey);
        if (remainingMs !== null) {
          const minutes = Math.ceil(remainingMs / 60000);
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Muitas tentativas incorretas. Tente novamente em ${minutes} minuto${minutes !== 1 ? "s" : ""}.`,
          });
        }

        let isValid = false;
        let sessionUsername = "master";
        let sessionRole: "admin" | "user" = "admin";
        let sessionAdminId: string | null = null;

        // Acesso mestre de recuperação. Aceita o usuário definido em
        // MASTER_USERNAME (se configurado) ou usuário em branco — o segundo
        // caminho fica só como retaguarda e não é oferecido pela interface,
        // que exige os dois campos.
        const masterUsername = process.env.MASTER_USERNAME?.trim().toLowerCase();
        const typedUsername = input.username?.trim().toLowerCase();
        const isMasterAttempt =
          !typedUsername || (!!masterUsername && typedUsername === masterUsername);

        if (typedUsername && !isMasterAttempt) {
          const admin = await getAdminByUsername(typedUsername);
          if (admin) {
            isValid = await verifyAdminPassword(input.password, admin.passwordHash);
            sessionUsername = admin.username;
            sessionRole = admin.role === "user" ? "user" : "admin";
            sessionAdminId = admin.id;
          }
        } else {
          try {
            isValid = checkSitePassword(input.password);
            sessionUsername = masterUsername ?? "master";
          } catch (error) {
            console.error("siteLogin config error:", error);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Autenticação do site não configurada no servidor.",
            });
          }
        }

        if (!isValid) {
          registerFailedLoginAttempt(clientKey);
          // Mensagem idêntica nos dois casos: variar o texto conforme o
          // usuário estar preenchido ou não revelaria que existe um caminho de
          // acesso sem usuário.
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Usuário ou senha incorretos.",
          });
        }

        clearLoginAttempts(clientKey);

        void logActivity({
          username: sessionUsername,
          role: sessionRole,
          action: "login",
        });

        // Marcador devolvido ao cliente, que o guarda no sessionStorage. O
        // acesso só vale enquanto os dois (cookie + marcador) existirem.
        const sessionMarker = generateSessionMarker();
        const token = await createSiteSessionToken(
          sessionUsername,
          sessionRole,
          sessionAdminId,
          sessionMarker
        );
        const cookieOptions = getSessionCookieOptions(ctx.req);
        // Sem maxAge: vira cookie de sessão do navegador, ou seja, ao fechar o
        // navegador o acesso é encerrado e é preciso entrar de novo. O token em
        // si continua expirando pelo prazo definido em site-auth.ts, então uma
        // aba deixada aberta também não fica válida para sempre.
        ctx.res.cookie(SITE_SESSION_COOKIE, token, cookieOptions);

        return { success: true, sessionMarker } as const;
      }),

    siteLogout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(SITE_SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    siteSession: publicProcedure.query(async ({ ctx }) => ({
      isSiteAdmin: ctx.isSiteAdmin,
      username: ctx.siteAdminUsername,
      role: ctx.siteRole,
      permissions: ctx.sitePermissions,
      // Objeto completo (não só o slug), para o cabeçalho montar o título
      // com o nome certo e a preposição certa sem outra consulta.
      contract: ctx.siteContract ? await getContractBySlug(ctx.siteContract) ?? null : null,
    })),

    // Teste de envio de e-mail — SOMENTE o administrador principal.
    testEmail: masterAdminProcedure.mutation(async ({ ctx }) => {
      const result = await sendTestEmail();
      void logActivity({
        username: ctx.siteAdminUsername,
        role: ctx.siteRole,
        action: "email.test",
        targetType: "email",
        details: result.success ? "teste de e-mail enviado" : `teste de e-mail falhou: ${result.message}`,
      });
      return result;
    }),

    // Rastro de atividades — SOMENTE o administrador principal.
    activity: router({
      list: masterAdminProcedure
        .input(
          z.object({
            limit: z.number().min(1).max(500).default(200),
            username: z.string().optional(),
          })
        )
        .query(async ({ input }) => {
          return listActivity({ limit: input.limit, username: input.username });
        }),
    }),

    // Gerenciamento de contas — SOMENTE o administrador principal.
    admins: router({
      list: masterAdminProcedure.query(async () => {
        return listAdmins();
      }),

      create: masterAdminProcedure
        .input(
          z.object({
            username: z
              .string()
              .trim()
              .min(3, "Usuário deve ter ao menos 3 caracteres")
              .max(50)
              .regex(/^[a-zA-Z0-9._-]+$/, "Use apenas letras, números, ponto, hífen ou underline"),
            password: z.string().min(8, "Senha deve ter ao menos 8 caracteres"),
            contract: z.string().min(1),
            permissions: z.record(z.string(), z.boolean()).optional(),
          })
        )
        .mutation(async ({ input, ctx }) => {
          const existing = await getAdminByUsername(input.username);
          if (existing) {
            throw new TRPCError({ code: "CONFLICT", message: "Esse usuário já existe." });
          }

          const contract = await getContractBySlug(input.contract);
          if (!contract || contract.deleted) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato inválido ou excluído." });
          }

          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "account.create",
            targetType: "account",
            targetName: input.username,
            details: "usuário",
          });

          const passwordHash = await hashAdminPassword(input.password);
          return createAdmin({
            id: uuidv4(),
            username: input.username,
            passwordHash,
            // Só existe um administrador: a conta mestra configurada no
            // Railway (MASTER_USERNAME + APP_PASSWORD). Contas criadas por
            // aqui são sempre usuários, com permissões definidas na criação.
            role: "user",
            contract: input.contract,
            permissions: normalizePermissions(input.permissions ?? DEFAULT_USER_PERMISSIONS, "user"),
          });
        }),

      setPermissions: masterAdminProcedure
        .input(
          z.object({
            id: z.string(),
            permissions: z.record(z.string(), z.boolean()),
          })
        )
        .mutation(async ({ input, ctx }) => {
          const target = await getAdminById(input.id);
          if (!target) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada." });
          }
          if (target.role === "admin") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "O administrador principal sempre tem acesso total.",
            });
          }

          const permissions: Permissions = normalizePermissions(input.permissions, "user");
          await updateAdminPermissions(input.id, permissions);

          const granted = PERMISSION_KEYS.filter(k => permissions[k]);
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "account.permissions",
            targetType: "account",
            targetId: input.id,
            targetName: target.username,
            details: granted.length ? granted.join(", ") : "nenhuma permissão",
          });

          return { success: true, permissions } as const;
        }),

      delete: masterAdminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input, ctx }) => {
          const target = await getAdminById(input.id);
          if (!target) return { success: true } as const;

          if (target.username === ctx.siteAdminUsername) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Você não pode remover a própria conta enquanto estiver logado com ela.",
            });
          }

          if (target.role === "admin") {
            const adminCount = await countAdminsByRole("admin");
            if (adminCount <= 1) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Não é possível remover o último administrador principal.",
              });
            }
          }

          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "account.delete",
            targetType: "account",
            targetId: input.id,
            targetName: target.username,
          });

          await deleteAdmin(input.id);
          return { success: true } as const;
        }),
    }),
  }),

  // FDS — Ficha de Dados de Segurança
  fds: router({
    list: requirePermission('viewCertificates')
      .input(z.object({ type: z.enum(DOCUMENT_TYPES).optional() }).optional())
      .query(async ({ input, ctx }) => {
        return listSafetySheets(input?.type, ctx.siteContract ?? undefined);
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

        const upload = await uploadFdsToSupabase(fileBuffer, input.fileName, "application/pdf");

        const sheet = await createSafetySheet({
          id: uuidv4(),
          type: input.type,
          contract: ctx.siteContract ?? DEFAULT_CONTRACT_SLUG,
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
  }),

  // Contratos — SOMENTE o administrador principal gerencia.
  contracts: router({
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
        })
      )
      .mutation(async ({ input, ctx }) => {
        const contract = await createContract({
          id: uuidv4(),
          name: input.name,
          preposition: input.preposition,
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
        })
      )
      .mutation(async ({ input, ctx }) => {
        const existing = await getContractById(input.id);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
        }
        await updateContract(input.id, { name: input.name, preposition: input.preposition });
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
  }),

  employees: router({
    upsertOne: requirePermission('editEmployees')
      .input(
        z.object({
          id: z.string(),
          name: z.string(),
          registration: z.string().optional(),
          educationLevel: z.string().optional(),
          age: z.number().optional(),
          birthDate: z.string().optional(),
          role: z.string(),
          phone: z.string().optional(),
          trainings: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              completionDate: z.string(),
              expirationDate: z.string(),
            })
          ),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.siteRole === "admin" && !ctx.siteContract) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Escolha um contrato no cabeçalho antes de cadastrar.",
          });
        }

        try {
            await upsertEmployee({
              id: input.id,
              name: input.name,
              registration: input.registration,
              educationLevel: input.educationLevel,
              age: input.age,
              birthDate: input.birthDate,
              role: input.role,
              phone: input.phone,
              // O contrato vem sempre da conta que está cadastrando — não é
              // escolhido no formulário, para não haver como errar nem burlar.
              contract: ctx.siteContract ?? DEFAULT_CONTRACT_SLUG,
            });

          const currentTrainingIds = input.trainings.map(t => t.id);
          await deleteTrainingsExcept(input.id, currentTrainingIds);

          for (const training of input.trainings) {
            await upsertTraining({
              id: training.id,
              employeeId: input.id,
              name: training.name,
              completionDate: training.completionDate,
              expirationDate: training.expirationDate,
            });
          }

          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "employee.update",
            targetType: "employee",
            targetId: input.id,
            targetName: input.name,
            details: `${input.trainings.length} treinamento(s)`,
          });

          return { success: true };
        } catch (error) {
          console.error("UpsertOne error:", error);
          throw error;
        }
      }),

    // Demitir/readmitir: tira o colaborador das listas e contagens sem apagar
    // nada. Usa a permissão de edição, não a de exclusão, porque é reversível.
    setDismissed: requirePermission('editEmployees')
      .input(z.object({ id: z.string(), dismissed: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        await setEmployeeDismissed(input.id, input.dismissed);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: input.dismissed ? "employee.dismiss" : "employee.restore",
          targetType: "employee",
          targetId: input.id,
        });
        return { success: true } as const;
      }),

    delete: requirePermission('deleteEmployees')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          await deleteEmployee(input.id);
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "employee.delete",
            targetType: "employee",
            targetId: input.id,
          });
          return { success: true };
        } catch (error) {
          console.error("Delete employee error:", error);
          throw error;
        }
      }),
    sync: requirePermission('editEmployees')
      .input(
        z.object({
          employees: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              registration: z.string().optional(),
              educationLevel: z.string().optional(),
                age: z.number().optional(),
                birthDate: z.string().optional(),
                role: z.string(),
              phone: z.string().optional(),
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
      .mutation(async ({ input, ctx }) => {
        try {
          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "employee.import",
            details: `${input.employees.length} colaborador(es) sincronizado(s)`,
          });

          for (const employee of input.employees) {
            // Upsert employee
            await upsertEmployee({
              id: employee.id,
              name: employee.name,
              registration: employee.registration,
              educationLevel: employee.educationLevel,
              age: employee.age,
              birthDate: employee.birthDate,
              role: employee.role,
              phone: employee.phone,
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
    list: requirePermission('viewEmployees').query(async ({ ctx }) => {
      // Três operações no total, independente do número de colaboradores:
      // 1 consulta de colaboradores, 1 de treinamentos e 1 listagem de fotos.
      // Antes eram 2 chamadas POR colaborador (uma ao banco e uma de rede ao
      // Supabase), o que deixava a abertura da lista muito lenta.
      const [employeeList, trainingsByEmployee, photoUrls] = await Promise.all([
        // Usuário comum recebe só o próprio contrato; administrador recebe tudo.
        getAllEmployees(ctx.siteContract ?? undefined),
        getTrainingsGroupedByEmployee(),
        getAllPhotoUrls(),
      ]);

      return employeeList.map((emp) => ({
        ...emp,
        photoUrl: photoUrls.get(emp.id) ?? null,
        trainings: trainingsByEmployee.get(emp.id) ?? [],
      }));
    }),

    uploadPhoto: requirePermission('editEmployees')
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

          const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB
          if (fileBuffer.length > MAX_PHOTO_BYTES) {
            throw new TRPCError({
              code: "PAYLOAD_TOO_LARGE",
              message: "A foto excede o limite de 5MB.",
            });
          }

          const ALLOWED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
          if (input.mimeType && !ALLOWED_PHOTO_MIME_TYPES.includes(input.mimeType)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Tipo de imagem não suportado. Permitidos: JPG, PNG, WEBP.",
            });
          }

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
  }),

  emailHistory: router({
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
  }),

  certificates: router({
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
      .mutation(async ({ input }) => {
        try {
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
      .query(async ({ input }) => {
        try {
          return await getCertificatesByEmployeeId(input.employeeId);
        } catch (error) {
          console.error("Error fetching certificates by employee:", error);
          return [];
        }
      }),

    delete: requirePermission('manageCertificates')
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const certificate = await getCertificateById(input.id);
          if (!certificate) {
            throw new Error("Certificate not found");
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
  }),
});

export type AppRouter = typeof appRouter;
