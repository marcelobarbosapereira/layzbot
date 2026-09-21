import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const GENERATED_FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/generated');
export const FIXTURE_PASSPHRASE = 'lazybot-disposable-fixture-passphrase';

type Command = { args: string[]; input?: string };
async function openssl(command: Command): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('openssl', command.args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', () => reject(new Error('OPENSSL_UNAVAILABLE')));
    child.once('close', (code) => code === 0 ? resolvePromise() : reject(new Error(`OPENSSL_FAILED:${stderr.trim()}`)));
    child.stdin.end(command.input ?? '');
  });
}

export async function generateFixtures(directory = GENERATED_FIXTURE_DIR): Promise<void> {
  await mkdir(directory, { recursive: true });
  const caKey = join(directory, 'ca.key');
  const caCert = join(directory, 'ca.crt');
  const serverKey = join(directory, 'server.key');
  const serverCsr = join(directory, 'server.csr');
  const serverCert = join(directory, 'server.crt');
  const clientKey = join(directory, 'client.key');
  const clientCsr = join(directory, 'client.csr');
  const clientCert = join(directory, 'client.crt');
  const clientPfx = join(directory, 'client.pfx');
  const serverExtensions = join(directory, 'server.ext');
  await writeFile(serverExtensions, 'subjectAltName=DNS:localhost\n');
  await openssl({ args: ['genrsa', '-out', caKey, '2048'] });
  await openssl({ args: ['req', '-x509', '-new', '-nodes', '-key', caKey, '-sha256', '-days', '1', '-out', caCert, '-subj', '/CN=LazyBot Disposable Test CA'] });
  await openssl({ args: ['genrsa', '-out', serverKey, '2048'] });
  await openssl({ args: ['req', '-new', '-key', serverKey, '-out', serverCsr, '-subj', '/CN=localhost'] });
  await openssl({ args: ['x509', '-req', '-in', serverCsr, '-CA', caCert, '-CAkey', caKey, '-CAcreateserial', '-out', serverCert, '-days', '1', '-sha256', '-extfile', serverExtensions] });
  await openssl({ args: ['genrsa', '-out', clientKey, '2048'] });
  await openssl({ args: ['req', '-new', '-key', clientKey, '-out', clientCsr, '-subj', '/CN=LazyBot Fictitious Client'] });
  await openssl({ args: ['x509', '-req', '-in', clientCsr, '-CA', caCert, '-CAkey', caKey, '-CAcreateserial', '-out', clientCert, '-days', '1', '-sha256'] });
  await openssl({ args: ['pkcs12', '-export', '-out', clientPfx, '-inkey', clientKey, '-in', clientCert, '-passout', 'stdin', '-name', 'LazyBot Fictitious Client'], input: `${FIXTURE_PASSPHRASE}\n` });
  await unlink(serverExtensions).catch(() => undefined);
}
