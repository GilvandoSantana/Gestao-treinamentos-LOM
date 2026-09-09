import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ retrieve: vi.fn(), finalize: vi.fn() }));
vi.mock('./stripe-client', () => ({ isStripeConfigured: () => true, getStripe: () => ({ checkout: { sessions: { retrieve: m.retrieve } } }) }));
vi.mock('./db-organizations', () => ({ finalizePaidSignup: m.finalize }));
import { signupRouter } from './routers/signup';
beforeEach(() => { vi.clearAllMocks(); m.retrieve.mockResolvedValue({ id: 'checkout', payment_status: 'paid', client_reference_id: 'pending', subscription: 'sub', customer: 'cus' }); m.finalize.mockResolvedValue({ admin: { id: 'admin' } }); });
it('confirms an already finalized payment without issuing a reusable login cookie', async () => {
  const cookie = vi.fn();
  const result = await signupRouter.createCaller({ req: {}, res: { cookie } } as any).finalizeAfterPayment({ sessionId: 'checkout' });
  expect(result).toEqual({ success: true, requiresLogin: true }); expect(cookie).not.toHaveBeenCalled();
  expect(m.finalize).toHaveBeenCalledWith('pending', expect.objectContaining({ checkoutSessionId: 'checkout' }));
});
it('does not provision an unpaid checkout', async () => {
  m.retrieve.mockResolvedValue({ payment_status: 'unpaid', client_reference_id: 'pending' });
  await expect(signupRouter.createCaller({} as any).finalizeAfterPayment({ sessionId: 'checkout' })).rejects.toThrow('Pagamento não confirmado');
  expect(m.finalize).not.toHaveBeenCalled();
});
