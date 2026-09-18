import { agentHeartbeat } from '@lazybot/contracts';
import { authenticateDevice, recordHeartbeat } from '../../../../../lib/device-auth';

export async function POST(request: Request): Promise<Response> {
  try {
    const principal = await authenticateDevice(request);
    const body = agentHeartbeat.safeParse(await request.json());
    if (!body.success) return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    const rawToken = request.headers.get('authorization')?.slice(7) ?? '';
    const device = await recordHeartbeat(principal, rawToken, body.data);
    return Response.json({ device });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && 'code' in error) {
      const authError = error as { status: number; code: string };
      return Response.json({ error: authError.code }, { status: authError.status });
    }
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }
}
