import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetDb = vi.fn();

vi.mock('./db', () => ({
  getDb: () => mockGetDb(),
}));

function makeFolderRow(overrides: Partial<{ id: string; name: string; parentId: string | null }> = {}) {
  return {
    id: overrides.id ?? 'folder-1',
    contractSlug: 'lom',
    parentId: overrides.parentId ?? null,
    name: overrides.name ?? 'SSMA',
    createdBy: 'admin',
    createdAt: new Date(),
    deletedAt: null,
    deletedBy: null,
    restrictedToGroupId: null,
  };
}

describe('getFolderByNameInParent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('acha a pasta quando o nome bate exatamente', async () => {
    mockGetDb.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => Promise.resolve([makeFolderRow({ name: 'SSMA' })]) }) }),
    });

    const { getFolderByNameInParent } = await import('./db-cloud');
    const result = await getFolderByNameInParent('lom', null, 'SSMA');

    expect(result?.name).toBe('SSMA');
  });

  it('acha a pasta mesmo com maiúscula/minúscula diferente', async () => {
    // Achado real reportado pelo Gilvando (11/09): o programa de
    // sincronização duplicava pasta inteira ao sincronizar com a Nuvem.
    // A comparação aqui NÃO pode ser sensível a caixa, senão "AET" e
    // "aet" seriam tratadas como pastas diferentes e a duplicata
    // continuaria acontecendo.
    mockGetDb.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => Promise.resolve([makeFolderRow({ name: 'AET' })]) }) }),
    });

    const { getFolderByNameInParent } = await import('./db-cloud');
    const result = await getFolderByNameInParent('lom', null, 'aet');

    expect(result?.name).toBe('AET');
  });

  it('devolve undefined quando não existe pasta com esse nome no mesmo lugar', async () => {
    mockGetDb.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => Promise.resolve([makeFolderRow({ name: 'CIPAMIN' })]) }) }),
    });

    const { getFolderByNameInParent } = await import('./db-cloud');
    const result = await getFolderByNameInParent('lom', null, 'DDS');

    expect(result).toBeUndefined();
  });

  it('não confunde pastas com o mesmo nome em PAIS diferentes', async () => {
    // A query já filtra por parentId no SQL — este teste confirma que,
    // dado o retorno certo do banco pra aquele parentId específico, a
    // função não teria motivo pra achar uma pasta de outro lugar.
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([makeFolderRow({ name: 'DDS', parentId: 'ssma-folder-id' })]),
        }),
      }),
    });

    const { getFolderByNameInParent } = await import('./db-cloud');
    const result = await getFolderByNameInParent('lom', 'ssma-folder-id', 'DDS');

    expect(result?.parentId).toBe('ssma-folder-id');
  });
});
