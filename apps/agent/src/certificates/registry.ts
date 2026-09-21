import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { SecretProvider } from '../secrets/provider';

export type PfxInspection = { subject: string; expiresAt: string };
export type PfxInspector = (path: string, passphrase: string) => Promise<PfxInspection>;
export type CertificateMetadata = { id: string; responsibleId: string; subject: string; fingerprint: string; expiresAt: string; pfxFile: string };
export type ResolvedCertificate = CertificateMetadata & { pfx: Uint8Array; passphrase: string };
type AddInput = { responsibleId: string; pfxPath: string; passphrase: string };

const REGISTRY = 'certificates.json';
const defaultInspector: PfxInspector = async () => { throw new Error('PFX_INSPECTION_UNAVAILABLE'); };

export class CertificateRegistry {
  private readonly file: string;
  constructor(private readonly dataDir: string, private readonly secrets: SecretProvider, private readonly inspect: PfxInspector = defaultInspector) { this.file = join(dataDir, REGISTRY); }
  private async listRaw(): Promise<CertificateMetadata[]> { try { return JSON.parse(await readFile(this.file, 'utf8')) as CertificateMetadata[]; } catch { return []; } }
  private async save(items: CertificateMetadata[]) { await mkdir(this.dataDir, { recursive: true }); await writeFile(this.file, JSON.stringify(items, null, 2), { mode: 0o600 }); await chmod(this.file, 0o600); }
  async list(): Promise<CertificateMetadata[]> { return this.listRaw(); }
  async add(input: AddInput): Promise<CertificateMetadata> {
    if (!input.responsibleId.trim() || !input.passphrase) throw new Error('INVALID_CERTIFICATE_INPUT');
    const bytes = await readFile(input.pfxPath);
    const fingerprint = createHash('sha256').update(bytes).digest('hex');
    const items = await this.listRaw();
    if (items.some((item) => item.fingerprint === fingerprint)) throw new Error('CERTIFICATE_DUPLICATE');
    const inspected = await this.inspect(input.pfxPath, input.passphrase);
    if (new Date(inspected.expiresAt).getTime() <= Date.now()) throw new Error('CERTIFICATE_EXPIRED');
    const id = fingerprint.slice(0, 16);
    const pfxFile = `${id}-${basename(input.pfxPath).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await mkdir(this.dataDir, { recursive: true });
    await copyFile(input.pfxPath, join(this.dataDir, pfxFile));
    await chmod(join(this.dataDir, pfxFile), 0o600);
    await this.secrets.store(`certificate/${id}`, new TextEncoder().encode(input.passphrase));
    const metadata = { id, responsibleId: input.responsibleId, subject: inspected.subject, fingerprint, expiresAt: inspected.expiresAt, pfxFile };
    await this.save([...items, metadata]);
    return metadata;
  }
  async remove(idOrResponsibleId: string): Promise<void> {
    const items = await this.listRaw(); const item = items.find((candidate) => candidate.id === idOrResponsibleId || candidate.responsibleId === idOrResponsibleId);
    if (!item) return;
    await this.secrets.delete(`certificate/${item.id}`);
    const { unlink } = await import('node:fs/promises');
    await unlink(join(this.dataDir, item.pfxFile)).catch(() => undefined);
    await this.save(items.filter((candidate) => candidate.id !== item.id));
  }
  async resolve(responsibleId: string): Promise<ResolvedCertificate | null> {
    const item = (await this.listRaw()).find((candidate) => candidate.responsibleId === responsibleId);
    if (!item || new Date(item.expiresAt).getTime() <= Date.now()) return null;
    const passphrase = new TextDecoder().decode((await this.secrets.read(`certificate/${item.id}`)) ?? new Uint8Array());
    if (!passphrase) return null;
    return { ...item, pfx: new Uint8Array(await readFile(join(this.dataDir, item.pfxFile))), passphrase };
  }
}
