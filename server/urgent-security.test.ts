import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  upsertEmployee: vi.fn(), upsertTraining: vi.fn(), deleteTrainingsExcept: vi.fn(),
  getEmployeeById: vi.fn(), getEmployeeScoped: vi.fn(), getTrainingById: vi.fn(),
  getAllEmployees: vi.fn(), getAdminByUsername: vi.fn(), createDesktopSession: vi.fn(),
  verifyTwoFactorCode: vi.fn(), getCertificatesByTrainingId: vi.fn(), getAdminById: vi.fn(), deleteAdmin: vi.fn(),
  uploadCertificateToSupabase: vi.fn(), getContractBySlug: vi.fn(), listContracts: vi.fn(),
}));
vi.mock('./db', () => ({ getDb: vi.fn(async () => null) }));
vi.mock('./db-employees', () => ({ ...m, getTrainingsGroupedByEmployee: vi.fn(async () => new Map()), getTrainingsByEmployeeId: vi.fn(async () => []) }));
vi.mock('./supabase-storage', () => ({ ...m, getAllPhotoUrls: vi.fn(async () => new Map()) }));
vi.mock('./db-admins', () => ({ getAdminByUsername: m.getAdminByUsername, getAdminById: m.getAdminById, deleteAdmin: m.deleteAdmin }));
vi.mock('./db-desktop-sessions', () => ({ createDesktopSession: m.createDesktopSession }));
vi.mock('./two-factor-auth', () => ({ verifyTwoFactorCode: m.verifyTwoFactorCode }));
vi.mock('./db-certificates', () => ({ getCertificatesByTrainingId: m.getCertificatesByTrainingId }));
vi.mock('./db-contracts', () => ({ getContractBySlug: m.getContractBySlug, listContracts: m.listContracts }));
import { employeesRouter } from './routers/employees';
import { certificatesRouter } from './routers/certificates';
import { contractsRouter } from './routers/contracts';
import { authRouter } from './routers/auth';
import { hashAdminPassword, clearLoginAttempts } from './site-auth';
import { router, masterAdminProcedure } from './_core/trpc';
const ctx = () => ({ user: null, isSiteAdmin: true, siteAdminUsername: 'test-user', siteRole: 'user', sitePermissions: { editEmployees: true, viewEmployees: true, viewCertificates: true, manageCertificates: true }, siteContract: 'contract-a', siteOrganizationId: 'org-a', siteHasTwoFactorEnabled: false, isImpersonating: false, req: { headers: {}, ip: 'security-local', socket: {}, protocol: 'https' }, res: { cookie: vi.fn() } } as any);
const employee = { id: 'own', name: 'Synthetic', role: 'test', trainings: [{ id: 'training', name: 'Test', completionDate: '2026-09-08', expirationDate: '2027-09-08' }] };
beforeEach(() => {
  vi.clearAllMocks();
  m.getTrainingById.mockResolvedValue(undefined);
  process.env.SESSION_SECRET = 'test-secret-not-used-in-production';
  clearLoginAttempts('security-local');
  m.getEmployeeById.mockResolvedValue({ id: 'own', contract: 'contract-a' });
  m.getEmployeeScoped.mockResolvedValue({ id: 'own', contract: 'contract-a' });
  m.getAllEmployees.mockResolvedValue([]);
});
describe('urgent security regressions', () => {
  it('rejects deleting an account from another organization', async () => {
    m.getAdminById.mockResolvedValue({ id: 'foreign', organizationId: 'org-b', role: 'user' });
    await expect(authRouter.createCaller({ ...ctx(), siteRole: 'admin' }).admins.delete({ id: 'foreign' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(m.deleteAdmin).not.toHaveBeenCalled();
  });
  it('rejects a foreign employee before sync writes or deletes anything', async () => {
    m.getEmployeeById.mockResolvedValue({ id: 'own', contract: 'contract-b' });
    const result = await employeesRouter.createCaller(ctx()).sync({ employees: [employee] });
    expect(result.updated).toBe(0); expect(result.failed).toHaveLength(1);
    expect(m.upsertEmployee).not.toHaveBeenCalled(); expect(m.deleteTrainingsExcept).not.toHaveBeenCalled();
  });
  it('rejects foreign training IDs before saving an employee', async () => {
    m.getTrainingById.mockResolvedValue({ id: 'training', employeeId: 'foreign' });
    await expect(employeesRouter.createCaller(ctx()).upsertOne(employee)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(m.upsertEmployee).not.toHaveBeenCalled(); expect(m.upsertTraining).not.toHaveBeenCalled();
  });
  it('rejects foreign training IDs before deleting imported trainings', async () => {
    m.getTrainingById.mockResolvedValue({ employeeId: 'foreign' });
    const result = await employeesRouter.createCaller(ctx()).sync({ employees: [employee] });
    expect(result.updated).toBe(0); expect(m.deleteTrainingsExcept).not.toHaveBeenCalled();
  });
  it('does not expose the portal PIN hash', async () => {
    m.getAllEmployees.mockResolvedValue([{ id: 'own', name: 'Synthetic', portalPinHash: 'private-hash' }]);
    const rows = await employeesRouter.createCaller(ctx()).list();
    expect(rows[0]).not.toHaveProperty('portalPinHash'); expect(rows[0].name).toBe('Synthetic');
  });
  it('filters certificates from foreign employees', async () => {
    m.getCertificatesByTrainingId.mockResolvedValue([{ id: 'secret', employeeId: 'foreign' }, { id: 'visible', employeeId: 'own' }]);
    m.getEmployeeScoped.mockImplementation(async id => id === 'own' ? { id } : undefined);
    expect(await certificatesRouter.createCaller(ctx()).getByTraining({ trainingId: 'training' })).toEqual([{ id: 'visible', employeeId: 'own' }]);
  });
  it('does not upload a certificate for another employees training', async () => {
    m.getTrainingById.mockResolvedValue({ employeeId: 'foreign' });
    await expect(certificatesRouter.createCaller(ctx()).upload({ employeeId: 'own', trainingId: 'training', fileName: 'test.pdf', fileData: 'AA==' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(m.uploadCertificateToSupabase).not.toHaveBeenCalled();
  });
  it.each([undefined, '123456'])('does not issue a desktop session without a valid second factor (%s)', async code => {
    m.getAdminByUsername.mockResolvedValue({ id: 'admin', username: 'audit', role: 'admin', passwordHash: await hashAdminPassword('test-password'), twoFactorSecret: 'secret' });
    m.verifyTwoFactorCode.mockResolvedValue(false);
    await expect(authRouter.createCaller(ctx()).desktopLogin({ username: 'audit', password: 'test-password', twoFactorCode: code })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(m.createDesktopSession).not.toHaveBeenCalled();
  });
  it('allows a desktop login with password and valid second factor', async () => {
    m.getAdminByUsername.mockResolvedValue({ id: 'admin', username: 'audit', role: 'admin', passwordHash: await hashAdminPassword('test-password'), twoFactorSecret: 'secret' });
    m.verifyTwoFactorCode.mockResolvedValue(true);
    const result = await authRouter.createCaller(ctx()).desktopLogin({ username: 'audit', password: 'test-password', twoFactorCode: '123456' });
    expect(result.token).toBeTruthy(); expect(m.createDesktopSession).toHaveBeenCalledOnce();
  });
  it('scopes the contract listing to the organization', async () => {
    const context = { ...ctx(), siteRole: 'admin' };
    await contractsRouter.createCaller(context).list();
    expect(m.listContracts).toHaveBeenCalledWith(false, 'org-a');
  });
  it('rejects a global operation by an organization admin', async () => {
    const caller = router({ global: masterAdminProcedure.query(() => 'secret') }).createCaller({ ...ctx(), siteRole: 'admin' });
    await expect(caller.global()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('rejects data access when an organization has no valid contract', async () => {
    await expect(employeesRouter.createCaller({ ...ctx(), siteRole: 'admin', siteContract: null }).list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(m.getAllEmployees).not.toHaveBeenCalled();
  });
});
