import { describe, it, expect } from 'vitest';
import { normalizeCpf } from './db-employee-portal';

describe('normalizeCpf', () => {
  it('remove pontuação padrão de CPF (pontos e hífen)', () => {
    expect(normalizeCpf('123.456.789-00')).toBe('12345678900');
  });

  it('mantém igual quando já vem só com dígitos', () => {
    expect(normalizeCpf('12345678900')).toBe('12345678900');
  });

  it('remove espaços também', () => {
    expect(normalizeCpf('123 456 789 00')).toBe('12345678900');
  });

  it('duas formas diferentes do mesmo CPF normalizam pro mesmo valor', () => {
    expect(normalizeCpf('123.456.789-00')).toBe(normalizeCpf('12345678900'));
  });

  it('string vazia vira string vazia', () => {
    expect(normalizeCpf('')).toBe('');
  });
});
