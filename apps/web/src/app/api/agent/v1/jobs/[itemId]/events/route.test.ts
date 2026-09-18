import { itemId, principal } from '../../route-test-helpers';
import { POST } from './route';

const jobBoundary = vi.hoisted(() => ({ authenticateDevice: vi.fn(), hashDeviceToken: vi.fn(), rpc: vi.fn() }));
vi.mock('../../../../../../../lib/device-auth', () => ({ authenticateDevice: jobBoundary.authenticateDevice, hashDeviceToken: jobBoundary.hashDeviceToken }));
vi.mock('../../../../../../../lib/supabase/server', () => ({ createClient: async () => ({ rpc: jobBoundary.rpc }) }));

beforeEach(() => {
  vi.clearAllMocks();
  jobBoundary.authenticateDevice.mockResolvedValue(principal);
  jobBoundary.hashDeviceToken.mockResolvedValue('a'.repeat(64));
});

it('appends a validated state event through one RPC', async () => {
  jobBoundary.rpc.mockResolvedValue({ data: { itemId, state: 'transmitting', sequence: 1 }, error: null });
  const response = await POST(new Request('https://lazybot.test', {
    method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
    body: JSON.stringify({ expectedState: 'authenticating', nextState: 'transmitting', message: 'Abrindo portal', sequence: 1 }),
  }), { params: Promise.resolve({ itemId }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ event: { itemId, state: 'transmitting', sequence: 1 } });
  expect(jobBoundary.rpc).toHaveBeenCalledTimes(1);
});

it('maps a lost lease to a stable conflict response', async () => {
  jobBoundary.rpc.mockResolvedValue({ data: { error: 'LEASE_LOST' }, error: null });
  const response = await POST(new Request('https://lazybot.test', {
    method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
    body: JSON.stringify({ expectedState: 'authenticating', nextState: 'transmitting', message: 'Tarde demais', sequence: 1 }),
  }), { params: Promise.resolve({ itemId }) });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: 'LEASE_LOST' });
});
