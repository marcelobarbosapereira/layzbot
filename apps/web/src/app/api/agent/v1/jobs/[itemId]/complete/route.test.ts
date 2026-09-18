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

it('completes only from a caller-supplied expected state', async () => {
  jobBoundary.rpc.mockResolvedValue({ data: { itemId, state: 'completed', sequence: 3 }, error: null });
  const response = await POST(new Request('https://lazybot.test', {
    method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
    body: JSON.stringify({ expectedState: 'awaiting_result', message: 'DAS emitido', sequence: 3 }),
  }), { params: Promise.resolve({ itemId }) });
  expect(response.status).toBe(200);
  expect(jobBoundary.rpc).toHaveBeenCalledWith('append_batch_item_event', expect.objectContaining({ p_next_state: 'completed' }));
});
