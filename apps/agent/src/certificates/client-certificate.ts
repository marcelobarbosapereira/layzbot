import type { CertificateRegistry, ResolvedCertificate } from './registry';

export type ClientCertificateOption = {
  origin: string;
  pfx: Buffer;
  passphrase: string;
};

export type ClientCertificateOptions = {
  clientCertificates: ClientCertificateOption[];
};

type RegistryResolver = Pick<CertificateRegistry, 'resolve'>;

function normalizeOrigins(origins: string[]): string[] {
  if (origins.length === 0) throw new Error('CERTIFICATE_ORIGIN_NOT_ALLOWED');
  const normalized = origins.map((value) => {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error('CERTIFICATE_ORIGIN_NOT_ALLOWED'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('CERTIFICATE_ORIGIN_NOT_ALLOWED');
    }
    return url.origin;
  });
  return [...new Set(normalized)];
}

export async function createClientCertificateOptions(
  registry: RegistryResolver,
  responsibleId: string,
  origins: string[],
): Promise<ClientCertificateOptions> {
  const normalizedOrigins = normalizeOrigins(origins);
  const certificate = await registry.resolve(responsibleId);
  if (!certificate) throw new Error('CERTIFICATE_NOT_FOUND');
  return {
    clientCertificates: normalizedOrigins.map((origin) => ({
      origin,
      pfx: Buffer.from(certificate.pfx),
      passphrase: certificate.passphrase,
    })),
  };
}

type BrowserLike = { newContext(options: ClientCertificateOptions): Promise<BrowserContextLike> };
export type BrowserContextLike = { close(): Promise<void> };

/**
 * Creates a Playwright context and clears the copied PFX bytes in every path.
 * Playwright receives the passphrase as a string, so callers must avoid logging it;
 * the local reference is dropped in `finally` even though JavaScript strings are immutable.
 */
export async function createClientCertificateContext(
  browser: BrowserLike,
  registry: RegistryResolver,
  responsibleId: string,
  origins: string[],
): Promise<BrowserContextLike> {
  const options = await createClientCertificateOptions(registry, responsibleId, origins);
  try {
    return await browser.newContext(options);
  } finally {
    for (const certificate of options.clientCertificates) certificate.pfx.fill(0);
    options.clientCertificates.length = 0;
  }
}

export function clearClientCertificateOptions(options: ClientCertificateOptions): void {
  for (const certificate of options.clientCertificates) certificate.pfx.fill(0);
  options.clientCertificates.length = 0;
}

export type { ResolvedCertificate };
