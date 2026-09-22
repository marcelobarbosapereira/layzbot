import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mirrorArtifact, uploadArtifact } from './upload.js';

describe('artifact upload boundary', () => {
  it('passes the signed upload token to completion without exposing document contents', async () => {
    const calls: string[] = [];
    const result = await uploadArtifact({
      async requestUpload() { return { uploadUrl: 'https://fixture/upload', objectPath: 'owner/das.pdf', uploadToken: 'signed-token' }; },
      async upload(url, bytes) { calls.push(`${url}:${bytes.byteLength}`); },
      async complete(input) { calls.push(input.token); return { id: 'artifact' }; },
    }, { batchItemId: 'item', kind: 'das', name: 'das.pdf', bytes: new TextEncoder().encode('fixture') });
    expect(result).toEqual({ id: 'artifact' });
    expect(calls).toEqual(['https://fixture/upload:7', 'signed-token']);
  });

  it('rejects traversal and removes temporary files after a failed atomic move', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lazybot-mirror-'));
    await expect(mirrorArtifact(root, '../outside.pdf', new Uint8Array([1]))).rejects.toThrow('MIRROR_PATH_TRAVERSAL');
    const destination = await mirrorArtifact(root, 'owner/das.pdf', new Uint8Array([1, 2]));
    expect(await readFile(destination)).toEqual(Buffer.from([1, 2]));
    await rm(root, { recursive: true, force: true });
  });
});
