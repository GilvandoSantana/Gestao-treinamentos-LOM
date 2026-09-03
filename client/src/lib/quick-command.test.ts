import { describe, it, expect } from 'vitest';
import { parseCommand, findMatchingEmployees, type ParsedCommand } from './quick-command';

describe('parseCommand', () => {
  it('reconhece "crachá do [nome]" (com acento e "do")', () => {
    const result = parseCommand('crachá do João Silva');
    expect(result).toEqual<ParsedCommand>({ action: 'badge', actionLabel: 'Gerar crachá', query: 'joao silva' });
  });

  it('reconhece sem acento também ("cracha")', () => {
    const result = parseCommand('cracha Maria Souza');
    expect(result?.action).toBe('badge');
    expect(result?.query).toBe('maria souza');
  });

  it('reconhece com o nome ANTES da palavra-chave ("João crachá")', () => {
    const result = parseCommand('João crachá');
    expect(result?.action).toBe('badge');
    expect(result?.query).toBe('joao');
  });

  it('reconhece "ficha do [nome]"', () => {
    const result = parseCommand('ficha do Carlos');
    expect(result?.action).toBe('view');
    expect(result?.query).toBe('carlos');
  });

  it('reconhece "editar [nome]"', () => {
    const result = parseCommand('editar Ana Paula');
    expect(result?.action).toBe('edit');
    expect(result?.query).toBe('ana paula');
  });

  it('reconhece "certificados de [nome]"', () => {
    const result = parseCommand('certificados de Pedro');
    expect(result?.action).toBe('certificates');
    expect(result?.query).toBe('pedro');
  });

  it('prioriza a palavra-chave mais longa ("imprimir cracha" antes de só "cracha")', () => {
    const result = parseCommand('imprimir cracha do Zé');
    expect(result?.action).toBe('badge');
    expect(result?.query).toBe('ze');
  });

  it('não reconhece um texto qualquer sem palavra-chave', () => {
    expect(parseCommand('qual o clima hoje')).toBeNull();
  });

  it('não reconhece texto vazio', () => {
    expect(parseCommand('   ')).toBeNull();
  });
});

describe('findMatchingEmployees', () => {
  const employees = [
    { id: '1', name: 'João Carlos Silva' },
    { id: '2', name: 'João Pedro Santos' },
    { id: '3', name: 'Maria Souza' },
    { id: '4', name: 'Ana Paula Lima' },
  ];

  it('encontra por nome exato (sem diferenciar acento/caixa)', () => {
    const result = findMatchingEmployees(employees, 'maria souza');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('encontra por começo do nome', () => {
    const result = findMatchingEmployees(employees, 'joao');
    expect(result.map((e) => e.id).sort()).toEqual(['1', '2']);
  });

  it('encontra por palavras dentro do nome, fora de ordem de sobrenome', () => {
    // "joao silva" deveria bater com "João Carlos Silva" mesmo com o
    // "Carlos" no meio.
    const result = findMatchingEmployees(employees, 'joao silva');
    expect(result.map((e) => e.id)).toContain('1');
    expect(result.map((e) => e.id)).not.toContain('2');
  });

  it('não encontra nada pra consulta vazia', () => {
    expect(findMatchingEmployees(employees, '')).toEqual([]);
  });

  it('não encontra nada quando não bate com nenhum nome', () => {
    expect(findMatchingEmployees(employees, 'xyz123')).toEqual([]);
  });

  it('respeita o limite de resultados', () => {
    const manyJoaos = Array.from({ length: 10 }, (_, i) => ({ id: String(i), name: `João ${i}` }));
    const result = findMatchingEmployees(manyJoaos, 'joao', 3);
    expect(result).toHaveLength(3);
  });

  it('nome exato pontua mais alto que começo de nome, que aparece primeiro no resultado', () => {
    const list = [
      { id: 'a', name: 'João Silva Extra' },
      { id: 'b', name: 'João' },
    ];
    const result = findMatchingEmployees(list, 'joao');
    expect(result[0].id).toBe('b'); // nome exato "João" vem antes de "João Silva Extra"
  });
});
