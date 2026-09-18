import { principal } from '../route-test-helpers';
import { POST } from './route';

const jobBoundary = vi.hoisted(() => ({ authenticateDevice: vi.fn(), hashDeviceToken: vi.fn(), rpc: vi.fn() }));
vi.mock('../../../../../../lib/device-auth', () => ({ authenticateDevice: jobBoundary.authenticateDevice, hashDeviceToken: jobBoundary.hashDeviceToken }));
vi.mock('../../../../../../lib/supabase/server', () => ({ createClient: async () => ({ rpc: jobBoundary.rpc }) }));

beforeEach(() => {
  vi.clearAllMocks();
  jobBoundary.authenticateDevice.mockResolvedValue(principal);
  jobBoundary.hashDeviceToken.mockResolvedValue('a'.repeat(64));
});

it('claims one sanitized snapshot for the authenticated device', async () => {
  const claimed = { itemId: '80000000-0000-4000-8000-000000000081', state: 'authenticating', leaseExpiresAt: '2026-09-18T12:01:30Z' };
  jobBoundary.rpc.mockResolvedValue({ data: claimed, error: null });

  const response = await POST(new Request('https://lazybot.test/api/agent/v1/jobs/claim', {
    method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: '{}',
  }));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ job: claimed });
  expect(jobBoundary.rpc).toHaveBeenCalledWith('claim_next_batch_item', { p_device_id: principal.id, p_token_hash: 'a'.repeat(64) });
});

it('does not invoke the claim RPC for a revoked device', async () => {
  jobBoundary.authenticateDevice.mockRejectedValue({ status: 401, code: 'DEVICE_REVOKED' });
  const response = await POST(new Request('https://lazybot.test/api/agent/v1/jobs/claim', {
    method: 'POST', headers: { authorization: 'Bearer revoked', 'content-type': 'application/json' }, body: '{}',
  }));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: 'DEVICE_REVOKED' });
  expect(jobBoundary.rpc).not.toHaveBeenCalled();
});
