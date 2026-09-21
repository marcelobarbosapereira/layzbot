import { describe, expect, it, vi } from 'vitest';
import { HttpAgentApi } from './client';

describe('HttpAgentApi', () => {
  const config = {
    url: 'https://example.invalid', deviceToken: 'fabricated-secret',
    deviceName: 'test-device', os: 'linux', agentVersion: '0.1.0',
  };

  it('sends the versioned heartbeat with bearer auth and parses its response', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.invalid/api/agent/v1/heartbeat');
      expect(init?.headers).toMatchObject({ authorization: 'Bearer fabricated-secret' });
      expect(JSON.parse(String(init?.body))).toMatchObject({ os: 'linux', agentVersion: '0.1.0' });
      return Response.json({ device: {
        id: '10000000-0000-4000-8000-000000000001', online: true,
        certificateCount: 0, lastSeenAt: '2026-09-21T12:00:00Z',
      } });
    });
    const api = new HttpAgentApi(config, fetcher);
    await expect(api.heartbeat()).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('does not include an authorization header or response body in errors', async () => {
    const api = new HttpAgentApi(config, async () => new Response('Authorization: Bearer fabricated-secret', { status: 401 }));
    await expect(api.claim()).rejects.toThrow('DEVICE_UNAUTHORIZED');
    await expect(api.claim()).rejects.not.toThrow('fabricated-secret');
  });

  it('rejects malformed successful responses with a fixed message', async () => {
    const api = new HttpAgentApi(config, async () => Response.json({ unexpected: 'Bearer fabricated-secret' }));
    await expect(api.heartbeat()).rejects.toThrow('AGENT_INVALID_RESPONSE');
    await expect(api.event('10000000-0000-4000-8000-000000000001', {
      expectedState: 'authenticating', nextState: 'transmitting', message: 'Simulated', sequence: 1,
    })).rejects.toThrow('AGENT_INVALID_RESPONSE');
  });
});
