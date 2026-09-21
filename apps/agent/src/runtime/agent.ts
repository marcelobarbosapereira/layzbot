import type { AgentJobEvent, AgentJobTerminal } from '@lazybot/contracts';
import type { AgentJob, PortalAdapter } from '../adapters/portal-adapter';

export type { AgentJob } from '../adapters/portal-adapter';

export interface AgentApi {
  heartbeat(): Promise<void>;
  claim(): Promise<AgentJob | null>;
  event(itemId: string, input: AgentJobEvent): Promise<void>;
  complete(itemId: string, input: AgentJobTerminal): Promise<void>;
  interrupt(itemId: string, input: AgentJobTerminal): Promise<void>;
}

export interface RuntimeClock {
  wait(milliseconds: number, signal: AbortSignal): Promise<void>;
  every(callback: () => void, milliseconds: number): () => void;
}

export const systemClock: RuntimeClock = {
  wait(milliseconds, signal) {
    if (signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(done, milliseconds);
      function done() {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      }
      signal.addEventListener('abort', done, { once: true });
    });
  },
  every(callback, milliseconds) {
    const timer = setInterval(callback, milliseconds);
    return () => clearInterval(timer);
  },
};

const IDLE_POLL_MS = 5_000;
const LEASE_RENEW_MS = 30_000;

export class AgentRuntime {
  constructor(
    private readonly api: AgentApi,
    private readonly adapter: PortalAdapter,
    private readonly clock: RuntimeClock = systemClock,
  ) {}

  async start(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.api.heartbeat();
      if (signal.aborted) break;
      const job = await this.api.claim();
      if (signal.aborted && job) {
        await this.api.interrupt(job.itemId, {
          expectedState: job.state, message: 'Agent stopped', sequence: job.nextSequence,
        });
        break;
      }
      if (job) await this.execute(job, signal);
      if (!signal.aborted) await this.clock.wait(IDLE_POLL_MS, signal);
    }
  }

  private async execute(job: AgentJob, signal: AbortSignal): Promise<void> {
    type ActiveState = 'authenticating' | 'transmitting' | 'awaiting_result';
    let state: ActiveState = job.state;
    let sequence = job.nextSequence;
    let pending = Promise.resolve();
    let renewalError: unknown;
    let active = true;
    const enqueue = (resolveState: (current: ActiveState) => ActiveState, message: string): Promise<void> => {
      const operation = pending.then(async () => {
        if (!active || signal.aborted) return;
        const nextState = resolveState(state);
        await this.api.event(job.itemId, { expectedState: state, nextState, message, sequence });
        state = nextState;
        sequence += 1;
      });
      pending = operation;
      return operation;
    };
    const stopRenewal = this.clock.every(() => {
      if (!active || signal.aborted || renewalError) return;
      void enqueue((current) => current, 'Agent lease renewed').catch((error: unknown) => { renewalError = error; });
    }, LEASE_RENEW_MS);
    try {
      await this.adapter.execute(job, {
        transition: (nextState, message) => enqueue(() => nextState, message),
      }, signal);
      stopRenewal();
      await pending;
      if (renewalError) throw renewalError;
      active = false;
      if (signal.aborted) {
        await this.api.interrupt(job.itemId, { expectedState: state, message: 'Agent stopped', sequence });
      } else {
        await this.api.complete(job.itemId, { expectedState: state, message: 'Simulated item completed', sequence });
      }
    } catch (error) {
      active = false;
      if (signal.aborted) {
        await this.api.interrupt(job.itemId, { expectedState: state, message: 'Agent stopped', sequence });
        return;
      }
      throw error;
    } finally {
      active = false;
      stopRenewal();
    }
  }
}
