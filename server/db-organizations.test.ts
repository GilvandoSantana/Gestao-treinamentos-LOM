import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetDb = vi.fn();
const mockGetAdminByUsername = vi.fn();
const mockCreateAdmin = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockGetPendingSignupById = vi.fn();
const mockDeletePendingSignup = vi.fn();

vi.mock('./db', () => ({
  getDb: () => mockGetDb(),
}));

vi.mock('./db-admins', () => ({
  getAdminByUsername: (username: string) => mockGetAdminByUsername(username),
  createAdmin: (input: unknown) => mockCreateAdmin(input),
  // Conversão simples o bastante pros testes — o formato real é testado
  // à parte em server/db-admins.test.ts.
  toPublic: (row: any) => ({ ...row, permissions: row.permissions ?? {} }),
}));

vi.mock('./db-pending-signups', () => ({
  getPendingSignupById: (id: string) => mockGetPendingSignupById(id),
  deletePendingSignup: (id: string) => mockDeletePendingSignup(id),
}));

describe('createOrganizationWithOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Banco "presente" por padrão — cada teste ajusta o que precisa.
    mockGetDb.mockResolvedValue({
      insert: () => ({ values: mockInsert }),
      update: () => ({ set: () => ({ where: mockUpdate }) }),
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

describe('getFolderTemplate / setFolderTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devolve lista vazia quando organizationId é null (sem organização associada)', async () => {
    const { getFolderTemplate } = await import('./db-organizations');
    const result = await getFolderTemplate(null);
    expect(result).toEqual([]);
    expect(mockGetDb).not.toHaveBeenCalled(); // nem chega a consultar o banco
  });

  it('devolve lista vazia quando a organização ainda não tem modelo salvo', async () => {
    mockGetDb.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => Promise.resolve([{ folderTemplate: null }]) }) }),
    });

    const { getFolderTemplate } = await import('./db-organizations');
    const result = await getFolderTemplate('org-1');
    expect(result).toEqual([]);
  });

  it('devolve a lista salva (JSON) corretamente', async () => {
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({ where: () => Promise.resolve([{ folderTemplate: JSON.stringify(['AET', 'CIPAMIN', 'DDS']) }]) }),
      }),
    });

    const { getFolderTemplate } = await import('./db-organizations');
    const result = await getFolderTemplate('org-1');
    expect(result).toEqual(['AET', 'CIPAMIN', 'DDS']);
  });

  it('nunca quebra com um JSON corrompido salvo no banco — devolve vazio', async () => {
    mockGetDb.mockResolvedValue({
      select: () => ({ from: () => ({ where: () => Promise.resolve([{ folderTemplate: '{isso não é json válido' }]) }) }),
    });

    const { getFolderTemplate } = await import('./db-organizations');
    const result = await getFolderTemplate('org-1');
    expect(result).toEqual([]);
  });

  it('setFolderTemplate remove nomes vazios e espaço nas pontas antes de salvar', async () => {
    let savedValue;
    mockGetDb.mockResolvedValue({
      update: () => ({
        set: (values: { folderTemplate: string }) => {
          savedValue = values.folderTemplate;
          return { where: () => Promise.resolve() };
        },
      }),
    });

    const { setFolderTemplate } = await import('./db-organizations');
    await setFolderTemplate('org-1', ['  AET  ', '', 'CIPAMIN', '   ']);

    expect(JSON.parse(savedValue!)).toEqual(['AET', 'CIPAMIN']);
  });
});

// Payment concurrency and rollback are covered against MySQL in integrity.mysql.test.ts.
