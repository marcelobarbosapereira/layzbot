import { createDeviceEnrollment, listDevices, revokeDevice } from './actions';

const boundary = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), select: vi.fn() }));
vi.mock('../../lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: boundary.getUser },
  rpc: boundary.rpc,
  from: () => ({ select: boundary.select }),
}) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DEVICE_TOKEN_PEPPER', 'server-only-test-pepper');
  boundary.getUser.mockResolvedValue({ data: { user: { id: '10000000-0000-4000-8000-000000000071' } }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

it('returns a raw enrollment token once while persisting only its hash', async () => {
  boundary.rpc.mockImplementation(async (_name, args) => ({ data: args.p_enrollment_id, error: null }));
  const result = await createDeviceEnrollment({ name: 'Executor escritório' });
  expect(result.status).toBe('success');
  if (result.status !== 'success') throw new Error('expected success');
  expect(result.enrollmentToken).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/);
  const rpcArgs = boundary.rpc.mock.calls[0][1];
  expect(rpcArgs.p_token_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(rpcArgs)).not.toContain(result.enrollmentToken);
});

it('revokes only through the authenticated owner RPC', async () => {
  boundary.rpc.mockResolvedValue({ data: null, error: null });
  await expect(revokeDevice('60000000-0000-4000-8000-000000000071')).resolves.toEqual({ status: 'success' });
  expect(boundary.rpc).toHaveBeenCalledWith('revoke_device', { p_device_id: '60000000-0000-4000-8000-000000000071' });
});

it('computes online status on the server and returns no token fields', async () => {
  boundary.select.mockResolvedValue({ data: [{ id: '60000000-0000-4000-8000-000000000071', name: 'Executor', os: 'linux', agent_version: '1.0.0', last_seen_at: '2026-09-18T11:59:30Z', revoked_at: null, device_certificates: [{ count: 2 }] }], error: null });
  const devices = await listDevices(new Date('2026-09-18T12:00:00Z'));
  expect(devices).toEqual([{ id: '60000000-0000-4000-8000-000000000071', name: 'Executor', os: 'linux', agentVersion: '1.0.0', lastSeenAt: '2026-09-18T11:59:30Z', revokedAt: null, online: true, certificateCount: 2 }]);
  expect(JSON.stringify(devices)).not.toContain('token');
});
