import { toast } from 'sonner';
import type { Dispatch, SetStateAction } from 'react';
import type { Employee } from '@/lib/types';
import { trpc } from '@/lib/trpc';

type SyncMutation = ReturnType<typeof trpc.employees.sync.useMutation>;
type ListQuery = ReturnType<typeof trpc.employees.list.useQuery>;

/**
 * Importação de colaboradores por planilha Excel — mescla com quem já
 * existe (por nome), preenche dado pessoal faltando sem apagar o que já
 * estava certo, e sanitiza treinamento antes de enviar pro servidor.
 * Extraído de Home.tsx sem mudar nenhum comportamento, só organizando.
 */
export function useExcelImport(
  employees: Employee[],
  setEmployees: Dispatch<SetStateAction<Employee[]>>,
  setIsSyncing: (value: boolean) => void,
  setLastSyncTime: (date: Date) => void,
  syncMutation: SyncMutation,
  listQuery: ListQuery
) {
  const handleExcelImport = async (importedEmployees: Employee[]) => {
    try {
      setIsSyncing(true);
      const mergedEmployees = employees.map(e => ({ ...e, trainings: [...e.trainings] }));
      for (const imported of importedEmployees) {
        const existingIndex = mergedEmployees.findIndex(
          (e) => e.name.toLowerCase() === imported.name.toLowerCase()
        );
        if (existingIndex >= 0) {
          const existing = mergedEmployees[existingIndex];
          const newTrainings = imported.trainings.filter(
            (t) => !existing.trainings.some((et) => et.name === t.name)
          );
          existing.trainings.push(...newTrainings);
          // Reimportar também atualiza os dados pessoais de quem já existe,
          // quando a planilha traz algo preenchido — é assim que dá pra
          // completar em lote um campo que ficou faltando (como data de
          // nascimento) sem digitar tudo de novo, um por um. Célula vazia na
          // planilha não apaga o que já estava certo.
          if (imported.birthDate) existing.birthDate = imported.birthDate;
          if (imported.registration) existing.registration = imported.registration;
          if (imported.educationLevel) existing.educationLevel = imported.educationLevel;
          if (imported.phone) existing.phone = imported.phone;
          if (imported.role) existing.role = imported.role;
        } else {
          mergedEmployees.push(imported);
        }
      }
      mergedEmployees.sort((a, b) => a.name.localeCompare(b.name));


      // Datas desconhecidas permanecem vazias. O servidor valida cada
      // colaborador e conserva o estado anterior quando o registro falha.
      const sanitizedEmployees = mergedEmployees.map((emp) => ({
        ...emp,
        trainings: emp.trainings
          .filter((t) => t.name && t.name.trim() !== '')
          .map((t) => ({
            ...t,
            completionDate: t.completionDate || '',
            expirationDate: t.expirationDate || '',
          })),
      }));

      const syncResult = await syncMutation.mutateAsync({ employees: sanitizedEmployees });
      const refreshed = await listQuery.refetch();
      if (refreshed.data) setEmployees(refreshed.data as Employee[]);
      setLastSyncTime(new Date());

      if (syncResult.failed.length > 0) {
        // Alguns podem ter dado erro sem travar os demais — mostra
        // exatamente quem, em vez de dizer que deu tudo certo.
        toast.error(
          `${syncResult.updated} salvo(s), mas ${syncResult.failed.length} falharam: ${syncResult.failed
            .map((f) => `${f.name}: ${f.error}`)
            .join(', ')}`,
          { duration: 10000 }
        );
      } else {
        toast.success(`${importedEmployees.length} colaborador(es) importado(s)!`);
      }
    } catch (error) {
      // Mostra o erro de verdade em vez de uma mensagem genérica, para dar
      // pista real do que quebrou (ex: contrato não escolhido, erro de rede).
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Erro ao importar colaboradores: ${message}`);
      console.error(error);
    } finally {
      setIsSyncing(false);
    }
  };

  return { handleExcelImport };
}

