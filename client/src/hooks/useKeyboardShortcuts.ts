import { useEffect } from 'react';

interface KeyboardShortcutsOptions {
  /** "N" — abre o formulário de novo colaborador. */
  onNewEmployee?: () => void;
  /** "Esc" — fecha o que estiver aberto (ex: um formulário). */
  onEscape?: () => void;
  /** "Ctrl+K" (ou "Cmd+K" no Mac) — abre o Comando Rápido. Funciona mesmo
   * digitando em outro campo, já que é uma combinação que nenhum campo de
   * texto comum usa. */
  onQuickCommand?: () => void;
  /** Desativa os atalhos (ex: quando um modal já está tratando o teclado). */
  enabled?: boolean;
}

/**
 * Atalhos de teclado do desktop — só para agilizar quem usa o sistema o dia
 * inteiro. Sempre ignora quando o foco já está num campo de texto, para não
 * atrapalhar quem está digitando (ex: "n" dentro de um nome de colaborador).
 */
export function useKeyboardShortcuts({
  onNewEmployee,
  onEscape,
  onQuickCommand,
  enabled = true,
}: KeyboardShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // "Ctrl+K"/"Cmd+K" abre o Comando Rápido — funciona mesmo digitando
      // em outro campo, de propósito (nenhum campo de texto comum usa
      // essa combinação, então não atrapalha).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onQuickCommand?.();
        return;
      }

      // "/" foca a busca — funciona mesmo digitando em outro lugar, é o
      // padrão comum (GitHub, Slack etc.), mas nunca dentro de um campo.
      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        document.getElementById('employee-search-input')?.focus();
        return;
      }

      if (isTyping) return;

      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onNewEmployee?.();
        return;
      }

      if (e.key === 'Escape') {
        onEscape?.();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onNewEmployee, onEscape, onQuickCommand]);
}
