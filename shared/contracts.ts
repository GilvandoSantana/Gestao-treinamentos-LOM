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
  slug: string;
  name: string;
  preposition: ContractPreposition;
  deleted: boolean;
  deletedAt: string | null;
  createdAt: string;
}

/** Contrato padrão dos registros que existiam antes desta divisão. */
export const DEFAULT_CONTRACT_SLUG = 'lom';

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
