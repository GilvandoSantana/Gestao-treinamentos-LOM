import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ getContractById: vi.fn(), getContractBySlug: vi.fn(), listContracts: vi.fn(), setContractPgr: vi.fn(), removeContractPgr: vi.fn(), uploadFdsToSupabase: vi.fn(), deleteFdsFromSupabase: vi.fn(), getSignedFdsUrl: vi.fn() }));
vi.mock('./db-contracts', () => m);
vi.mock('./supabase-storage', () => m);
vi.mock('./db-activity', () => ({ logActivity: vi.fn() }));
import { contractsRouter } from './routers/contracts';
const own = { id: 'test', slug: 'own', organizationId: 'org', name: 'Test', deleted: false, pgrFileUrl: 'old-file' };
const context = { user: null, isSiteAdmin: true, siteAdminUsername: 'test', siteRole: 'admin', siteContract: 'own', siteOrganizationId: 'org', siteHasTwoFactorEnabled: false, isImpersonating: false, req: { headers: {}, socket: {} }, res: {} } as any;
const input = { id: 'test', fileName: 'test.pdf', fileData: Buffer.from('%PDF-1.7\nSynthetic test\n%%EOF').toString('base64') };
beforeEach(() => {
  vi.resetAllMocks(); m.getContractById.mockResolvedValue(own); m.getContractBySlug.mockResolvedValue(own);
  m.listContracts.mockResolvedValue([own]); m.uploadFdsToSupabase.mockResolvedValue({ url: 'new-file' }); m.getSignedFdsUrl.mockResolvedValue('short-lived-url');
});
it('does not reveal a stored public URL in contract metadata', async () => {
  const caller = contractsRouter.createCaller(context);
  expect((await caller.list())[0]).toMatchObject({ hasPgr: true, pgrFileUrl: null });
  expect(await caller.getManagerName({ slug: 'own' })).not.toHaveProperty('pgrFileUrl');
});
it('authorizes the contract before signing a five-minute link', async () => {
  expect(await contractsRouter.createCaller(context).downloadPgr({ slug: 'own' })).toEqual({ url: 'short-lived-url' });
  expect(m.getSignedFdsUrl).toHaveBeenCalledWith('old-file', 300);
  m.getSignedFdsUrl.mockClear(); m.getContractBySlug.mockResolvedValue(undefined);
  await expect(contractsRouter.createCaller(context).downloadPgr({ slug: 'foreign' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(m.getSignedFdsUrl).not.toHaveBeenCalled();
});
it('keeps the old file if uploading its replacement fails', async () => {
  m.uploadFdsToSupabase.mockRejectedValue(new Error('upload failure'));
  await expect(contractsRouter.createCaller(context).uploadPgr(input)).rejects.toThrow();
  expect(m.deleteFdsFromSupabase).not.toHaveBeenCalled(); expect(m.setContractPgr).not.toHaveBeenCalled();
});
it('cleans only the new upload when the database write fails', async () => {
  m.setContractPgr.mockRejectedValue(new Error('database failure'));
  await expect(contractsRouter.createCaller(context).uploadPgr(input)).rejects.toThrow();
  expect(m.deleteFdsFromSupabase).toHaveBeenCalledExactlyOnceWith('new-file');
});
it('deletes the old object only after committing the replacement', async () => {
  await contractsRouter.createCaller(context).uploadPgr(input);
  expect(m.setContractPgr.mock.invocationCallOrder[0]).toBeLessThan(m.deleteFdsFromSupabase.mock.invocationCallOrder[0]);
  expect(m.deleteFdsFromSupabase).toHaveBeenCalledExactlyOnceWith('old-file');
});
it('rejects non-PDF bytes even with a PDF filename', async () => {
  await expect(contractsRouter.createCaller(context).uploadPgr({ ...input, fileData: Buffer.from('<html>invalid</html>').toString('base64') })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  expect(m.uploadFdsToSupabase).not.toHaveBeenCalled();
});
it('preserves the object when removing its database reference fails', async () => {
  m.removeContractPgr.mockRejectedValue(new Error('database failure'));
  await expect(contractsRouter.createCaller(context).removePgr({ id: 'test' })).rejects.toThrow();
  expect(m.deleteFdsFromSupabase).not.toHaveBeenCalled();
});
