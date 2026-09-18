import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { agentEnrollment, agentHeartbeat, deviceHeartbeatStatus, type AgentEnrollment, type AgentHeartbeat, type DeviceHeartbeatStatus } from '@lazybot/contracts';
import { createClient } from './supabase/server';

export type DevicePrincipal = { id: string; ownerId: string; name: string };

export class DeviceAuthError extends Error {
  constructor(public readonly code: 'DEVICE_UNAUTHORIZED' | 'DEVICE_REVOKED' | 'ENROLLMENT_INVALID', public readonly status = 401) {
    super(code);
  }
}

function pepper(): string {
  const value = process.env.DEVICE_TOKEN_PEPPER;
  if (!value) throw new Error('DEVICE_TOKEN_PEPPER is required');
  return value;
}

export async function hashDeviceToken(raw: string): Promise<string> {
  return createHash('sha256').update(pepper()).update('\0').update(raw).digest('hex');
}

function tokenId(raw: string): string | null {
  const [id, secret, ...extra] = raw.split('.');
  return extra.length === 0 && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id ?? '') && (secret?.length ?? 0) >= 24 ? id : null;
}

function matchesHash(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

export async function authenticateDevice(request: Request): Promise<DevicePrincipal> {
  const authorization = request.headers.get('authorization');
  const raw = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const id = tokenId(raw);
  if (!id) throw new DeviceAuthError('DEVICE_UNAUTHORIZED');
  const tokenHash = await hashDeviceToken(raw);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_device_auth_candidate', { p_device_id: id, p_token_hash: tokenHash });
  const candidate = Array.isArray(data) ? data[0] : null;
  if (error || !candidate || !matchesHash(tokenHash, candidate.token_hash)) throw new DeviceAuthError('DEVICE_UNAUTHORIZED');
  if (candidate.revoked_at) throw new DeviceAuthError('DEVICE_REVOKED');
  return { id: candidate.id, ownerId: candidate.owner_id, name: candidate.name };
}

export async function redeemEnrollmentToken(input: AgentEnrollment): Promise<{ deviceId: string; deviceToken: string }> {
  const parsed = agentEnrollment.parse(input);
  const enrollmentId = tokenId(parsed.enrollmentToken);
  if (!enrollmentId) throw new DeviceAuthError('ENROLLMENT_INVALID');
  const enrollmentHash = await hashDeviceToken(parsed.enrollmentToken);
  const deviceId = randomUUID();
  const deviceToken = `${deviceId}.${randomBytes(32).toString('base64url')}`;
  const deviceHash = await hashDeviceToken(deviceToken);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('redeem_device_enrollment', {
    p_enrollment_id: enrollmentId,
    p_enrollment_hash: enrollmentHash,
    p_device_id: deviceId,
    p_device_hash: deviceHash,
    p_os: parsed.os,
    p_agent_version: parsed.agentVersion,
  });
  if (error || !data) throw new DeviceAuthError('ENROLLMENT_INVALID');
  return { deviceId, deviceToken };
}

export async function recordHeartbeat(principal: DevicePrincipal, rawToken: string, input: AgentHeartbeat): Promise<DeviceHeartbeatStatus> {
  const parsed = agentHeartbeat.parse(input);
  const tokenHash = await hashDeviceToken(rawToken);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('record_device_heartbeat', {
    p_device_id: principal.id,
    p_token_hash: tokenHash,
    p_os: parsed.os,
    p_agent_version: parsed.agentVersion,
    p_capabilities: parsed.capabilities,
    p_certificates: parsed.certificates,
  });
  if (error) throw new DeviceAuthError(error.code === '28000' ? 'DEVICE_REVOKED' : 'DEVICE_UNAUTHORIZED');
  return deviceHeartbeatStatus.parse(data);
}
