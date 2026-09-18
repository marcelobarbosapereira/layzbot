import { agentJobClaim } from '@lazybot/contracts';
import { authenticateAndRpc, jobErrorResponse, requestJson } from '../job-route';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = agentJobClaim.safeParse(await requestJson(request));
    if (!body.success) return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    const job = await authenticateAndRpc(request, 'claim_next_batch_item', (principal, tokenHash) => ({
      p_device_id: principal.id,
      p_token_hash: tokenHash,
    }));
    return Response.json({ job });
  } catch (error) {
    return jobErrorResponse(error);
  }
}
