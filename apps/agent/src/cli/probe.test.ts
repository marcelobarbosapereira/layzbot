import { describe, expect, it, vi } from 'vitest';
import { runPortalOriginProbe, runProbeCli } from './probe';

const certificate = { id: 'c', responsibleId: 'r', subject: 'CN=Fictitious', fingerprint: 'f'.repeat(64), expiresAt: '2099-01-01T00:00:00.000Z', pfxFile: 'c.pfx', pfx: new Uint8Array([1, 2]), passphrase: 'fabricated-passphrase' };

function fakeBrowser(pageGoto: () => Promise<unknown>) {
  const closeContext = vi.fn(async () => undefined);
  const closeBrowser = vi.fn(async () => undefined);
  return {
    closeContext, closeBrowser,
    browser: { newContext: async () => ({ newPage: async () => ({ goto: pageGoto }), close: closeContext }), close: closeBrowser },
  };
}

describe('portal origin probe', () => {
  it('opens a visible context and records only TLS acceptance', async () => {
    const fake = fakeBrowser(async () => undefined);
    const result = await runPortalOriginProbe({
      registry: { resolve: async () => certificate }, responsibleId: 'r', origin: 'https://portal.example.test',
      allowlistedOrigins: ['https://portal.example.test'], headless: false,
      launch: async (options) => { expect(options.headless).toBe(false); return fake.browser; },
    });
    expect(result).toEqual({ origin: 'https://portal.example.test', tlsAccepted: true });
    expect(fake.closeContext).toHaveBeenCalledOnce();
    expect(fake.closeBrowser).toHaveBeenCalledOnce();
  });

  it('reports TLS rejection without exposing page content', async () => {
    const fake = fakeBrowser(async () => { throw new Error('TLS_FAILED'); });
    const result = await runPortalOriginProbe({
      registry: { resolve: async () => certificate }, responsibleId: 'r', origin: 'https://portal.example.test',
      allowlistedOrigins: ['https://portal.example.test'], launch: async () => fake.browser,
    });
    expect(result).toEqual({ origin: 'https://portal.example.test', tlsAccepted: false });
  });

  it('rejects origins absent from the explicit HTTPS allowlist before launching', async () => {
    const launch = vi.fn();
    await expect(runPortalOriginProbe({
      registry: { resolve: async () => certificate }, responsibleId: 'r', origin: 'https://other.example.test',
      allowlistedOrigins: ['https://portal.example.test'], launch,
    })).rejects.toThrow('CERTIFICATE_ORIGIN_NOT_ALLOWED');
    expect(launch).not.toHaveBeenCalled();
  });

  it('exposes the probe through a strict CLI facade and emits only the result', async () => {
    const fake = fakeBrowser(async () => undefined);
    const write = vi.fn();
    await runProbeCli(['probe', '--responsible', 'r', '--origin', 'https://portal.example.test', '--allow-origin', 'https://portal.example.test'], {
      registry: { resolve: async () => certificate }, launch: async () => fake.browser, write,
    });
    expect(write).toHaveBeenCalledWith(JSON.stringify({ origin: 'https://portal.example.test', tlsAccepted: true }));
  });
});
