import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ArtifactKind } from './naming.js';
import { sha256 } from './naming.js';

export type SignedUpload = { uploadUrl: string; objectPath: string; token: string };
export type ArtifactUploadClient = { requestUpload(input: { batchItemId: string; kind: ArtifactKind; name: string; sha256: string; byteSize: number }): Promise<SignedUpload>; upload(uploadUrl: string, bytes: Uint8Array): Promise<void>; complete(input: { token: string; objectPath: string; sha256: string; byteSize: number; originalName: string }): Promise<unknown> };

export async function uploadArtifact(client: ArtifactUploadClient, input: { batchItemId: string; kind: ArtifactKind; name: string; bytes: Uint8Array }): Promise<unknown> {
  const digest = sha256(input.bytes);
  const signed = await client.requestUpload({ batchItemId: input.batchItemId, kind: input.kind, name: input.name, sha256: digest, byteSize: input.bytes.byteLength });
  await client.upload(signed.uploadUrl, input.bytes);
  return client.complete({ token: signed.token, objectPath: signed.objectPath, sha256: digest, byteSize: input.bytes.byteLength, originalName: input.name });
}

export async function mirrorArtifact(root: string, objectPath: string, bytes: Uint8Array): Promise<string> {
  const destination = join(root, objectPath.replaceAll('/', '\\'));
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(temporary, bytes, { flag: 'wx' });
  await rename(temporary, destination);
  return destination;
}
