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

describe('finalizePaidSignup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockResolvedValue({
      insert: () => ({ values: mockInsert }),
      update: () => ({ set: () => ({ where: mockUpdate }) }),
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    });
    mockGetAdminByUsername.mockResolvedValue(undefined);
  });

  const pending = {
    id: 'pending-1',
    organizationName: 'Acme Mineração',
    organizationSlug: 'acme-mineracao',
    adminUsername: 'dono',
    passwordHash: 'hash-ja-pronto',
    email: 'dono@acme.com',
    token: 'token-x',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    createdAt: new Date(),
  };
  const stripeInfo = { customerId: 'cus_123', subscriptionId: 'sub_123', subscriptionStatus: 'active' };

  it('devolve null quando o cadastro pendente já não existe mais (já finalizado antes)', async () => {
    mockGetPendingSignupById.mockResolvedValue(undefined);

    const { finalizePaidSignup } = await import('./db-organizations');
    const result = await finalizePaidSignup('pending-inexistente', stripeInfo);

    expect(result).toBeNull();
    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it('cria a organização, salva os dados do Stripe e apaga o pendente no caminho normal', async () => {
    mockGetPendingSignupById.mockResolvedValue(pending);
    mockCreateAdmin.mockResolvedValue({ id: 'admin-novo', username: 'dono', role: 'admin', organizationId: 'org-nova' });

    let selectCallCount = 0;
    mockGetDb.mockResolvedValue({
      insert: () => ({ values: mockInsert }),
      update: () => ({ set: () => ({ where: mockUpdate }) }),
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) return Promise.resolve([]); // getOrganizationBySlug: nada ainda
            return Promise.resolve([{ id: 'org-nova', slug: 'acme-mineracao', name: 'Acme Mineração' }]); // getOrganizationById
          },
        }),
      }),
    });

    const { finalizePaidSignup } = await import('./db-organizations');
    const result = await finalizePaidSignup('pending-1', stripeInfo);

    expect(result?.admin.username).toBe('dono');
    expect(mockUpdate).toHaveBeenCalled(); // dados do Stripe salvos
    expect(mockDeletePendingSignup).toHaveBeenCalledWith('pending-1');
  });

  it('se der corrida com o webhook (organização já criada por outro caminho), busca e devolve em vez de falhar', async () => {
    // Achado real ao projetar isso: a página de "pagamento concluído" no
    // navegador e o webhook do Stripe podem chegar quase juntos, os dois
    // vendo o pendente ainda existir antes de qualquer um apagar. Quem
    // perde a corrida não deve quebrar — deve simplesmente aproveitar o
    // que o outro já criou.
    mockGetPendingSignupById.mockResolvedValue(pending);

    let selectCallCount = 0;
    mockGetDb.mockResolvedValue({
      insert: () => ({ values: mockInsert }),
      update: () => ({ set: () => ({ where: mockUpdate }) }),
      select: () => ({
        from: () => ({
          where: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              // getOrganizationBySlug (dentro de createOrganizationWithOwner):
              // já existe — quem ganhou a corrida já criou.
              return Promise.resolve([{ id: 'org-nova', slug: 'acme-mineracao', name: 'Acme Mineração' }]);
            }
            // getOrganizationBySlug chamada de novo na recuperação da corrida.
            return Promise.resolve([{ id: 'org-nova', slug: 'acme-mineracao', name: 'Acme Mineração' }]);
          },
        }),
      }),
    });
    mockGetAdminByUsername.mockResolvedValue({
      id: 'admin-do-vencedor-da-corrida',
      username: 'dono',
      role: 'admin',
      organizationId: 'org-nova',
    });

    const { finalizePaidSignup } = await import('./db-organizations');
    const result = await finalizePaidSignup('pending-1', stripeInfo);

    expect(result?.admin.username).toBe('dono');
    expect(mockCreateAdmin).not.toHaveBeenCalled(); // não tentou criar de novo
    expect(mockDeletePendingSignup).toHaveBeenCalledWith('pending-1');
  });
});
