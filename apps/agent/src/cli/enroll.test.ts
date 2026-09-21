import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInMemorySecretProvider } from '../secrets/provider';
import { DEVICE_TOKEN_SECRET_KEY, enroll, loadAgentSettings, readDeviceToken } from './enroll';
import { runAgent } from './run';

describe('enrollment and run boundaries', () => {
  it('exchanges a one-time token once and stores only the returned token in the secret provider', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'lazybot-enroll-'));
    const secrets = createInMemorySecretProvider(); const transport = vi.fn().mockResolvedValue({ deviceId: 'd-1', deviceToken: 'device-secret' });
    const result = await enroll({ dataDir, secrets, transport, input: { url: 'https://example.test', deviceName: 'Notebook', os: 'windows', agentVersion: '0.1.0', enrollmentToken: 'enrollment-token-with-enough-entropy-1234567890' } });
    expect(transport).toHaveBeenCalledOnce(); expect(transport.mock.calls[0][1]).toMatchObject({ enrollmentToken: expect.any(String) });
    expect(await readDeviceToken(secrets)).toBe('device-secret'); expect(result.settings.url).toBe('https://example.test');
    const settings = await readFile(join(dataDir, 'agent.json'), 'utf8');
    expect(settings).not.toContain('enrollment-token'); expect(settings).not.toContain('device-secret');
    expect(JSON.stringify(await loadAgentSettings(dataDir))).not.toContain('enrollment-token');
  });

  it('runs from stored configuration without asking for enrollment again and aborts on signal', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'lazybot-run-')); const secrets = createInMemorySecretProvider();
    await enroll({ dataDir, secrets, transport: async () => ({ deviceId: 'd-1', deviceToken: 'device-secret' }), input: { url: 'https://example.test', deviceName: 'Notebook', os: 'linux', agentVersion: '0.1.0', enrollmentToken: 'enrollment-token-with-enough-entropy-1234567890' } });
    let signalHandler!: () => void; let resolveRuntime!: () => void;
    const runtime = vi.fn((_config, _signal: AbortSignal) => new Promise<void>((resolve) => { resolveRuntime = resolve; }));
    const running = runAgent({ dataDir, secrets, runtime, onSignal: (handler) => { signalHandler = handler; return () => undefined; } });
    await vi.waitFor(() => expect(runtime).toHaveBeenCalledOnce()); signalHandler(); resolveRuntime(); await running;
    expect(runtime.mock.calls[0][0].deviceToken).toBe('device-secret');
  });
});
