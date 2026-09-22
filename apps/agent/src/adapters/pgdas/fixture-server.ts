import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const fixturePages = [
  'certificate-accepted', 'representative-selection', 'competence-selection',
  'existing-declaration', 'revenue-entry', 'calculation', 'confirmation',
  'receipt', 'das', 'captcha', 'missing-authorization', 'maintenance',
] as const;
export type FixturePage = (typeof fixturePages)[number];

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Deterministic, local-only portal used by adapter tests. It never accepts POSTs. */
export class FixturePortalServer {
  private server: Server | undefined;
  private port = 0;

  async start(): Promise<string> {
    if (this.server) return this.url;
    this.server = createServer(async (request, response) => {
      if (request.method !== 'GET') {
        response.writeHead(405, { 'content-type': 'text/plain' });
        response.end('fixture portal is read-only');
        return;
      }
      const name = request.url?.replace(/^\//, '').replace(/\.html$/, '') as FixturePage | undefined;
      if (!name || !fixturePages.includes(name)) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        response.end('fixture not found');
        return;
      }
      const html = await readFile(join(fixtureRoot, `${name}.html`), 'utf8');
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.port = (this.server.address() as { port: number }).port;
    return this.url;
  }

  get url(): string { return `http://127.0.0.1:${this.port}`; }

  async close(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => this.server!.close((error) => error ? reject(error) : resolve()));
    this.server = undefined;
    this.port = 0;
  }
}
