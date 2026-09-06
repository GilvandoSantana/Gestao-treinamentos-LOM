import { describe, it, expect } from 'vitest';
import { pickUnambiguousAdmin } from './db-admins';
import type { Admin } from '../drizzle/schema';

function makeAdminRow(overrides: Partial<Admin> = {}): Admin {
  return {
    id: overrides.id ?? '1',
    username: overrides.username ?? 'joao',
    passwordHash: 'hash',
    role: 'admin',
    contract: 'contrato-x',
    setor: null,
    permissions: null,
    createdAt: new Date(),
    organizationId: overrides.organizationId ?? 'org-1',
    ...overrides,
  } as Admin;
}

describe('pickUnambiguousAdmin', () => {
  it('devolve a única linha quando só existe um match', () => {
    const row = makeAdminRow({ id: 'admin-1' });
    expect(pickUnambiguousAdmin([row])).toBe(row);
  });

  it('devolve undefined quando não há nenhum match', () => {
    expect(pickUnambiguousAdmin([])).toBeUndefined();
  });

  it('devolve undefined (recusa logar) quando duas organizações diferentes têm o mesmo nome de usuário', () => {
    // Achado real ao trabalhar na Fase 2/3 do multi-empresa: nome de
    // usuário deixou de ser único globalmente (agora é por organização).
    // Sem essa proteção, o login pegaria a primeira linha e a pessoa
    // poderia entrar como o admin ERRADO, de outra empresa.
    const rowOrgA = makeAdminRow({ id: 'admin-org-a', organizationId: 'org-a' });
    const rowOrgB = makeAdminRow({ id: 'admin-org-b', organizationId: 'org-b' });
    expect(pickUnambiguousAdmin([rowOrgA, rowOrgB])).toBeUndefined();
  });

  it('recusa mesmo com mais de duas colisões', () => {
    const rows = [
      makeAdminRow({ id: '1', organizationId: 'org-a' }),
      makeAdminRow({ id: '2', organizationId: 'org-b' }),
      makeAdminRow({ id: '3', organizationId: 'org-c' }),
    ];
    expect(pickUnambiguousAdmin(rows)).toBeUndefined();
  });
});
