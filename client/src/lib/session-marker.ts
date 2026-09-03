/**
 * Marcador da sessão do navegador.
 *
 * Fica só em memória (variável do módulo), não em sessionStorage. Isso
 * significa que ele some ao recarregar a página (F5) e não só ao fechar a
 * aba — o servidor exige esse valor junto com o cookie de login, então sem
 * ele o acesso cai e pede login de novo em qualquer um dos dois casos,
 * mesmo quando o cookie continua válido.
 */

let marker: string | null = null;

export function getSessionMarker(): string | null {
  return marker;
}

export function setSessionMarker(value: string): void {
  marker = value;
}

export function clearSessionMarker(): void {
  marker = null;
}
