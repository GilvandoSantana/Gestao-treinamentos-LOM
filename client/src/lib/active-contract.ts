/**
 * Contrato ativo do administrador.
 *
 * Só o administrador principal usa isso: como ele não pertence a nenhum
 * contrato, escolhe no cabeçalho em qual está trabalhando. O valor viaja em um
 * cabeçalho HTTP e o servidor o usa tanto para filtrar quanto para definir o
 * contrato do que ele cadastrar. Vazio = todos os contratos.
 */

const KEY = 'training-manager:active-contract';

export const ACTIVE_CONTRACT_HEADER = 'x-active-contract';

export function getActiveContract(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setActiveContract(value: string): void {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    // navegador sem localStorage: segue como "todos"
  }
}
