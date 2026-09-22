import { describe, expect, it, vi } from 'vitest';
import { createInMemorySecretProvider } from '../secrets/provider.js';
import { runCli, type CliDependencies } from './main.js';

describe('CLI dispatcher', () => {
  it('routes probe to the real origin-probe command', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const certificate = { id: 'c', responsibleId: 'r', subject: 'CN=Fictitious', fingerprint: 'f'.repeat(64), expiresAt: '2099-01-01T00:00:00.000Z', pfxFile: 'c.pfx', pfx: new Uint8Array([1]), passphrase: 'fabricated' };
    const dependencies = { dataDir: '.', secrets: createInMemorySecretProvider(), certificateCli: { add: vi.fn(), list: vi.fn(), remove: vi.fn() }, certificateRegistry: { resolve: vi.fn(async () => certificate) }, probeLaunch: async () => ({ newContext: async () => ({ newPage: async () => ({ goto: async () => { throw new Error('TLS_FAILED'); } }), close: async () => undefined }), close: async () => undefined }), enrollPrompt: vi.fn() } as unknown as CliDependencies;
    await runCli(['probe', '--responsible', 'r', '--origin', 'https://portal.example.test', '--allow-origin', 'https://portal.example.test'], dependencies);
    expect(write).toHaveBeenCalledWith(JSON.stringify({ origin: 'https://portal.example.test', tlsAccepted: false }) + '\n');
    write.mockRestore();
  });
});
