import { createServer, type Server } from 'node:https';
import type { TLSSocket } from 'node:tls';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export type MtlsServer = { server: Server; origin: string; close(): Promise<void> };
export type MtlsServerFiles = { key: string; certificate: string; ca: string };

export async function startMtlsServer(files: MtlsServerFiles): Promise<MtlsServer> {
  const [key, cert, ca] = await Promise.all([readFile(files.key), readFile(files.certificate), readFile(files.ca)]);
  const server = createServer({ key, cert, ca, requestCert: true, rejectUnauthorized: true }, (request, response) => {
    const peer = (request.socket as TLSSocket).getPeerCertificate();
    const subject = peer.subject?.CN ?? 'unknown';
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`test certificate subject: ${subject}`);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('MTLS_SERVER_ADDRESS_UNAVAILABLE');
  const origin = `https://localhost:${address.port}`;
  return {
    server,
    origin,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

export function certificateSubjectDigest(subject: string): string {
  return createHash('sha256').update(subject).digest('hex');
}
