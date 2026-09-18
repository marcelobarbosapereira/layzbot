import { agentJobTerminal } from '@lazybot/contracts';
import { authenticateAndRpc, jobErrorResponse, requestJson } from '../../job-route';

type Context = { params: Promise<{ itemId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const [{ itemId }, input] = await Promise.all([context.params, requestJson(request)]);
    const body = agentJobTerminal.safeParse(input);
    if (!body.success || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(itemId)) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    const event = await authenticateAndRpc(request, 'append_batch_item_event', (principal, tokenHash) => ({
      p_item_id: itemId,
      p_device_id: principal.id,
      p_token_hash: tokenHash,
      p_expected_state: body.data.expectedState,
      p_next_state: 'completed',
      p_message: body.data.message,
      p_sequence: body.data.sequence,
    }));
    return Response.json({ event });
  } catch (error) {
    return jobErrorResponse(error);
  }
}
