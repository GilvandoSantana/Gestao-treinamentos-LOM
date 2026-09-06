import { toast } from 'sonner';
import type { Employee, FilterType } from '@/lib/types';
import { trpc } from '@/lib/trpc';
import { useSiteSession } from '@/hooks/useSiteSession';

/**
 * As três exportações em PDF que existiam soltas no Home.tsx (relatório
 * geral, relatório filtrado por aba, e dados de um colaborador específico)
 * — extraídas pra cá sem mudar nenhum comportamento, só organizando (o
 * Home.tsx estava passando de 1000 linhas).
 */
export function useEmployeeExports(
  employees: Employee[],
  session: ReturnType<typeof useSiteSession>,
  utils: ReturnType<typeof trpc.useUtils>,
  setIsSyncing: (value: boolean) => void
) {
  const handleExportPDF = async () => {
    try {
      setIsSyncing(true);
      const { generateComprehensivePDF } = await import('@/lib/pdf-export');
      await generateComprehensivePDF(employees);
      toast.success('Relatório PDF gerado com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar relatório PDF');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePrintFilter = async (filterType: FilterType) => {
    try {
      setIsSyncing(true);
      const { generateFilteredPDF } = await import('@/lib/pdf-export');
      await generateFilteredPDF(employees, filterType);
      const labels: Record<FilterType, string> = {
        all: 'Todos', valid: 'Válidos', expiring: 'Próximos a Vencer', expired: 'Vencidos',
      };
      toast.success(`Relatório de ${labels[filterType]} gerado com sucesso!`);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar relatório PDF');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportEmployeeData = async (employee: Employee) => {
    try {
      const certificates = await utils.client.certificates.getByEmployee.query({
        employeeId: employee.id,
      });
      // Para usuário comum, o próprio contrato dele já é o do colaborador
      // (a lista só mostra gente do mesmo contrato). Só o administrador
      // pode estar vendo colaboradores de outros contratos, então só ele
      // busca o nome certo por fora.
      let contractName = session.contract?.name ?? '—';
      if (session.isMasterAdmin && employee.contract) {
        const contracts = await utils.client.contracts.list.query({ includeDeleted: true });
        contractName = contracts.find((c) => c.slug === employee.contract)?.name ?? employee.contract;
      }
      const { generateEmployeeDataExportPDF } = await import('@/lib/employee-data-export');
      generateEmployeeDataExportPDF(employee, certificates as any, contractName);
      toast.success('PDF gerado.');
    } catch (error) {
      toast.error('Erro ao gerar o PDF de dados.');
      console.error(error);
    }
  };

  return { handleExportPDF, handlePrintFilter, handleExportEmployeeData };
}
