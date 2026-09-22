import { createHash } from 'node:crypto';
import { z } from 'zod';
import { authenticateDevice } from '../../../../../../lib/device-auth';
import { createServiceClient } from '../../../../../../lib/supabase/service';

const requestSchema = z.object({ batchItemId: z.string().uuid(), kind: z.enum(['das', 'receipt']), objectPath: z.string().min(1), token: z.string().min(1), originalName: z.string().min(1).max(255), sha256: z.string().regex(/^[a-f0-9]{64}$/), byteSize: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) });
export async function POST(request: Request): Promise<Response> {
  try {
    const principal = await authenticateDevice(request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success || !parsed.data.objectPath.startsWith(`${principal.ownerId}/`) || parsed.data.objectPath.includes('..')) return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    const supabase = createServiceClient();
    const downloaded = await supabase.storage.from('fiscal-documents').download(parsed.data.objectPath);
    if (downloaded.error || !downloaded.data) return Response.json({ error: 'UPLOAD_NOT_FOUND' }, { status: 400 });
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (bytes.byteLength !== parsed.data.byteSize || digest !== parsed.data.sha256) return Response.json({ error: 'ARTIFACT_HASH_MISMATCH' }, { status: 409 });
    const { data, error } = await supabase.rpc('complete_artifact_upload', {
      p_device_id: principal.id,
      p_upload_token_hash: createHash('sha256').update(parsed.data.token).digest('hex'),
      p_object_path: parsed.data.objectPath,
      p_sha256: digest,
      p_byte_size: bytes.byteLength,
      p_original_name: parsed.data.originalName,
    });
    if (error || !data) return Response.json({ error: error?.code === '23505' ? 'ARTIFACT_ALREADY_RECORDED' : 'ARTIFACT_NOT_RECORDED' }, { status: 409 });
    const row = data as { id: string; batch_item_id: string; kind: string; object_path: string; original_name: string; sha256: string; byte_size: number; created_at: string };
    return Response.json({ artifact: { id: row.id, batchItemId: row.batch_item_id, kind: row.kind, objectPath: row.object_path, originalName: row.original_name, sha256: row.sha256, byteSize: row.byte_size, createdAt: row.created_at } });
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: number }).status) : 400;
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: string }).code) : 'INVALID_REQUEST';
    return Response.json({ error: code }, { status });
  }
}
