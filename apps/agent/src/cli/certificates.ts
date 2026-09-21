import { createLinuxSecretServiceProvider } from '../secrets/linux-secret-service';
import { createWindowsDpapiProvider } from '../secrets/windows-dpapi';
import { CertificateRegistry } from '../certificates/registry';

export function createCertificateCli(registry: CertificateRegistry) {
  return {
    async add(responsibleId: string, pfxPath: string, passphrase: string) { return registry.add({ responsibleId, pfxPath, passphrase }); },
    async list() { return registry.list(); },
    async remove(id: string) { return registry.remove(id); },
  };
}

export function createDefaultCertificateCli(dataDir = process.env.LAZYBOT_DATA_DIR ?? `${process.env.LOCALAPPDATA ?? process.env.XDG_DATA_HOME ?? '.'}/LazyBot`) {
  const provider = process.platform === 'win32' ? createWindowsDpapiProvider() : createLinuxSecretServiceProvider();
  return createCertificateCli(new CertificateRegistry(dataDir, provider));
}
