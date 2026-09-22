import { createHash } from 'node:crypto';
import { z } from 'zod';
import { authenticateDevice } from '../../../../../../lib/device-auth';
import { createClient } from '../../../../../../lib/supabase/server';

const requestSchema = z.object({ batchItemId: z.string().uuid(), kind: z.enum(['das', 'receipt']), objectPath: z.string().min(1), originalName: z.string().min(1).max(255), sha256: z.string().regex(/^[a-f0-9]{64}$/), byteSize: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) });
export async function POST(request: Request): Promise<Response> {
  try {
    const principal = await authenticateDevice(request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success || !parsed.data.objectPath.startsWith(`${principal.ownerId}/`) || parsed.data.objectPath.includes('..')) return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    const supabase = await createClient();
    const downloaded = await supabase.storage.from('artifacts').download(parsed.data.objectPath);
    if (downloaded.error || !downloaded.data) return Response.json({ error: 'UPLOAD_NOT_FOUND' }, { status: 400 });
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (bytes.byteLength !== parsed.data.byteSize || digest !== parsed.data.sha256) return Response.json({ error: 'ARTIFACT_HASH_MISMATCH' }, { status: 409 });
    const { data, error } = await supabase.from('artifacts').insert({ batch_item_id: parsed.data.batchItemId, owner_id: principal.ownerId, kind: parsed.data.kind, object_path: parsed.data.objectPath, original_name: parsed.data.originalName, sha256: digest, byte_size: bytes.byteLength }).select('id,batch_item_id,kind,object_path,original_name,sha256,byte_size,created_at').single();
    if (error || !data) return Response.json({ error: 'ARTIFACT_NOT_RECORDED' }, { status: 409 });
    return Response.json({ artifact: { id: data.id, batchItemId: data.batch_item_id, kind: data.kind, objectPath: data.object_path, originalName: data.original_name, sha256: data.sha256, byteSize: data.byte_size, createdAt: data.created_at } });
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: number }).status) : 400;
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: string }).code) : 'INVALID_REQUEST';
    return Response.json({ error: code }, { status });
  }
}
