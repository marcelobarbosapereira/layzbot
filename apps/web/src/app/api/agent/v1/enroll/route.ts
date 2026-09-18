import { agentEnrollment } from '@lazybot/contracts';
import { DeviceAuthError, redeemEnrollmentToken } from '../../../../../lib/device-auth';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = agentEnrollment.safeParse(await request.json());
    if (!body.success) return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    return Response.json(await redeemEnrollmentToken(body.data), { status: 201 });
  } catch (error) {
    if (error instanceof DeviceAuthError) return Response.json({ error: error.code }, { status: error.status });
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }
}
