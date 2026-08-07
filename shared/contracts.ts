/**
 * Contratos atendidos pelo sistema.
 *
 * Cada colaborador, usuário e documento pertence a um contrato. Usuários só
 * enxergam os dados do próprio contrato; o administrador principal enxerga
 * todos.
 */

export const CONTRACTS = [
  'lom',
  'reflorestamento',
  'convergencia',
  'construcao-civil',
  'geomecanica',
  'conjunto-mecanizado',
  'integridade-estrutural',
] as const;

export type Contract = (typeof CONTRACTS)[number];

export const CONTRACT_LABELS: Record<Contract, string> = {
  lom: 'LOM',
  reflorestamento: 'Reflorestamento',
  convergencia: 'Convergência',
  'construcao-civil': 'Construção Civil',
  geomecanica: 'Geomecânica',
  'conjunto-mecanizado': 'Conjunto Mecanizado',
  'integridade-estrutural': 'Integridade Estrutural',
};

/** Contrato padrão dos registros que existiam antes desta divisão. */
export const DEFAULT_CONTRACT: Contract = 'lom';

/**
 * Preposição que combina com o gênero do nome do contrato, para frases como
 * "Gestão de Controle do Contrato ___".
 */
export const CONTRACT_PREPOSITION: Record<Contract, 'do' | 'da'> = {
  lom: 'do',
  reflorestamento: 'do',
  convergencia: 'da',
  'construcao-civil': 'da',
  geomecanica: 'da',
  'conjunto-mecanizado': 'do',
  'integridade-estrutural': 'da',
};

/** Título de identificação do sistema para o contrato ativo. */
export function contractSystemTitle(contract: Contract | null): string {
  if (!contract) return 'Gestão de Controle de Contratos';
  return `Gestão de Controle do Contrato ${CONTRACT_PREPOSITION[contract]} ${CONTRACT_LABELS[contract]}`;
}

/**
 * Mesmo título, separado em prefixo (branco) e nome do contrato (destacado em
 * laranja no cabeçalho) — para poder estilizar só a última parte.
 */
export function contractSystemTitleParts(contract: Contract | null): { prefix: string; label: string } {
  if (!contract) return { prefix: 'Gestão de Controle de', label: 'Contratos' };
  return {
    prefix: `Gestão de Controle do Contrato ${CONTRACT_PREPOSITION[contract]}`,
    label: CONTRACT_LABELS[contract],
  };
}

export function isContract(value: unknown): value is Contract {
  return typeof value === 'string' && (CONTRACTS as readonly string[]).includes(value);
}

export function contractLabel(value: unknown): string {
  return isContract(value) ? CONTRACT_LABELS[value] : '—';
}
