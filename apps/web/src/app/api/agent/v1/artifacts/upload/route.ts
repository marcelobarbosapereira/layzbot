import { createHash } from 'node:crypto';
import { z } from 'zod';
import { authenticateDevice } from '../../../../../../lib/device-auth';
import { createServiceClient } from '../../../../../../lib/supabase/service';

const requestSchema = z.object({
  batchItemId: z.string().uuid(), kind: z.enum(['das', 'receipt']), objectPath: z.string().min(1),
  originalName: z.string().min(1).max(255), sha256: z.string().regex(/^[a-f0-9]{64}$/), byteSize: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const principal = await authenticateDevice(request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success || !parsed.data.objectPath.startsWith(`${principal.ownerId}/`) || parsed.data.objectPath.includes('..')) return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage.from('fiscal-documents').createSignedUploadUrl(parsed.data.objectPath);
    if (error || !data) return Response.json({ error: 'UPLOAD_UNAVAILABLE' }, { status: 503 });
    const { error: registrationError } = await supabase.rpc('register_artifact_upload', {
      p_device_id: principal.id,
      p_batch_item_id: parsed.data.batchItemId,
      p_kind: parsed.data.kind,
      p_object_path: parsed.data.objectPath,
      p_upload_token_hash: createHash('sha256').update(data.token).digest('hex'),
      p_expected_sha256: parsed.data.sha256,
      p_expected_byte_size: parsed.data.byteSize,
      p_original_name: parsed.data.originalName,
    });
    if (registrationError) return Response.json({ error: 'UPLOAD_NOT_AUTHORIZED' }, { status: 403 });
    return Response.json({ uploadUrl: data.signedUrl, uploadToken: data.token, objectPath: parsed.data.objectPath, batchItemId: parsed.data.batchItemId, kind: parsed.data.kind });
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: number }).status) : 400;
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: string }).code) : 'INVALID_REQUEST';
    return Response.json({ error: code }, { status });
  }
}
