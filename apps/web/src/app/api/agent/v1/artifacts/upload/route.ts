import { z } from 'zod';
import { authenticateDevice } from '../../../../../../lib/device-auth';
import { createClient } from '../../../../../../lib/supabase/server';

const requestSchema = z.object({
  batchItemId: z.string().uuid(), kind: z.enum(['das', 'receipt']), objectPath: z.string().min(1),
  originalName: z.string().min(1).max(255), sha256: z.string().regex(/^[a-f0-9]{64}$/), byteSize: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const principal = await authenticateDevice(request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success || !parsed.data.objectPath.startsWith(`${principal.ownerId}/`) || parsed.data.objectPath.includes('..')) return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from('artifacts').createSignedUploadUrl(parsed.data.objectPath);
    if (error || !data) return Response.json({ error: 'UPLOAD_UNAVAILABLE' }, { status: 503 });
    return Response.json({ uploadUrl: data.signedUrl, token: data.token, objectPath: parsed.data.objectPath, batchItemId: parsed.data.batchItemId, kind: parsed.data.kind });
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: number }).status) : 400;
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: string }).code) : 'INVALID_REQUEST';
    return Response.json({ error: code }, { status });
  }
}
