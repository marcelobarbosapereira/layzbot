import type { DevicePrincipal } from '../../../../../lib/device-auth';
import { authenticateDevice, hashDeviceToken } from '../../../../../lib/device-auth';
import { createClient } from '../../../../../lib/supabase/server';

type StableJobError = 'DEVICE_REVOKED' | 'LEASE_LOST' | 'INVALID_TRANSITION' | 'DUPLICATE_SEQUENCE' | 'INVALID_SEQUENCE' | 'INVALID_REQUEST';

const statuses: Record<StableJobError, number> = {
  DEVICE_REVOKED: 401,
  LEASE_LOST: 409,
  INVALID_TRANSITION: 409,
  DUPLICATE_SEQUENCE: 409,
  INVALID_SEQUENCE: 409,
  INVALID_REQUEST: 400,
};

function stableError(value: unknown): StableJobError | null {
  if (typeof value !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(statuses, value) ? value as StableJobError : null;
}

export async function authenticateAndRpc(
  request: Request,
  rpcName: string,
  args: (principal: DevicePrincipal, tokenHash: string) => Record<string, unknown>,
): Promise<unknown> {
  const principal = await authenticateDevice(request);
  const rawToken = request.headers.get('authorization')?.slice(7) ?? '';
  const tokenHash = await hashDeviceToken(rawToken);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(rpcName, args(principal, tokenHash));
  if (error) {
    const mapped = stableError(error.message);
    throw { code: mapped ?? 'INVALID_REQUEST', status: mapped ? statuses[mapped] : 400 };
  }
  const returned = typeof data === 'object' && data !== null && 'error' in data
    ? stableError((data as { error?: unknown }).error)
    : null;
  if (returned) throw { code: returned, status: statuses[returned] };
  return data;
}

export function jobErrorResponse(error: unknown): Response {
  if (typeof error === 'object' && error !== null && 'status' in error && 'code' in error) {
    const value = error as { status: number; code: string };
    return Response.json({ error: value.code }, { status: value.status });
  }
  return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
}

export async function requestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
