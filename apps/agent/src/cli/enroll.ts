import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { agentEnrollment } from '@lazybot/contracts';
import type { SecretProvider } from '../secrets/provider';

export type EnrollmentResponse = { deviceId: string; deviceToken: string };
export type EnrollmentTransport = (url: string, input: unknown) => Promise<EnrollmentResponse>;
export type EnrollmentPrompts = {
  ask(question: string): Promise<string>;
  askSecret(question: string): Promise<string>;
};
export type StoredAgentSettings = {
  url: string;
  deviceName: string;
  os: string;
  agentVersion: string;
};

const SETTINGS_FILE = 'agent.json';
const TOKEN_KEY = 'agent/device-token';

function validateUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('INVALID_CONFIGURATION');
  }
  return parsed.href.replace(/\/$/, '');
}

export function createEnrollmentTransport(fetcher: typeof fetch = fetch): EnrollmentTransport {
  return async (url, input) => {
    let response: Response;
    try {
      response = await fetcher(`${url}/api/agent/v1/enroll`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
      });
    } catch { throw new Error('ENROLLMENT_NETWORK_ERROR'); }
    if (!response.ok) throw new Error(response.status === 401 ? 'ENROLLMENT_INVALID' : 'ENROLLMENT_FAILED');
    let body: unknown;
    try { body = await response.json(); } catch { throw new Error('ENROLLMENT_INVALID_RESPONSE'); }
    if (!body || typeof body !== 'object' || typeof (body as { deviceId?: unknown }).deviceId !== 'string' || typeof (body as { deviceToken?: unknown }).deviceToken !== 'string') {
      throw new Error('ENROLLMENT_INVALID_RESPONSE');
    }
    return body as EnrollmentResponse;
  };
}

export async function saveAgentSettings(dataDir: string, settings: StoredAgentSettings): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, SETTINGS_FILE), JSON.stringify(settings, null, 2), { mode: 0o600 });
  await chmod(join(dataDir, SETTINGS_FILE), 0o600);
}

export async function loadAgentSettings(dataDir: string): Promise<StoredAgentSettings> {
  try {
    const parsed = JSON.parse(await readFile(join(dataDir, SETTINGS_FILE), 'utf8')) as StoredAgentSettings;
    if (!parsed.url || !parsed.deviceName || !parsed.os || !parsed.agentVersion) throw new Error('INVALID_CONFIGURATION');
    return { ...parsed, url: validateUrl(parsed.url) };
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_CONFIGURATION') throw error;
    throw new Error('INVALID_CONFIGURATION');
  }
}

export type EnrollOptions = {
  dataDir: string;
  secrets: SecretProvider;
  input?: StoredAgentSettings & { enrollmentToken: string };
  prompts?: EnrollmentPrompts;
  transport?: EnrollmentTransport;
};

/** Exchanges the enrollment token exactly once. The token is never written or returned. */
export async function enroll(options: EnrollOptions): Promise<{ deviceId: string; settings: StoredAgentSettings }> {
  const prompts = options.prompts;
  const input = options.input ?? (prompts ? {
    url: await prompts.ask('LazyBot URL: '), deviceName: await prompts.ask('Device name: '),
    os: await prompts.ask('Operating system: '), agentVersion: await prompts.ask('Agent version: '),
    enrollmentToken: await prompts.askSecret('One-time enrollment token: '),
  } : undefined);
  if (!input) throw new Error('INVALID_ARGUMENTS');
  const settings = { url: validateUrl(input.url), deviceName: input.deviceName.trim(), os: input.os.trim(), agentVersion: input.agentVersion.trim() };
  const parsed = agentEnrollment.parse({ enrollmentToken: input.enrollmentToken, agentVersion: settings.agentVersion, os: settings.os });
  const result = await (options.transport ?? createEnrollmentTransport())(settings.url, parsed);
  await options.secrets.store(TOKEN_KEY, new TextEncoder().encode(result.deviceToken));
  await saveAgentSettings(options.dataDir, settings);
  return { deviceId: result.deviceId, settings };
}

export async function readDeviceToken(secrets: SecretProvider): Promise<string> {
  const value = await secrets.read(TOKEN_KEY);
  if (!value?.length) throw new Error('DEVICE_NOT_ENROLLED');
  return new TextDecoder().decode(value);
}

export const DEVICE_TOKEN_SECRET_KEY = TOKEN_KEY;
