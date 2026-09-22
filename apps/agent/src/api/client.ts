import {
  agentHeartbeat, agentJobClaim, agentJobEvent, agentJobTerminal, deviceHeartbeatStatus,
  type AgentJobEvent, type AgentJobTerminal,
} from '@lazybot/contracts';
import { z } from 'zod';
import type { AgentConfig } from '../config.js';
import type { AgentJob } from '../adapters/portal-adapter.js';
import type { AgentApi } from '../runtime/agent.js';

const claimedJob = z.object({
  itemId: z.uuid(), batchId: z.uuid(), state: z.literal('authenticating'),
  nextSequence: z.number().int().positive(), leaseExpiresAt: z.iso.datetime({ offset: true }),
  competence: z.string(), revenueCents: z.number().int().nonnegative(),
  activity: z.string(), taxOption: z.string(), municipalityCode: z.string().nullable(),
  parameters: z.record(z.string(), z.unknown()),
  taxpayer: z.object({ id: z.string(), name: z.string(), document: z.string() }),
  responsible: z.object({ id: z.string(), name: z.string(), document: z.string() }),
});

const eventResult = z.object({ itemId: z.uuid(), sequence: z.number().int().positive() });

function responseField<T>(data: unknown, field: string, schema: z.ZodType<T>): T {
  const envelope = z.record(z.string(), z.unknown()).safeParse(data);
  if (!envelope.success) throw new AgentApiError('AGENT_INVALID_RESPONSE');
  const parsed = schema.safeParse(envelope.data[field]);
  if (!parsed.success) throw new AgentApiError('AGENT_INVALID_RESPONSE');
  return parsed.data;
}

export class AgentApiError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export class HttpAgentApi implements AgentApi {
  constructor(
    private readonly config: AgentConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async post(path: string, body: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.config.url}/api/agent/v1/${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.config.deviceToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AgentApiError('AGENT_NETWORK_ERROR');
    }
    if (!response.ok) {
      // Server and transport errors can echo request headers: never include their text.
      throw new AgentApiError(response.status === 401 ? 'DEVICE_UNAUTHORIZED' : 'AGENT_API_ERROR');
    }
    try {
      return await response.json();
    } catch {
      throw new AgentApiError('AGENT_INVALID_RESPONSE');
    }
  }

  async heartbeat(): Promise<void> {
    const input = agentHeartbeat.parse({
      agentVersion: this.config.agentVersion, os: this.config.os,
      capabilities: ['simulated'], certificates: [],
    });
    const data = await this.post('heartbeat', input);
    responseField(data, 'device', deviceHeartbeatStatus);
  }

  async claim(): Promise<AgentJob | null> {
    const data = await this.post('jobs/claim', agentJobClaim.parse({}));
    return responseField(data, 'job', claimedJob.nullable());
  }

  async event(itemId: string, input: AgentJobEvent): Promise<void> {
    const data = await this.post(`jobs/${encodeURIComponent(itemId)}/events`, agentJobEvent.parse(input));
    responseField(data, 'event', eventResult);
  }

  async complete(itemId: string, input: AgentJobTerminal): Promise<void> {
    const data = await this.post(`jobs/${encodeURIComponent(itemId)}/complete`, agentJobTerminal.parse(input));
    responseField(data, 'event', eventResult);
  }

  async interrupt(itemId: string, input: AgentJobTerminal): Promise<void> {
    const data = await this.post(`jobs/${encodeURIComponent(itemId)}/interrupt`, agentJobTerminal.parse(input));
    responseField(data, 'event', eventResult);
  }
}
