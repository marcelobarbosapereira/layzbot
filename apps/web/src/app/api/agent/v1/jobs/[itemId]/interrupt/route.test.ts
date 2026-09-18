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

it('interrupts an owned live lease through one RPC', async () => {
  jobBoundary.rpc.mockResolvedValue({ data: { itemId, state: 'interrupted', sequence: 2 }, error: null });
  const response = await POST(new Request('https://lazybot.test', {
    method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
    body: JSON.stringify({ expectedState: 'transmitting', message: 'Operador interrompeu', sequence: 2 }),
  }), { params: Promise.resolve({ itemId }) });
  expect(response.status).toBe(200);
  expect(jobBoundary.rpc).toHaveBeenCalledWith('append_batch_item_event', expect.objectContaining({ p_next_state: 'interrupted' }));
});
