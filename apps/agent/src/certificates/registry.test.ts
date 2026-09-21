import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CertificateRegistry, createOpenSslPfxInspector, type PfxInspector } from './registry';
import { createInMemorySecretProvider } from '../secrets/provider';

const pfx = new Uint8Array([1, 2, 3, 4]);

describe('CertificateRegistry', () => {
  async function setup() {
    const root = await mkdtemp(join(tmpdir(), 'lazybot-cert-'));
    const inspector: PfxInspector = async () => ({ subject: 'Responsável fictício', expiresAt: '2099-01-01T00:00:00.000Z' });
    return { root, registry: new CertificateRegistry(root, createInMemorySecretProvider(), inspector) };
  }

  it('copies PFX, stores passphrase outside registry JSON, and resolves it only on demand', async () => {
    const { root, registry } = await setup();
    const source = join(root, 'fixture.pfx');
    await writeFile(source, pfx);
    const added = await registry.add({ responsibleId: 'responsible-1', pfxPath: source, passphrase: 'fabricated-passphrase' });
    expect(added.fingerprint).toHaveLength(64);
    expect(JSON.parse(await readFile(join(root, 'certificates.json'), 'utf8'))[0]).not.toHaveProperty('passphrase');
    const resolved = await registry.resolve('responsible-1');
    expect(resolved?.passphrase).toBe('fabricated-passphrase');
    expect(resolved?.pfx).toEqual(pfx);
  });

  it('rejects duplicate fingerprints and expired certificates', async () => {
    const { root, registry } = await setup();
    const source = join(root, 'fixture.pfx');
    await writeFile(source, pfx);
    await registry.add({ responsibleId: 'responsible-1', pfxPath: source, passphrase: 'one' });
    await expect(registry.add({ responsibleId: 'responsible-2', pfxPath: source, passphrase: 'two' })).rejects.toThrow('CERTIFICATE_DUPLICATE');
    const expiredRoot = await mkdtemp(join(tmpdir(), 'lazybot-expired-'));
    const expired = new CertificateRegistry(expiredRoot, createInMemorySecretProvider(), async () => ({ subject: 'x', expiresAt: '2000-01-01T00:00:00.000Z' }));
    await expect(expired.add({ responsibleId: 'r', pfxPath: source, passphrase: 'secret' })).rejects.toThrow('CERTIFICATE_EXPIRED');
  });

  it('removes staged PFX and secret when persistence fails', async () => {
    const { root } = await setup();
    const source = join(root, 'fixture.pfx'); await writeFile(source, pfx);
    const secrets = createInMemorySecretProvider();
    const registry = new CertificateRegistry(root, secrets, async () => ({ subject: 'x', expiresAt: '2099-01-01T00:00:00.000Z' }), { persist: async () => { throw new Error('PERSISTENCE_FAILED'); } });
    await expect(registry.add({ responsibleId: 'r', pfxPath: source, passphrase: 'secret' })).rejects.toThrow('PERSISTENCE_FAILED');
    expect(await secrets.read(expect.any(String))).toBeNull();
    await expect((await import('node:fs/promises')).readdir(root)).resolves.toEqual(['fixture.pfx']);
  });

  it('removes staged PFX when Windows ACL hardening fails', async () => {
    const { root } = await setup();
    const source = join(root, 'fixture.pfx'); await writeFile(source, pfx);
    const registry = new CertificateRegistry(root, createInMemorySecretProvider(), async () => ({ subject: 'x', expiresAt: '2099-01-01T00:00:00.000Z' }), { secureFile: async () => { throw new Error('ACL_FAILED'); } });
    await expect(registry.add({ responsibleId: 'r', pfxPath: source, passphrase: 'secret' })).rejects.toThrow('ACL_FAILED');
    await expect((await import('node:fs/promises')).readdir(root)).resolves.toEqual(['fixture.pfx']);
  });

  it('parses OpenSSL certificate metadata without putting the passphrase in arguments', async () => {
    const calls: { args: string[]; input?: Uint8Array }[] = [];
    const inspect = createOpenSslPfxInspector(async (args, input) => { calls.push({ args, input }); return 'subject=CN=Fictitious\nNot After : Jan  1 00:00:00 2099 GMT\n'; });
    await expect(inspect('fixture.pfx', 'fabricated-passphrase')).resolves.toEqual({ subject: 'CN=Fictitious', expiresAt: '2099-01-01T00:00:00.000Z' });
    expect(calls[0].args).not.toContain('fabricated-passphrase');
    expect(new TextDecoder().decode(calls[0].input)).toBe('fabricated-passphrase');
  });
});
