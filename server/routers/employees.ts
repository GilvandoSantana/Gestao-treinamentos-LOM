import { v4 as uuidv4 } from "uuid";
import { masterAdminProcedure, requirePermission, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  deleteEmployee,
  deleteTrainingsExcept,
  getAllEmployees,
  getDistinctTrainingNames,
  getEmployeeById,
  getTrainingById,
  getEmployeeScoped,
  getTrainingsByEmployeeId,
  getTrainingsGroupedByEmployee,
  setEmployeeContract,
  setEmployeeDismissed,
  upsertEmployee,
  withEmployeeTransaction,
  upsertTraining,
} from "../db-employees";
import { employees, trainings } from "../../drizzle/schema";
import { getAllPhotoUrls, uploadPhotoToSupabase } from "../supabase-storage";
import { DEFAULT_CONTRACT_SLUG } from "@shared/contracts";
import { getContractBySlug } from "../db-contracts";
import { parseCustomFieldValues } from "../db-contract-fields";
import { clearEmployeePortalPin } from "../db-employee-portal";
import { addMonthsToDate, getTrainingTypeByName } from "../db-training-types";
import { logActivity } from "../db-activity";

async function assertTrainingOwners(employeeId: string, rows: { id: string }[]) {
  for (const row of rows) {
    const existing = await getTrainingById(row.id);
    if (existing && existing.employeeId !== employeeId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Treinamento não encontrado." });
    }
  }
}

export const employeesRouter = router({
    // Reseta o PIN do portal de autoatendimento — pra quando o colaborador
    // esquece o PIN e precisa fazer o "primeiro acesso" de novo (com CPF +
    // data de nascimento) pra criar um PIN novo.
    resetPortalAccess: requirePermission('editEmployees')
      .input(z.object({ employeeId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const employee = await getEmployeeScoped(input.employeeId, ctx.siteContract);
        if (!employee) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
        }
        await clearEmployeePortalPin(input.employeeId);
        return { success: true } as const;
      }),

    // Nomes de treinamento já cadastrados, para sugerir ao digitar um novo e
    // evitar variações do mesmo treinamento espalhadas pelo sistema.
    trainingNames: requirePermission('viewEmployees').query(async ({ ctx }) => {
      return getDistinctTrainingNames(ctx.siteContract ?? undefined);
    }),

    // Renovar o mesmo treinamento para vários colaboradores de uma vez —
    // útil quando uma turma inteira faz a reciclagem no mesmo dia. Para cada
    // colaborador: se ele já tinha um treinamento com esse nome, atualiza as
    // datas; senão, cadastra um novo.
    renewTrainingBulk: requirePermission('editEmployees')
      .input(
        z.object({
          employeeIds: z.array(z.string()).min(1),
          trainingName: z.string().trim().min(1),
          completionDate: z.string(),
          expirationDate: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        let updated = 0;
        let created = 0;
        let skipped = 0;

        for (const employeeId of input.employeeIds) {
          // Confere que cada colaborador da lista pertence mesmo ao
          // contrato de quem está pedindo — sem isso, alguém podia incluir
          // o id de um colaborador de OUTRO contrato na lista e renovar
          // treinamento dele também.
          const employee = await getEmployeeScoped(employeeId, ctx.siteContract);
          if (!employee) {
            skipped++;
            continue;
          }

          const existingTrainings = await getTrainingsByEmployeeId(employeeId);
          const match = existingTrainings.find(
            (t) => t.name.trim().toLowerCase() === input.trainingName.trim().toLowerCase()
          );

          await upsertTraining({
            id: match?.id ?? uuidv4(),
            employeeId,
            name: input.trainingName.trim(),
            completionDate: input.completionDate,
            expirationDate: input.expirationDate,
          });

          if (match) updated++;
          else created++;
        }

        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "training.renewBulk",
          details: `"${input.trainingName}" — ${updated} renovado(s), ${created} novo(s), de ${input.employeeIds.length} colaborador(es)${skipped > 0 ? `, ${skipped} ignorado(s)` : ''}`,
        });

        return { updated, created, skipped, total: input.employeeIds.length } as const;
      }),

    // Reatribuir colaborador para outro contrato — SOMENTE o administrador
    // principal. Não é uma edição normal: move o registro inteiro para outra
    // "gaveta", então fica separado do upsertOne e sempre exige o admin
    // estar trabalhando naquele contrato específico (não em "Todos").
    changeContract: masterAdminProcedure
      .input(z.object({ employeeId: z.string(), contractSlug: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const contract = await getContractBySlug(input.contractSlug);
        if (!contract || contract.deleted) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato inválido ou excluído." });
        }
        await setEmployeeContract(input.employeeId, input.contractSlug);
        void logActivity({
          username: ctx.siteAdminUsername,
          role: ctx.siteRole,
          action: "employee.changeContract",
          targetType: "employee",
          targetId: input.employeeId,
          details: `movido para ${contract.name}`,
        });
        return { success: true } as const;
      }),

    upsertOne: requirePermission('editEmployees')
      .input(
        z.object({
          id: z.string(),
          name: z.string(),
          // .nullish() (não .optional()): mesmo motivo do sync — essas
          // colunas são anuláveis no banco, então um valor já salvo pode
          // voltar como null (não undefined) e derrubar a validação.
          registration: z.string().nullish(),
          educationLevel: z.string().nullish(),
          age: z.number().nullish(),
          birthDate: z.string().nullish(),
          admissionDate: z.string().nullish(),
          role: z.string(),
          phone: z.string().nullish(),
          gerencia: z.string().nullish(),
          cnhNumero: z.string().nullish(),
          cnhValidade: z.string().nullish(),
          cnhCategoria: z.string().nullish(),
          cpf: z.string().nullish(),
          customFields: z.record(z.string(), z.string()).optional(),
          trainings: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              completionDate: z.string(),
              // Opcional: a data de vencimento é sempre calculada aqui a
              // partir da validade cadastrada no catálogo de treinamentos
              // (data de realização + X meses) — só é usada como reserva
              // quando o treinamento não bate com nenhum tipo do catálogo
              // (nome livre, de antes dessa mudança).
              expirationDate: z.string().optional(),
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

        // Se já existe um colaborador com esse id, ele precisa pertencer ao
        // MESMO contrato de quem está editando — sem essa checagem, alguém
        // sabendo o UUID de um colaborador de outro contrato conseguia
        // sobrescrever os dados dele E, pior, reatribuí-lo pro próprio
        // contrato (já que o campo contract abaixo sempre usa o contrato de
        // quem está salvando, não o que já estava gravado). Colaborador
        // NOVO (id ainda não existe) passa direto — é criação normal.
        const existing = await getEmployeeById(input.id);
        if (existing) {
          const belongsToCaller = ctx.siteContract === null || existing.contract === ctx.siteContract;
          if (!belongsToCaller) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
          }
        }

        await assertTrainingOwners(input.id, input.trainings);

        // Barreira do lado do servidor contra treinamento duplicado — a
        // tela já impede isso na hora de adicionar, mas esta é a segunda
        // camada (protege contra chamada direta à API e contra a
        // importação de planilha).
        const trainingNamesSeen = new Set<string>();
        for (const training of input.trainings) {
          const key = training.name.trim().toLowerCase();
          if (trainingNamesSeen.has(key)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `"${training.name}" está duplicado na lista de treinamentos.`,
            });
          }
          trainingNamesSeen.add(key);
        }

        try {
          await withEmployeeTransaction(input.id, ctx.siteContract ?? DEFAULT_CONTRACT_SLUG, async tx => {
            await upsertEmployee({
              id: input.id,
              name: input.name,
              registration: input.registration,
              educationLevel: input.educationLevel,
              age: input.age,
              birthDate: input.birthDate,
              admissionDate: input.admissionDate,
              role: input.role,
              phone: input.phone,
              gerencia: input.gerencia,
              cnhNumero: input.cnhNumero,
              cnhValidade: input.cnhValidade,
              cnhCategoria: input.cnhCategoria,
              cpf: input.cpf,
              customFields: input.customFields ? JSON.stringify(input.customFields) : undefined,
              // O contrato vem sempre da conta que está cadastrando — não é
              // escolhido no formulário, para não haver como errar nem burlar.
              contract: ctx.siteContract ?? DEFAULT_CONTRACT_SLUG,
            }, tx);

          const currentTrainingIds = input.trainings.map(t => t.id);
          await deleteTrainingsExcept(input.id, currentTrainingIds, tx);

          for (const training of input.trainings) {
            // A validade vem sempre do catálogo, nunca do que o cliente
            // mandar — fecha qualquer brecha de manipulação e garante que
            // todo mundo usando o mesmo tipo de treinamento tenha a mesma
            // regra de vencimento.
            const trainingType = await getTrainingTypeByName(training.name);
            const expirationDate = trainingType && training.completionDate
              ? addMonthsToDate(training.completionDate, trainingType.validityMonths)
              : training.expirationDate || "";

            await upsertTraining({
              id: training.id,
              employeeId: input.id,
              name: training.name,
              completionDate: training.completionDate,
              expirationDate,
            }, tx);
          }

          });

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
        const employee = await getEmployeeScoped(input.id, ctx.siteContract);
        if (!employee) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
        }
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
          const employee = await getEmployeeScoped(input.id, ctx.siteContract);
          if (!employee) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
          }
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
              // .nullish() (não .optional()): esses campos são colunas
              // anuláveis no banco. Um colaborador já existente sem, por
              // exemplo, data de nascimento cadastrada volta do banco como
              // null (não undefined) — e null derrubava a validação e
              // travava a importação do contrato inteiro.
              registration: z.string().nullish(),
              educationLevel: z.string().nullish(),
                age: z.number().nullish(),
                birthDate: z.string().nullish(),
                role: z.string(),
              phone: z.string().nullish(),
              trainings: z.array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                  // Opcionais: uma data quebrada ou vazia num único
                  // treinamento não pode reprovar a validação do lote
                  // inteiro e travar a importação do contrato.
                  completionDate: z.string().optional(),
                  expirationDate: z.string().optional(),
                })
              ),
            })
          ),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          if (ctx.siteRole === "admin" && !ctx.siteContract) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Escolha um contrato no cabeçalho antes de importar a planilha.",
            });
          }
          const contract = ctx.siteContract ?? DEFAULT_CONTRACT_SLUG;

          void logActivity({
            username: ctx.siteAdminUsername,
            role: ctx.siteRole,
            action: "employee.import",
            details: `${input.employees.length} colaborador(es) sincronizado(s)`,
          });

          const results = { updated: 0, failed: [] as { name: string; error: string }[] };

          for (const employee of input.employees) {
            try {
              const existing = await getEmployeeById(employee.id);
              if (existing && existing.contract !== contract) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
              }
              await assertTrainingOwners(employee.id, employee.trainings);
              // Mesma barreira contra treinamento duplicado do upsertOne —
              // aqui, uma linha duplicada na planilha não trava a
              // importação inteira, só marca ESTE colaborador como falho
              // e segue para o próximo.
              const trainingNamesSeen = new Set<string>();
              for (const training of employee.trainings) {
                const key = training.name.trim().toLowerCase();
                if (trainingNamesSeen.has(key)) {
                  throw new Error(`Treinamento "${training.name}" duplicado na planilha.`);
                }
                trainingNamesSeen.add(key);
              }

              await withEmployeeTransaction(employee.id, contract, async tx => {
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
                contract,
              }, tx);

              // Upsert trainings
              const currentTrainingIds = employee.trainings.map(t => t.id);

              // First, remove trainings that are no longer in the list
              await deleteTrainingsExcept(employee.id, currentTrainingIds, tx);

              for (const training of employee.trainings) {
                const completionDate = training.completionDate || "";
                // Mesma regra do upsertOne: a validade vem do catálogo, não
                // do que a planilha trouxer — a coluna "Data de Vencimento"
                // do modelo de importação é ignorada quando o nome do
                // treinamento bate com um tipo cadastrado.
                const trainingType = await getTrainingTypeByName(training.name);
                const expirationDate = trainingType && completionDate
                  ? addMonthsToDate(completionDate, trainingType.validityMonths)
                  : training.expirationDate || "";

                await upsertTraining({
                  id: training.id,
                  employeeId: employee.id,
                  name: training.name,
                  completionDate,
                  expirationDate,
                }, tx);
              }
              });
              results.updated++;
            } catch (employeeError) {
              // Um colaborador com problema (ex: dado inválido) não pode travar
              // todo mundo depois dele na lista — registra e segue para o
              // próximo, devolvendo no final quem falhou e por quê.
              console.error(`[sync] Falha ao salvar "${employee.name}":`, employeeError);
              results.failed.push({
                name: employee.name,
                error: employeeError instanceof Error ? employeeError.message : String(employeeError),
              });
            }
          }
          return {
            success: true,
            count: input.employees.length,
            updated: results.updated,
            failed: results.failed,
          };
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

      return employeeList.map(({ portalPinHash: _portalPinHash, ...emp }) => ({
        ...emp,
        photoUrl: photoUrls.get(emp.id) ?? null,
        trainings: trainingsByEmployee.get(emp.id) ?? [],
        customFields: parseCustomFieldValues(emp.customFields),
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
      .mutation(async ({ input, ctx }) => {
        try {
          const employee = await getEmployeeScoped(input.employeeId, ctx.siteContract);
          if (!employee) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
          }

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
  });
