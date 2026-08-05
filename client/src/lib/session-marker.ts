/**
 * Marcador da sessão do navegador.
 *
 * Fica no sessionStorage, que o navegador apaga quando a sessão dele termina.
 * O servidor exige que esse valor acompanhe o cookie de login, então reabrir o
 * site depois de fechá-lo pede login de novo — mesmo quando o navegador
 * restaura o cookie sozinho (comportamento padrão no celular).
 */

const KEY = 'training-manager:session-marker';

export function getSessionMarker(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setSessionMarker(marker: string): void {
  try {
    sessionStorage.setItem(KEY, marker);
  } catch {
    // Navegador sem sessionStorage (modo restrito): segue sem o marcador.
  }
}

export function clearSessionMarker(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignora
  }
}
