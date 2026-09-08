import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetDb = vi.fn();

vi.mock('./db', () => ({
  getDb: () => mockGetDb(),
}));

describe('isDesktopSessionRevoked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devolve false quando a sessão existe e não foi revogada', async () => {
    mockGetDb.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => Promise.resolve([{ id: 's1', revokedAt: null }]) }) }),
    });

    const { isDesktopSessionRevoked } = await import('./db-desktop-sessions');
    expect(await isDesktopSessionRevoked('s1')).toBe(false);
  });

  it('devolve true quando a sessão foi revogada', async () => {
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({ where: () => Promise.resolve([{ id: 's1', revokedAt: new Date() }]) }),
      }),
    });

    const { isDesktopSessionRevoked } = await import('./db-desktop-sessions');
    expect(await isDesktopSessionRevoked('s1')).toBe(true);
  });

  it('devolve true quando o id nao existe no banco (nunca deixa passar algo desconhecido)', async () => {
    mockGetDb.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    });

    const { isDesktopSessionRevoked } = await import('./db-desktop-sessions');
    expect(await isDesktopSessionRevoked('id-que-nao-existe')).toBe(true);
  });

  it('devolve false quando o banco esta fora do ar (nao bloqueia login por causa disso)', async () => {
    mockGetDb.mockResolvedValue(null);

    const { isDesktopSessionRevoked } = await import('./db-desktop-sessions');
    expect(await isDesktopSessionRevoked('s1')).toBe(false);
  });
});
