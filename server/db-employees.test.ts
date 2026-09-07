import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetDb = vi.fn();

vi.mock('./db', () => ({
  getDb: () => mockGetDb(),
}));

function makeEmployeeRow(overrides: Partial<{ id: string; contract: string }> = {}) {
  return {
    id: overrides.id ?? 'emp-1',
    name: 'Colaborador Teste',
    contract: overrides.contract ?? 'contrato-a',
  };
}

describe('getEmployeeScoped', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devolve o colaborador quando ele pertence ao contrato informado', async () => {
    const row = makeEmployeeRow({ contract: 'contrato-a' });
    mockGetDb.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([row]) }) }) }),
    });

    const { getEmployeeScoped } = await import('./db-employees');
    const result = await getEmployeeScoped('emp-1', 'contrato-a');

    expect(result?.id).toBe('emp-1');
  });

  it('devolve undefined quando o colaborador pertence a OUTRO contrato', async () => {
    // Achado real de auditoria de seguranca (07/09): antes, varias rotas
    // (excluir, demitir, resetar acesso do portal, etc) confiavam so no
    // id, sem checar de quem era o colaborador - alguem do contrato B,
    // sabendo o UUID de um colaborador do contrato A, conseguia mexer
    // nele. Este e o teste que garante que isso nao volta a acontecer.
    const row = makeEmployeeRow({ contract: 'contrato-a' });
    mockGetDb.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([row]) }) }) }),
    });

    const { getEmployeeScoped } = await import('./db-employees');
    const result = await getEmployeeScoped('emp-1', 'contrato-b');

    expect(result).toBeUndefined();
  });

  it('devolve o colaborador de QUALQUER contrato quando contract e null (administrador principal vendo "Todos")', async () => {
    const row = makeEmployeeRow({ contract: 'contrato-qualquer' });
    mockGetDb.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([row]) }) }) }),
    });

    const { getEmployeeScoped } = await import('./db-employees');
    const result = await getEmployeeScoped('emp-1', null);

    expect(result?.id).toBe('emp-1');
  });

  it('devolve undefined quando o colaborador simplesmente nao existe', async () => {
    mockGetDb.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });

    const { getEmployeeScoped } = await import('./db-employees');
    const result = await getEmployeeScoped('emp-inexistente', 'contrato-a');

    expect(result).toBeUndefined();
  });
});
