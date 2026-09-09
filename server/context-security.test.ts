import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ session: vi.fn(), account: vi.fn(), contract: vi.fn(), contracts: vi.fn() }));
vi.mock('./_core/sdk', () => ({ sdk: { authenticateRequest: vi.fn(async () => null) } }));
vi.mock('./site-auth', () => ({ getSiteSession: m.session, getRawCookie: vi.fn(), IMPERSONATION_BACKUP_COOKIE: 'backup' }));
vi.mock('./db-admins', () => ({ getAdminById: m.account }));
vi.mock('./db-contracts', () => ({ getContractBySlug: m.contract, listContracts: m.contracts }));
import { createContext } from './_core/context';
const options = (slug?: string) => ({ req: { headers: slug ? { 'x-active-contract': slug } : {} }, res: {} } as any);
beforeEach(() => {
  vi.clearAllMocks();
  m.session.mockResolvedValue({ isSiteAdmin: true, adminId: 'admin-a', role: 'admin', username: 'admin-a' });
  m.account.mockResolvedValue({ role: 'admin', organizationId: 'org-a', contract: 'a', permissions: {}, hasTwoFactorEnabled: false });
  m.contract.mockImplementation(async (slug, org) => slug === 'a' && org === 'org-a' ? { slug: 'a', deleted: false } : undefined);
  m.contracts.mockResolvedValue([{ slug: 'a', deleted: false }]);
});
it('defaults a tenant admin to its own contract, never all organizations', async () => {
  const context = await createContext(options());
  expect(context.siteContract).toBe('a'); expect(context.siteOrganizationId).toBe('org-a');
  expect(m.contracts).toHaveBeenCalledWith(false, 'org-a');
});
it('rejects a forged active contract from another organization', async () => {
  const context = await createContext(options('foreign'));
  expect(m.contract).toHaveBeenCalledWith('foreign', 'org-a');
  expect(context.siteContract).toBeNull(); expect(context.siteOrganizationId).toBe('org-a');
});
it('allows selecting an owned contract', async () => {
  expect((await createContext(options('a'))).siteContract).toBe('a');
});
it('invalidates a named account without organization membership', async () => {
  m.account.mockResolvedValue({ role: 'admin', organizationId: null });
  expect((await createContext(options())).isSiteAdmin).toBe(false);
});
it('keeps platform-wide scope only for the master session', async () => {
  m.session.mockResolvedValue({ isSiteAdmin: true, adminId: null, role: 'admin', username: 'master' });
  const context = await createContext(options());
  expect(context.isSiteAdmin).toBe(true); expect(context.siteContract).toBeNull(); expect(context.siteOrganizationId).toBeNull();
});
it('invalidates the selected contract if the users contract changed organization', async () => {
  m.account.mockResolvedValue({ role: 'user', organizationId: 'org-a', contract: 'foreign', permissions: {} });
  expect((await createContext(options('a'))).siteContract).toBeNull();
});
