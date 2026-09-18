import { createHash } from 'node:crypto';

import { authenticateDevice, hashDeviceToken, redeemEnrollmentToken } from './device-auth';

const boundary = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase/server', () => ({ createClient: async () => ({ rpc: boundary.rpc }) }));

const deviceId = '60000000-0000-4000-8000-000000000071';
const ownerId = '10000000-0000-4000-8000-000000000071';
const rawToken = `${deviceId}.device-secret-with-enough-entropy`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DEVICE_TOKEN_PEPPER', 'server-only-test-pepper');
});

afterEach(() => vi.unstubAllEnvs());

it('hashes a device token with SHA-256 and the server-only pepper', async () => {
  const expected = createHash('sha256').update('server-only-test-pepper').update('\0').update(rawToken).digest('hex');
  expect(await hashDeviceToken(rawToken)).toBe(expected);
  expect(await hashDeviceToken(rawToken)).toMatch(/^[a-f0-9]{64}$/);
});

it('authenticates a matching active bearer token without returning either token value', async () => {
  const tokenHash = await hashDeviceToken(rawToken);
  boundary.rpc.mockResolvedValue({
    data: [{ id: deviceId, owner_id: ownerId, token_hash: tokenHash, name: 'Executor fictício', revoked_at: null }],
    error: null,
  });

  const principal = await authenticateDevice(new Request('https://lazybot.test/api/agent/v1/heartbeat', {
    headers: { authorization: `Bearer ${rawToken}` },
  }));

  expect(principal).toEqual({ id: deviceId, ownerId, name: 'Executor fictício' });
  expect(JSON.stringify(principal)).not.toContain(rawToken);
  expect(JSON.stringify(principal)).not.toContain(tokenHash);
});

it('rejects revoked device tokens as unauthorized', async () => {
  const tokenHash = await hashDeviceToken(rawToken);
  boundary.rpc.mockResolvedValue({
    data: [{ id: deviceId, owner_id: ownerId, token_hash: tokenHash, name: 'Executor fictício', revoked_at: '2026-09-18T12:00:00Z' }],
    error: null,
  });

  await expect(authenticateDevice(new Request('https://lazybot.test', {
    headers: { authorization: `Bearer ${rawToken}` },
  }))).rejects.toMatchObject({ status: 401, code: 'DEVICE_REVOKED' });
});

it('rejects requests without a bearer token before querying the database', async () => {
  await expect(authenticateDevice(new Request('https://lazybot.test')))
    .rejects.toMatchObject({ status: 401, code: 'DEVICE_UNAUTHORIZED' });
  expect(boundary.rpc).not.toHaveBeenCalled();
});

it('rejects a bearer token whose hash does not match the stored candidate', async () => {
  boundary.rpc.mockResolvedValue({
    data: [{ id: deviceId, owner_id: ownerId, token_hash: 'f'.repeat(64), name: 'Executor fictício', revoked_at: null }],
    error: null,
  });

  await expect(authenticateDevice(new Request('https://lazybot.test', {
    headers: { authorization: `Bearer ${rawToken}` },
  }))).rejects.toMatchObject({ status: 401, code: 'DEVICE_UNAUTHORIZED' });
});

it('rejects an expired one-time enrollment token without returning a device token', async () => {
  boundary.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'Enrollment token expired' } });

  await expect(redeemEnrollmentToken({
    enrollmentToken: '70000000-0000-4000-8000-000000000071.enrollment-secret-with-enough-entropy',
    os: 'linux',
    agentVersion: '1.0.0',
  })).rejects.toMatchObject({ status: 401, code: 'ENROLLMENT_INVALID' });
});
