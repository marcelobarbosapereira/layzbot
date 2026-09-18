'use server';

import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { hashDeviceToken } from '../../lib/device-auth';
import { createClient } from '../../lib/supabase/server';

const enrollmentInput = z.object({ name: z.string().trim().min(1).max(200) });
const deviceId = z.string().uuid();
function onlineThresholdMs(): number {
  const seconds = Number(process.env.DEVICE_HEARTBEAT_THRESHOLD_SECONDS ?? '90');
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 90_000;
}

export type DeviceListItem = { id: string; name: string; os: string | null; agentVersion: string | null; lastSeenAt: string | null; revokedAt: string | null; online: boolean; certificateCount: number };

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return supabase;
}

export async function createDeviceEnrollment(input: unknown): Promise<{ status: 'success'; enrollmentToken: string; expiresAt: string } | { status: 'error'; message: string }> {
  const parsed = enrollmentInput.safeParse(input);
  if (!parsed.success) return { status: 'error', message: 'Informe um nome para o dispositivo.' };
  const supabase = await authenticatedClient();
  if (!supabase) return { status: 'error', message: 'Sessão inválida. Entre novamente.' };
  const id = randomUUID();
  const enrollmentToken = `${id}.${randomBytes(32).toString('base64url')}`;
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const { data, error } = await supabase.rpc('create_device_enrollment', {
    p_enrollment_id: id,
    p_name: parsed.data.name,
    p_token_hash: await hashDeviceToken(enrollmentToken),
    p_expires_at: expiresAt,
  });
  if (error || data !== id) return { status: 'error', message: 'Não foi possível criar o código de inscrição.' };
  return { status: 'success', enrollmentToken, expiresAt };
}

export async function revokeDevice(input: unknown): Promise<{ status: 'success' } | { status: 'error'; message: string }> {
  const parsed = deviceId.safeParse(input);
  if (!parsed.success) return { status: 'error', message: 'Dispositivo inválido.' };
  const supabase = await authenticatedClient();
  if (!supabase) return { status: 'error', message: 'Sessão inválida. Entre novamente.' };
  const { error } = await supabase.rpc('revoke_device', { p_device_id: parsed.data });
  return error ? { status: 'error', message: 'Não foi possível revogar o dispositivo.' } : { status: 'success' };
}

export async function listDevices(now = new Date()): Promise<DeviceListItem[]> {
  const supabase = await authenticatedClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('devices').select('id,name,os,agent_version,last_seen_at,revoked_at,device_certificates(count)');
  if (error || !data) return [];
  return data.map((row: Record<string, unknown>) => {
    const lastSeenAt = typeof row.last_seen_at === 'string' ? row.last_seen_at : null;
    const revokedAt = typeof row.revoked_at === 'string' ? row.revoked_at : null;
    const counts = Array.isArray(row.device_certificates) ? row.device_certificates[0] as { count?: number } | undefined : undefined;
    return {
      id: String(row.id), name: String(row.name), os: typeof row.os === 'string' ? row.os : null,
      agentVersion: typeof row.agent_version === 'string' ? row.agent_version : null, lastSeenAt, revokedAt,
      online: revokedAt === null && lastSeenAt !== null && now.getTime() - new Date(lastSeenAt).getTime() <= onlineThresholdMs(),
      certificateCount: counts?.count ?? 0,
    };
  });
}
