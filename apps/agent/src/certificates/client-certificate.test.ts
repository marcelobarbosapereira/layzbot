import { describe, expect, it } from 'vitest';
import { createClientCertificateContext, createClientCertificateOptions } from './client-certificate.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateFixtures, GENERATED_FIXTURE_DIR, FIXTURE_PASSPHRASE } from '../../test/mtls/generate-fixtures.js';
import { startMtlsServer } from '../../test/mtls/server.js';

describe('client certificate options', () => {
  it('rejects non-HTTPS and non-allowlisted origins before resolving secrets', async () => {
    let resolutions = 0;
    const registry = { resolve: async () => { resolutions += 1; return null; } };

    await expect(createClientCertificateOptions(registry, 'responsible-1', ['http://localhost:8443']))
      .rejects.toThrow('CERTIFICATE_ORIGIN_NOT_ALLOWED');
    expect(resolutions).toBe(0);
  });

  it('resolves one certificate and returns origin-specific Playwright options', async () => {
    const pfx = new Uint8Array([1, 2, 3]);
    const registry = { resolve: async (responsibleId: string) => ({
      id: 'cert-1', responsibleId, subject: 'CN=Fictitious', fingerprint: 'f'.repeat(64),
      expiresAt: '2099-01-01T00:00:00.000Z', pfxFile: 'cert.pfx', pfx, passphrase: 'fabricated-passphrase',
    }) };

    const result = await createClientCertificateOptions(registry, 'responsible-1', ['https://localhost:8443']);
    expect(result).toEqual({
      clientCertificates: [{ origin: 'https://localhost:8443', pfx: Buffer.from(pfx), passphrase: 'fabricated-passphrase' }],
    });
  });

  it('rejects a missing or expired registry certificate', async () => {
    const registry = { resolve: async () => null };
    await expect(createClientCertificateOptions(registry, 'missing', ['https://localhost:8443']))
      .rejects.toThrow('CERTIFICATE_NOT_FOUND');
  });

  it('zeroizes copied PFX bytes when context creation fails', async () => {
    const pfx = new Uint8Array([9, 8, 7]);
    const registry = { resolve: async () => ({ id: 'c', responsibleId: 'r', subject: 'x', fingerprint: 'f', expiresAt: '2099-01-01T00:00:00.000Z', pfxFile: 'c.pfx', pfx, passphrase: 'p' }) };
    let copied: Uint8Array | undefined;
    const browser = { newContext: async (options: { clientCertificates: { pfx: Uint8Array }[] }) => {
      copied = options.clientCertificates[0].pfx;
      expect(Buffer.from(copied ?? [])).toEqual(Buffer.from(pfx));
      throw new Error('BROWSER_FAILED');
    } };
    await expect(createClientCertificateContext(browser, registry, 'r', ['https://localhost:8443'])).rejects.toThrow('BROWSER_FAILED');
    expect(Buffer.from(copied ?? [])).toEqual(Buffer.from([0, 0, 0]));
  });

  it('authenticates to a disposable local mTLS server only with the configured PFX', async ({ skip }) => {
    try { await generateFixtures(); } catch (error) {
      if (error instanceof Error && (error.message === 'OPENSSL_UNAVAILABLE' || error.message.startsWith('OPENSSL_FAILED:'))) skip();
      throw error;
    }
    const server = await startMtlsServer({
      key: join(GENERATED_FIXTURE_DIR, 'server.key'),
      certificate: join(GENERATED_FIXTURE_DIR, 'server.crt'),
      ca: join(GENERATED_FIXTURE_DIR, 'ca.crt'),
    });
    const pfx = new Uint8Array(await readFile(join(GENERATED_FIXTURE_DIR, 'client.pfx')));
    const registry = { resolve: async () => ({ id: 'fixture', responsibleId: 'responsible-1', subject: 'LazyBot Fictitious Client', fingerprint: 'f'.repeat(64), expiresAt: '2099-01-01T00:00:00.000Z', pfxFile: 'client.pfx', pfx, passphrase: FIXTURE_PASSPHRASE }) };
    try {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      try {
        const options = await createClientCertificateOptions(registry, 'responsible-1', [server.origin]);
        const context = await browser.newContext({ ...options, ignoreHTTPSErrors: true });
        try {
          const page = await context.newPage();
          await expect(page.goto(`${server.origin}/protected`)).resolves.toBeTruthy();
          expect(await page.locator('body').textContent()).toContain('LazyBot Fictitious Client');
        } finally { await context.close(); }

        const unauthenticated = await browser.newContext({ ignoreHTTPSErrors: true });
        try { await expect(unauthenticated.newPage().then((page: import('playwright').Page) => page.goto(`${server.origin}/protected`))).rejects.toBeTruthy(); }
        finally { await unauthenticated.close(); }
      } finally { await browser.close(); }
    } catch (error) {
      if (error instanceof Error && (error.message.includes('Cannot find package') || error.message.includes('Executable doesn’t exist') || error.message.includes('Executable doesn\'t exist'))) skip();
      throw error;
    } finally { await server.close(); }
  }, 30_000);
});
