import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetDb = vi.fn();
const mockGetAdminByUsername = vi.fn();
const mockCreateAdmin = vi.fn();
const mockInsert = vi.fn();

vi.mock('./db', () => ({
  getDb: () => mockGetDb(),
}));

vi.mock('./db-admins', () => ({
  getAdminByUsername: (username: string) => mockGetAdminByUsername(username),
  createAdmin: (input: unknown) => mockCreateAdmin(input),
}));

describe('createOrganizationWithOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Banco "presente" por padrão — cada teste ajusta o que precisa.
    mockGetDb.mockResolvedValue({
      insert: () => ({ values: mockInsert }),
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    });
    mockGetAdminByUsername.mockResolvedValue(undefined);
  });

  it('rejeita quando já existe uma organização com o mesmo identificador', async () => {
    mockGetDb.mockResolvedValue({
      insert: () => ({ values: mockInsert }),
      // Simula getOrganizationBySlug encontrando uma linha já existente.
      select: () => ({ from: () => ({ where: () => Promise.resolve([{ id: 'org-existente', slug: 'acme' }]) }) }),
    });

    const { createOrganizationWithOwner } = await import('./db-organizations');
    await expect(
      createOrganizationWithOwner({
        organizationName: 'Acme',
        organizationSlug: 'acme',
        adminUsername: 'dono',
        adminPasswordHash: 'hash-ja-pronto',
      })
    ).rejects.toThrow(/já existe uma organização/i);

    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it('rejeita quando o nome de usuário do administrador já existe (em qualquer organização)', async () => {
    mockGetAdminByUsername.mockResolvedValue({ id: 'admin-de-outra-empresa', username: 'dono' });

    const { createOrganizationWithOwner } = await import('./db-organizations');
    await expect(
      createOrganizationWithOwner({
        organizationName: 'Acme',
        organizationSlug: 'acme-nova',
        adminUsername: 'dono',
        adminPasswordHash: 'hash-ja-pronto',
      })
    ).rejects.toThrow(/nome de usuário já está em uso/i);

    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it('cria a organização e o administrador quando não há nenhuma colisão', async () => {
    mockCreateAdmin.mockResolvedValue({
      id: 'admin-novo',
      username: 'dono',
      role: 'admin',
      organizationId: 'qualquer-id',
    });

    let selectCallCount = 0;
    mockGetDb.mockResolvedValue({
      insert: () => ({ values: mockInsert }),
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            // 1ª chamada: getOrganizationBySlug checando duplicidade (nada
            // encontrado ainda). 2ª chamada: getOrganizationById buscando
            // de volta a organização recém-criada.
            if (selectCallCount === 1) return Promise.resolve([]);
            return Promise.resolve([{ id: 'org-nova', slug: 'acme-mineracao', name: 'Acme Mineração' }]);
          },
        }),
      }),
    });

    const { createOrganizationWithOwner } = await import('./db-organizations');
    const result = await createOrganizationWithOwner({
      organizationName: 'Acme Mineração',
      organizationSlug: 'acme-mineracao',
      adminUsername: 'dono',
      adminPasswordHash: 'hash-ja-pronto',
    });

    expect(mockInsert).toHaveBeenCalled(); // organização inserida
    expect(mockCreateAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'dono', role: 'admin' })
    );
    expect(result.admin.username).toBe('dono');
    expect(result.organization.slug).toBe('acme-mineracao');
  });
});
