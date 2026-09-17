import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withTimeout } from './chunked-upload';

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolve normalmente quando a promessa termina antes do limite', async () => {
    const promise = withTimeout(Promise.resolve('ok'), 5000, 'teste');
    await expect(promise).resolves.toBe('ok');
  });

  it('rejeita com mensagem clara quando o limite de tempo é atingido — o caso central deste achado (Gilvando, 17/09: conexão travada, nenhum aviso aparecia)', async () => {
    // Uma promessa que nunca resolve nem rejeita — simula exatamente uma
    // conexão travada.
    const neverSettles = new Promise(() => {});
    const promise = withTimeout(neverSettles, 5000, 'Criar/verificar pasta');

    const expectation = expect(promise).rejects.toThrow('"Criar/verificar pasta" não respondeu em 5s.');
    vi.advanceTimersByTime(5000);
    await expectation;
  });

  it('repassa o erro original se a promessa rejeitar antes do limite (não troca por um erro de timeout genérico)', async () => {
    const promise = withTimeout(Promise.reject(new Error('erro de verdade')), 5000, 'teste');
    await expect(promise).rejects.toThrow('erro de verdade');
  });
});
