import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CertificateRegistry, type PfxInspector } from './registry';
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
});
