import { describe, expect, it, vi } from 'vitest';
import { runCertificateCli } from './certificates.js';

describe('certificate CLI', () => {
  it('reads add passphrase through the prompt and never accepts it from argv', async () => {
    const registry = { add: vi.fn().mockResolvedValue({ id: 'abc' }), list: vi.fn(), remove: vi.fn() };
    const result = await runCertificateCli(['cert', 'add', '--responsible', 'r1', '--pfx', 'fixture.pfx'], { registry, readPassphrase: async () => 'fabricated-passphrase', write: vi.fn() });
    expect(result).toEqual({ id: 'abc' });
    expect(registry.add).toHaveBeenCalledWith({ responsibleId: 'r1', pfxPath: 'fixture.pfx', passphrase: 'fabricated-passphrase' });
    await expect(runCertificateCli(['cert', 'add', '--responsible', 'r1', '--pfx', 'fixture.pfx', '--passphrase', 'leak'], { registry, readPassphrase: async () => 'x', write: vi.fn() })).rejects.toThrow('INVALID_ARGUMENTS');
  });
});
