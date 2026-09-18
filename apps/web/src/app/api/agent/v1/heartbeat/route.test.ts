import { POST } from './route';

const boundary = vi.hoisted(() => ({ authenticateDevice: vi.fn(), recordHeartbeat: vi.fn() }));
vi.mock('../../../../../lib/device-auth', () => boundary);

beforeEach(() => vi.clearAllMocks());

it('returns HTTP 401 for a revoked device token', async () => {
  boundary.authenticateDevice.mockRejectedValue({ status: 401, code: 'DEVICE_REVOKED' });
  const response = await POST(new Request('https://lazybot.test/api/agent/v1/heartbeat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer revoked' },
    body: JSON.stringify({ agentVersion: '1.0.0', os: 'linux', capabilities: [], certificates: [] }),
  }));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: 'DEVICE_REVOKED' });
  expect(boundary.recordHeartbeat).not.toHaveBeenCalled();
});

it('returns sanitized online status after recording a valid heartbeat', async () => {
  boundary.authenticateDevice.mockResolvedValue({ id: '60000000-0000-4000-8000-000000000071', ownerId: '10000000-0000-4000-8000-000000000071', name: 'Executor' });
  boundary.recordHeartbeat.mockResolvedValue({ id: '60000000-0000-4000-8000-000000000071', online: true, certificateCount: 1, lastSeenAt: '2026-09-18T12:00:00Z' });
  const response = await POST(new Request('https://lazybot.test/api/agent/v1/heartbeat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer valid' },
    body: JSON.stringify({ agentVersion: '1.0.0', os: 'linux', capabilities: ['pgdas'], certificates: [{ fingerprint: 'a'.repeat(64), subject: 'Responsável fictício', expiresAt: '2027-01-01T00:00:00Z', available: true }] }),
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ device: { id: '60000000-0000-4000-8000-000000000071', online: true, certificateCount: 1, lastSeenAt: '2026-09-18T12:00:00Z' } });
});
