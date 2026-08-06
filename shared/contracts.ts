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

export function isContract(value: unknown): value is Contract {
  return typeof value === 'string' && (CONTRACTS as readonly string[]).includes(value);
}

export function contractLabel(value: unknown): string {
  return isContract(value) ? CONTRACT_LABELS[value] : '—';
}
