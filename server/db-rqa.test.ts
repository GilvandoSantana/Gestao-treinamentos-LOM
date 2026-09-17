import { describe, it, expect } from 'vitest';
import { computeRqaReport, type RqaEmployeeInput, type RqaEntryInput } from './db-rqa';

function emp(overrides: Partial<RqaEmployeeInput> & { id: string; name: string }): RqaEmployeeInput {
  return {
    registration: null,
    role: 'FUNÇÃO',
    leader: null,
    area: null,
    ...overrides,
  };
}

describe('computeRqaReport', () => {
  it('sem lançamento ainda pra um colaborador, assume ATIVO e quantidade 0', () => {
    const report = computeRqaReport([emp({ id: 'e1', name: 'Ana' })], new Map(), 2);
    const row = report.porColaborador[0];
    expect(row.situacao).toBe('ATIVO');
    expect(row.quantidade).toBe(0);
    expect(row.metaIndividual).toBe(2);
  });

  it('status OK quando atingiu 100% ou mais da meta (achado da planilha: >=1)', () => {
    const entries = new Map<string, RqaEntryInput>([['e1', { quantidade: 2, situacao: 'ATIVO' }]]);
    const report = computeRqaReport([emp({ id: 'e1', name: 'Ana' })], entries, 2);
    expect(report.porColaborador[0].status).toBe('OK');
    expect(report.porColaborador[0].percentAlcancada).toBe(1);
  });

  it('status ATENÇÃO entre 80% e 99% (achado da planilha: >=0.8 e <1)', () => {
    const report = computeRqaReport(
      [emp({ id: 'e1', name: 'Ana' })],
      new Map([['e1', { quantidade: 4, situacao: 'ATIVO' }]]),
      5
    );
    expect(report.porColaborador[0].status).toBe('ATENÇÃO');
  });

  it('status ABAIXO quando menos de 80% da meta', () => {
    const report = computeRqaReport(
      [emp({ id: 'e1', name: 'Ana' })],
      new Map([['e1', { quantidade: 3, situacao: 'ATIVO' }]]),
      5
    );
    expect(report.porColaborador[0].status).toBe('ABAIXO');
  });

  it('colaborador não ATIVO no mês (férias/afastado/inativo) não tem meta, % nem status de desempenho — mostra a própria situação', () => {
    const report = computeRqaReport(
      [emp({ id: 'e1', name: 'Ana' })],
      new Map([['e1', { quantidade: 0, situacao: 'FERIAS' }]]),
      2
    );
    const row = report.porColaborador[0];
    expect(row.metaIndividual).toBe(0);
    expect(row.percentAlcancada).toBeNull();
    expect(row.status).toBe('FERIAS');
    expect(row.ranking).toBeNull();
  });

  it('ranking ordena do maior pro menor, e não inclui quem não tem meta (não ATIVO)', () => {
    const employeesList = [
      emp({ id: 'e1', name: 'Ana' }),
      emp({ id: 'e2', name: 'Bruno' }),
      emp({ id: 'e3', name: 'Carla' }),
    ];
    const entries = new Map<string, RqaEntryInput>([
      ['e1', { quantidade: 1, situacao: 'ATIVO' }],
      ['e2', { quantidade: 5, situacao: 'ATIVO' }],
      ['e3', { quantidade: 3, situacao: 'FERIAS' }], // não ATIVO, fica de fora do ranking
    ]);
    const report = computeRqaReport(employeesList, entries, 2);
    const byId = Object.fromEntries(report.porColaborador.map((r) => [r.employeeId, r]));
    expect(byId.e2.ranking).toBe(1); // mais RQA
    expect(byId.e1.ranking).toBe(2);
    expect(byId.e3.ranking).toBeNull();
  });

  it('empate no ranking é desfeito por nome (ordem sempre igual, previsível)', () => {
    const employeesList = [emp({ id: 'e1', name: 'Zeca' }), emp({ id: 'e2', name: 'Ana' })];
    const entries = new Map<string, RqaEntryInput>([
      ['e1', { quantidade: 2, situacao: 'ATIVO' }],
      ['e2', { quantidade: 2, situacao: 'ATIVO' }],
    ]);
    const report = computeRqaReport(employeesList, entries, 2);
    const byId = Object.fromEntries(report.porColaborador.map((r) => [r.employeeId, r]));
    expect(byId.e2.ranking).toBe(1); // "Ana" vem antes de "Zeca"
    expect(byId.e1.ranking).toBe(2);
  });

  it('resumo geral: ativos, meta da unidade, total entregue e % geral', () => {
    const employeesList = [
      emp({ id: 'e1', name: 'Ana' }),
      emp({ id: 'e2', name: 'Bruno' }),
      emp({ id: 'e3', name: 'Carla' }),
    ];
    const entries = new Map<string, RqaEntryInput>([
      ['e1', { quantidade: 2, situacao: 'ATIVO' }],
      ['e2', { quantidade: 1, situacao: 'ATIVO' }],
      ['e3', { quantidade: 0, situacao: 'INATIVO' }],
    ]);
    const report = computeRqaReport(employeesList, entries, 2);
    expect(report.totalColaboradores).toBe(3);
    expect(report.ativos).toBe(2); // só Ana e Bruno
    expect(report.metaUnidade).toBe(4); // 2 ativos * meta 2
    expect(report.totalEntregue).toBe(3); // 2 + 1 + 0
    expect(report.percentGeral).toBe(0.75); // 3/4
  });

  it('colaboradores abaixo da meta soma ABAIXO e ATENÇÃO juntos (achado exato da planilha)', () => {
    const employeesList = [
      emp({ id: 'e1', name: 'Ana' }), // OK
      emp({ id: 'e2', name: 'Bruno' }), // ATENÇÃO
      emp({ id: 'e3', name: 'Carla' }), // ABAIXO
    ];
    const entries = new Map<string, RqaEntryInput>([
      ['e1', { quantidade: 5, situacao: 'ATIVO' }],
      ['e2', { quantidade: 4, situacao: 'ATIVO' }],
      ['e3', { quantidade: 1, situacao: 'ATIVO' }],
    ]);
    const report = computeRqaReport(employeesList, entries, 5);
    expect(report.colaboradoresAbaixoMeta).toBe(2); // Bruno + Carla
    expect(report.colaboradoresAtingiramMeta).toBe(1); // Ana
  });

  it('por líder: agrupa corretamente, soma total RQA de todo mundo do líder (mesmo não ATIVO)', () => {
    const employeesList = [
      emp({ id: 'e1', name: 'Ana', leader: 'CLEBER' }),
      emp({ id: 'e2', name: 'Bruno', leader: 'CLEBER' }),
      emp({ id: 'e3', name: 'Carla', leader: 'FERNANDO' }),
    ];
    const entries = new Map<string, RqaEntryInput>([
      ['e1', { quantidade: 2, situacao: 'ATIVO' }],
      ['e2', { quantidade: 1, situacao: 'FERIAS' }], // não ATIVO, mas RQA ainda soma no total do líder
      ['e3', { quantidade: 3, situacao: 'ATIVO' }],
    ]);
    const report = computeRqaReport(employeesList, entries, 2);
    const cleber = report.porLider.find((l) => l.nome === 'CLEBER')!;
    expect(cleber.ativos).toBe(1); // só Ana está ATIVO
    expect(cleber.meta).toBe(2); // 1 ativo * meta 2
    expect(cleber.totalRqa).toBe(3); // 2 + 1, incluindo quem está de férias
    expect(cleber.percentAtingimento).toBe(1.5); // 3/2
  });

  it('por área: mesma lógica de líder, mas agrupando por área', () => {
    const employeesList = [
      emp({ id: 'e1', name: 'Ana', area: 'PINTURA' }),
      emp({ id: 'e2', name: 'Bruno', area: 'ANDAIME' }),
    ];
    const entries = new Map<string, RqaEntryInput>([
      ['e1', { quantidade: 4, situacao: 'ATIVO' }],
      ['e2', { quantidade: 1, situacao: 'ATIVO' }],
    ]);
    const report = computeRqaReport(employeesList, entries, 2);
    expect(report.porArea.map((a) => a.nome)).toEqual(['ANDAIME', 'PINTURA']); // ordem alfabética
    expect(report.porArea.find((a) => a.nome === 'PINTURA')!.totalRqa).toBe(4);
  });

  it('colaborador sem líder/área definido não aparece em nenhum grupo, mas continua no total geral', () => {
    const employeesList = [emp({ id: 'e1', name: 'Ana', leader: null, area: null })];
    const report = computeRqaReport(employeesList, new Map(), 2);
    expect(report.porLider).toEqual([]);
    expect(report.porArea).toEqual([]);
    expect(report.totalColaboradores).toBe(1);
  });

  it('meta da unidade e % geral não quebram quando não há nenhum colaborador ativo (divisão por zero)', () => {
    const employeesList = [emp({ id: 'e1', name: 'Ana' })];
    const entries = new Map<string, RqaEntryInput>([['e1', { quantidade: 0, situacao: 'INATIVO' }]]);
    const report = computeRqaReport(employeesList, entries, 2);
    expect(report.metaUnidade).toBe(0);
    expect(report.percentGeral).toBe(0); // não NaN nem Infinity
  });
});
