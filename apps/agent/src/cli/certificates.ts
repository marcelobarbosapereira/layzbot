import { createLinuxSecretServiceProvider } from '../secrets/linux-secret-service';
import { createWindowsDpapiProvider, secureWindowsFile } from '../secrets/windows-dpapi';
import { CertificateRegistry } from '../certificates/registry';

export function createCertificateCli(registry: CertificateRegistry) {
  return {
    async add(input: { responsibleId: string; pfxPath: string; passphrase: string }) { return registry.add(input); },
    async list() { return registry.list(); },
    async remove(id: string) { return registry.remove(id); },
  };
}

export function createDefaultCertificateCli(dataDir = process.env.LAZYBOT_DATA_DIR ?? `${process.env.LOCALAPPDATA ?? process.env.XDG_DATA_HOME ?? '.'}/LazyBot`) {
  const provider = process.platform === 'win32' ? createWindowsDpapiProvider() : createLinuxSecretServiceProvider();
  return createCertificateCli(new CertificateRegistry(dataDir, provider, undefined, { secureFile: process.platform === 'win32' ? secureWindowsFile : undefined }));
}

type CliRegistry = Pick<CertificateRegistry, 'add' | 'list' | 'remove'>;
export type CertificateCliIo = { registry: CliRegistry; readPassphrase: () => Promise<string>; write: (line: string) => void };

export async function runCertificateCli(argv: string[], io: CertificateCliIo): Promise<unknown> {
  if (argv[0] !== 'cert') throw new Error('INVALID_ARGUMENTS');
  const command = argv[1];
  if (command === 'list') { const items = await io.registry.list(); io.write(JSON.stringify(items)); return items; }
  if (command === 'remove' && argv.length === 3) { await io.registry.remove(argv[2]); return undefined; }
  if (command === 'add') {
    if (argv.includes('--passphrase')) throw new Error('INVALID_ARGUMENTS');
    const responsibleIndex = argv.indexOf('--responsible'); const pfxIndex = argv.indexOf('--pfx');
    if (responsibleIndex < 0 || pfxIndex < 0 || !argv[responsibleIndex + 1] || !argv[pfxIndex + 1] || argv.length !== 6) throw new Error('INVALID_ARGUMENTS');
    const result = await io.registry.add({ responsibleId: argv[responsibleIndex + 1], pfxPath: argv[pfxIndex + 1], passphrase: await io.readPassphrase() });
    io.write(JSON.stringify(result)); return result;
  }
  throw new Error('INVALID_ARGUMENTS');
}
