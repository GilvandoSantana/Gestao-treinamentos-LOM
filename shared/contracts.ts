/**
 * Contratos atendidos pelo sistema.
 *
 * Cadastrados pelo administrador (não é mais uma lista fixa). Cada
 * colaborador, usuário e documento pertence a um contrato pelo `slug` —
 * identificador estável que não muda mesmo se o nome for editado depois.
 */

export type ContractPreposition = 'do' | 'da';

export interface ContractInfo {
  id: string;
  organizationId?: string | null;
  slug: string;
  name: string;
  preposition: ContractPreposition;
  /** E-mail que recebe os alertas de treinamento deste contrato; null = usa o global. */
  alertEmail: string | null;
  /** Telefone (com DDD e DDI) que recebe os alertas por WhatsApp deste contrato. */
  alertWhatsapp: string | null;
  /** Nome de quem gerencia este contrato — usado no crachá padrão. */
  managerName: string | null;
  /** Gerência do contrato inteiro (mesma pra todo colaborador) — usada na
   * Ordem de Serviço e no crachá padrão. */
  gerencia: string | null;
  /** PGR anexado no cadastro do contrato — pré-requisito para gerar uma Ordem de Serviço. */
  pgrFileUrl: string | null;
  hasPgr?: boolean;
  pgrFileName: string | null;
  pgrUploadedAt: string | null;
  /** Razão social impressa no cabeçalho da Ordem de Serviço (Documentação). */
  companyName: string | null;
  /**
   * "Medidas de Controle Existentes" da Ordem de Serviço — fixo dentro do
   * contrato (mesmo texto pra todas as funções), configurado uma vez.
   */
  osMedidasAdministrativas: string | null;
  osMedidasEngenharia: string | null;
  osEpisMinimos: string | null;
  /** Módulo de Lançamentos RQA's habilitado neste contrato — decide se o
   * cartão aparece na tela principal (ideia do Gilvando, 16/09). */
  rqaEnabled: boolean;
  /** Meta de RQA esperada por colaborador ativo, no mês. */
  rqaMetaIndividual: number;
  deleted: boolean;
  deletedAt: string | null;
  createdAt: string;
}

/** Contrato padrão dos registros que existiam antes desta divisão. */
export const DEFAULT_CONTRACT_SLUG = 'lom';

// Organização padrão criada na migração 0040 (Fase 1 do multi-empresa) —
// hoje é a única que existe, então toda conta/contrato novo cai nela por
// padrão. Id fixo de propósito (o mesmo hardcoded na própria migração
// SQL), pra sempre bater com o que já está no banco.
export const DEFAULT_ORGANIZATION_ID = '76242633-4bf5-477f-b2e8-05f388777654';

/** Gera um identificador estável a partir do nome digitado pelo administrador. */
export function slugifyContract(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Título de identificação do sistema para o contrato ativo. */
export function contractSystemTitle(contract: Pick<ContractInfo, 'name' | 'preposition'> | null): string {
  if (!contract) return 'Gestão de Controle de Contratos';
  return `Gestão de Controle do Contrato ${contract.preposition} ${contract.name}`;
}

/**
 * Mesmo título, separado em prefixo (branco) e nome do contrato (destacado em
 * laranja no cabeçalho) — para poder estilizar só a última parte.
 */
export function contractSystemTitleParts(
  contract: Pick<ContractInfo, 'name' | 'preposition'> | null
): { prefix: string; label: string } {
  if (!contract) return { prefix: 'Gestão de Controle de', label: 'Contratos' };
  return {
    prefix: `Gestão de Controle do Contrato ${contract.preposition}`,
    label: contract.name,
  };
}

/** Campo personalizado definido para um contrato (ver server/db-contract-fields.ts). */
export interface CustomFieldInfo {
  id: string;
  contractSlug: string;
  fieldKey: string;
  label: string;
  fieldType: 'text' | 'number' | 'date';
}

