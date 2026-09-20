import { beforeEach, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
const m = vi.hoisted(() => ({ getEmployeeByCpf: vi.fn(), activateEmployeePortal: vi.fn(), getEmployeeById: vi.fn(), getTrainingsByEmployeeId: vi.fn() }));
vi.mock('./db-employee-portal', () => ({ ...m, normalizeCpf: (cpf: string) => cpf.replace(/\D/g, '') }));
vi.mock('./db-employees', () => m);
import { employeePortalRouter } from './routers/employee-portal';
import { createEmployeeSessionToken, verifyEmployeeSessionToken, clearEmployeePortalAttempts } from './site-auth';
const cpf = '00000000000';
const person = { id: 'test', contract: 'own', name: 'Synthetic', role: 'Test', portalPinHash: 'initial-hash', dismissed: false };
function context(token = '') { return { user: null, req: { headers: { cookie: `employee_session=${token}` }, ip: 'portal-test', socket: {}, protocol: 'https' }, res: { cookie: vi.fn(), clearCookie: vi.fn() } } as any; }
beforeEach(() => {
  vi.clearAllMocks(); process.env.SESSION_SECRET = 'isolated-portal-test-secret-32chars';
  clearEmployeePortalAttempts('portal-test', cpf);
  m.getEmployeeById.mockResolvedValue(person); m.getEmployeeByCpf.mockResolvedValue(person);
  m.getTrainingsByEmployeeId.mockResolvedValue([]); m.activateEmployeePortal.mockResolvedValue(null);
});
it('does not query or reveal the existence of an account', async () => {
  expect(await employeePortalRouter.createCaller(context()).checkAccess({ cpf })).toEqual({ hasPortalAccess: true });
  expect(m.getEmployeeByCpf).not.toHaveBeenCalled();
});
it('rejects birth-date-only activation', async () => {
  await expect(employeePortalRouter.createCaller(context()).firstAccessSetup({ cpf, birthDate: '1990-01-01', pin: '123456' } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  expect(m.activateEmployeePortal).not.toHaveBeenCalled();
});
it('uses the same activation error for unknown CPF and invalid code', async () => {
  const input = { cpf, activationCode: 'invalid-code', pin: '123456' };
  const first = await employeePortalRouter.createCaller(context()).firstAccessSetup(input).catch(e => e.message);
  m.getEmployeeByCpf.mockResolvedValue(undefined);
  const second = await employeePortalRouter.createCaller(context()).firstAccessSetup(input).catch(e => e.message);
  expect(first).toBe(second);
  expect(first).toContain('código válido');
});
it('revokes sessions after reset, PIN change, dismissal or contract change', async () => {
  const token = await createEmployeeSessionToken(person.id, person.contract, person.portalPinHash);
  const caller = employeePortalRouter.createCaller(context(token));
  expect((await caller.me())?.name).toBe(person.name);
  for (const change of [{ portalPinHash: null }, { portalPinHash: 'new-hash' }, { dismissed: true }, { contract: 'other' }]) {
    m.getEmployeeById.mockResolvedValue({ ...person, ...change });
    expect(await caller.me()).toBeNull();
  }
});
it('rejects legacy sessions without a revocable version', async () => {
  const token = await new SignJWT({ scope: 'employee-portal', employeeId: 'test', contractSlug: 'own' })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('2h').sign(new TextEncoder().encode(process.env.SESSION_SECRET));
  expect(await verifyEmployeeSessionToken(token)).toBeNull();
});
it('does not log in a dismissed employee', async () => {
  m.getEmployeeByCpf.mockResolvedValue({ ...person, dismissed: true });
  await expect(employeePortalRouter.createCaller(context()).login({ cpf, pin: '123456' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
