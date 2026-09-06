import { describe, it, expect } from 'vitest';
import { formatBytes } from './cloud';

describe('formatBytes', () => {
  it('trata zero como caso especial ("0 B", não "0.0 B")', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('bytes pequenos ficam em B, sem casa decimal', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('converte pra KB corretamente', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('converte pra MB corretamente', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });

  it('converte pra GB corretamente', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('converte pra TB corretamente (maior unidade)', () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1.0 TB');
  });

  it('acima de 10 unidades, esconde a casa decimal (10 GB, não 10.0 GB)', () => {
    expect(formatBytes(10 * 1024 * 1024 * 1024)).toBe('10 GB');
    expect(formatBytes(99 * 1024 * 1024 * 1024)).toBe('99 GB');
  });

  it('abaixo de 10 unidades (fora de B), mantém uma casa decimal', () => {
    expect(formatBytes(9.5 * 1024 * 1024 * 1024)).toBe('9.5 GB');
  });

  it('não passa de TB mesmo com um valor absurdamente grande', () => {
    const result = formatBytes(1024 * 1024 * 1024 * 1024 * 1024 * 5); // 5 PB
    expect(result).toContain('TB');
  });
});
