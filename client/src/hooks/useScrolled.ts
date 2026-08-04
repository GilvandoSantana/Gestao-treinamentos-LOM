import { useEffect, useState } from 'react';

/**
 * Retorna true quando a página passou de um certo ponto de rolagem.
 * Usado para encolher o cabeçalho e liberar tela no celular.
 */
export function useScrolled(threshold: number = 40): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return scrolled;
}
