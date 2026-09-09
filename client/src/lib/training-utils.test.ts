import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTrainingStatus, getFilteredEmployees, getStatistics, getWorstStatus } from './training-utils';
import type { Employee } from './types';

// "Hoje" fixado em 15/06/2026, meio-dia — assim todo cálculo de dias é
// determinístico, sem depender da data real de quando o teste rodar.
const TODAY = new Date('2026-06-15T12:00:00');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: overrides.id ?? '1',
    name: overrides.name ?? 'Colaborador Teste',
    role: overrides.role ?? 'Função Teste',
    trainings: overrides.trainings ?? [],
    ...overrides,
  } as Employee;
}

describe('getTrainingStatus', () => {
  it.each(['invalid', '2026-02-30', '2026-13-01'])('não considera uma data inválida como válida (%s)', date => {
    expect(getTrainingStatus(date).status).toBe('unknown');
  });
  it('retorna "unknown" quando a data de vencimento está vazia', () => {
    expect(getTrainingStatus('').status).toBe('unknown');
  });

  it('retorna "expired" pra data no passado, com a contagem de dias certa', () => {
    // 10/06/2026 — 5 dias antes de "hoje" (15/06)
    const result = getTrainingStatus('2026-06-10');
    expect(result.status).toBe('expired');
    expect(result.label).toContain('5 dia');
  });

  it('retorna "expiring" pra data dentro de 30 dias', () => {
    // 25/06/2026 — 10 dias depois de "hoje"
    const result = getTrainingStatus('2026-06-25');
    expect(result.status).toBe('expiring');
  });

  it('retorna "expiring" no limite exato de 30 dias', () => {
    // 15/07/2026 — exatamente 30 dias depois de "hoje"
    const result = getTrainingStatus('2026-07-15');
    expect(result.status).toBe('expiring');
  });

  it('retorna "valid" a partir de 31 dias', () => {
    // 16/07/2026 — 31 dias depois de "hoje"
    const result = getTrainingStatus('2026-07-16');
    expect(result.status).toBe('valid');
  });

  it('retorna "expiring" quando vence hoje mesmo (0 dias)', () => {
    const result = getTrainingStatus('2026-06-15');
    expect(result.status).toBe('expiring');
    expect(result.diffDays).toBe(0);
  });
});

describe('getWorstStatus', () => {
  it('não indica conformidade quando um treinamento tem data inválida', () => {
    expect(getWorstStatus(makeEmployee({ trainings: [{ name: 'A', expirationDate: 'invalid' }] as any }))).toBe('unknown');
  });
  it('retorna "none" pra quem não tem nenhum treinamento', () => {
    expect(getWorstStatus(makeEmployee({ trainings: [] }))).toBe('none');
  });

  it('retorna "expired" se tiver ao menos um vencido, mesmo com outros válidos', () => {
    const emp = makeEmployee({
      trainings: [
        { name: 'A', completionDate: '2026-01-01', expirationDate: '2026-06-10' }, // vencido
        { name: 'B', completionDate: '2026-01-01', expirationDate: '2027-01-01' }, // válido
      ] as any,
    });
    expect(getWorstStatus(emp)).toBe('expired');
  });

  it('retorna "expiring" se não tiver vencido, mas tiver vencendo', () => {
    const emp = makeEmployee({
      trainings: [
        { name: 'A', completionDate: '2026-01-01', expirationDate: '2026-06-25' }, // vencendo
        { name: 'B', completionDate: '2026-01-01', expirationDate: '2027-01-01' }, // válido
      ] as any,
    });
    expect(getWorstStatus(emp)).toBe('expiring');
  });

  it('retorna "valid" só quando todos os treinamentos estão em dia', () => {
    const emp = makeEmployee({
      trainings: [{ name: 'A', completionDate: '2026-01-01', expirationDate: '2027-01-01' }] as any,
    });
    expect(getWorstStatus(emp)).toBe('valid');
  });
});

describe('getStatistics', () => {
  it('conta treinamentos (não colaboradores) em cada categoria', () => {
    const employees = [
      makeEmployee({
        trainings: [
          { name: 'A', completionDate: '2026-01-01', expirationDate: '2026-06-10' }, // vencido
          { name: 'B', completionDate: '2026-01-01', expirationDate: '2026-06-25' }, // vencendo
        ] as any,
      }),
      makeEmployee({
        trainings: [{ name: 'C', completionDate: '2026-01-01', expirationDate: '2027-01-01' }] as any, // válido
      }),
    ];
    const stats = getStatistics(employees);
    expect(stats).toEqual({ total: 3, expired: 1, expiring: 1, valid: 1 });
  });

  it('devolve tudo zerado pra lista vazia', () => {
    expect(getStatistics([])).toEqual({ total: 0, expired: 0, expiring: 0, valid: 0 });
  });
});

describe('getFilteredEmployees', () => {
  const joao = makeEmployee({
    id: '1',
    name: 'João Silva',
    trainings: [{ name: 'A', completionDate: '2026-01-01', expirationDate: '2026-06-10' }] as any, // vencido
  });
  const maria = makeEmployee({
    id: '2',
    name: 'Maria Souza',
    trainings: [{ name: 'B', completionDate: '2026-01-01', expirationDate: '2027-01-01' }] as any, // válido
  });
  const employees = [joao, maria];

  it('"all" devolve todo mundo (respeitando a busca)', () => {
    expect(getFilteredEmployees(employees, 'all')).toHaveLength(2);
  });

  it('filtra por nome, sem diferenciar caixa', () => {
    const result = getFilteredEmployees(employees, 'all', 'joão');
    expect(result.map((e) => e.id)).toEqual(['1']);
  });

  it('filtra por status — só quem tem treinamento vencido', () => {
    const result = getFilteredEmployees(employees, 'expired');
    expect(result.map((e) => e.id)).toEqual(['1']);
  });

  it('exclui quem não tem treinamento nenhum de um filtro de status', () => {
    const semTreinamento = makeEmployee({ id: '3', name: 'Sem Treino', trainings: [] });
    const result = getFilteredEmployees([...employees, semTreinamento], 'valid');
    expect(result.map((e) => e.id)).toEqual(['2']);
  });

  it('ordena por nome (primeiro nome primeiro)', () => {
    const result = getFilteredEmployees(employees, 'all');
    expect(result.map((e) => e.name)).toEqual(['João Silva', 'Maria Souza']);
  });
});
