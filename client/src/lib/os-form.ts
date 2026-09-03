/**
 * Ordem de Serviço (NR-01).
 *
 * Gera uma página por colaborador, preenchendo automaticamente Nome, CPF,
 * Cargo, Gerência e Contrato (igual à Ficha de EPI e ao crachá) — área,
 * tarefas e agentes ambientais vêm da configuração da função do
 * colaborador dentro do contrato (ver OsRoleConfigModal); "Medidas de
 * Controle Existentes" (Administrativas, Engenharia, EPI's Mínimos) vem
 * do padrão do contrato (mesmo texto pra todas as funções).
 *
 * Pré-requisitos, ambos bloqueiam a geração com mensagem explicando o
 * motivo se não estiverem prontos:
 * - o contrato precisa ter o PGR anexado no cadastro do contrato;
 * - o contrato precisa ter as "Medidas de Controle Existentes" padrão
 *   configuradas.
 *
 * O layout de verdade fica em os-form-render.ts.
 */

import { jsPDF } from 'jspdf';
import type { Employee } from '@/lib/types';
import { trpcClient } from '@/lib/trpc';
import { renderOsFormPage, type OsPageData } from '@/lib/os-form-render';

/**
 * Gera a Ordem de Serviço de um colaborador. Se `sharedDoc` for passado, a
 * página é adicionada a ele (uso em lote, um PDF só com várias OS);
 * caso contrário cria um documento novo e já baixa.
 *
 * Lança um erro com mensagem explicativa se o contrato do colaborador não
 * tiver PGR anexado, ou não tiver as Medidas de Controle Existentes
 * configuradas — a Documentação exibe essa mensagem ao usuário.
 */
export const generateOsFormPDF = async (employee: Employee, sharedDoc?: jsPDF): Promise<jsPDF> => {
  const [contractInfo, roleConfig, osDefaults] = await Promise.all([
    employee.contract
      ? trpcClient.contracts.getManagerName.query({ slug: employee.contract }).catch(() => null)
      : Promise.resolve(null),
    trpcClient.osConfig.getByRole.query({ role: employee.role }).catch(() => null),
    employee.contract
      ? trpcClient.osConfig.getContractDefaults.query({ slug: employee.contract }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const contractName = contractInfo?.contractName ?? employee.contract ?? '';

  if (!contractInfo?.pgrFileUrl) {
    throw new Error(
      `Não é possível gerar a Ordem de Serviço de ${employee.name}: o contrato "${contractName || employee.contract}" ainda não possui o PGR anexado. Anexe o PGR no cadastro do contrato antes de continuar.`
    );
  }

  const hasOsDefaults =
    !!osDefaults?.osMedidasAdministrativas?.trim() &&
    !!osDefaults?.osMedidasEngenharia?.trim() &&
    !!osDefaults?.osEpisMinimos?.trim();
  if (!hasOsDefaults) {
    throw new Error(
      `Não é possível gerar a Ordem de Serviço de ${employee.name}: o contrato "${contractName || employee.contract}" ainda não tem as "Medidas de Controle Existentes" configuradas. Configure em Documentação → Configurar OS por função → "padrão do contrato" antes de continuar.`
    );
  }

  const doc = sharedDoc ?? new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  if (sharedDoc) {
    doc.addPage('a4', 'portrait');
  }

  const pageData: OsPageData = {
    employee,
    contractName,
    companyName: contractInfo?.companyName ?? '',
    role: roleConfig ?? null,
    osDefaults: {
      medidasAdministrativas: osDefaults?.osMedidasAdministrativas ?? null,
      medidasEngenharia: osDefaults?.osMedidasEngenharia ?? null,
      episMinimos: osDefaults?.osEpisMinimos ?? null,
    },
  };

  await renderOsFormPage(doc, pageData);

  if (!sharedDoc) {
    doc.save(`ordem-servico-${employee.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
  }

  return doc;
};
