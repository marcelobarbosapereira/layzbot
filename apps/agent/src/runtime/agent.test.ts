import { describe, expect, it, vi } from 'vitest';
import { AgentRuntime, type AgentApi, type RuntimeClock } from './agent';
import { SimulatedAdapter } from '../adapters/simulated';

describe('AgentRuntime', () => {
  it('heartbeats, claims one item, emits ordered transitions, completes, then stops on abort', async () => {
    const calls: Array<{ kind: string; sequence?: number }> = [];
    const controller = new AbortController();
    let wake: (() => void) | undefined;
    const clock: RuntimeClock = {
      wait: vi.fn(() => new Promise<void>((resolve) => { wake = resolve; })),
      every: vi.fn(() => () => undefined),
    };
    const api: AgentApi = {
      heartbeat: async () => { calls.push({ kind: 'heartbeat' }); },
      claim: async () => {
        calls.push({ kind: 'claim' });
        return {
          itemId: '10000000-0000-4000-8000-000000000001',
          batchId: '10000000-0000-4000-8000-000000000002',
          state: 'authenticating' as const,
          nextSequence: 4,
          leaseExpiresAt: '2026-09-21T12:01:30Z',
          competence: '2026-09', revenueCents: 100,
          activity: 'commerce', taxOption: 'test', municipalityCode: null,
          parameters: {},
          taxpayer: { id: 'test-taxpayer', name: 'Fictícia', document: '00000000000000' },
          responsible: { id: 'test-responsible', name: 'Responsável', document: '00000000000' },
        };
      },
      event: async (_id, input) => { calls.push({ kind: 'event', sequence: input.sequence }); },
      complete: async (_id, input) => { calls.push({ kind: 'complete', sequence: input.sequence }); },
      interrupt: async () => { calls.push({ kind: 'interrupt' }); },
    };
    const running = new AgentRuntime(api, new SimulatedAdapter(), clock).start(controller.signal);
    await vi.waitFor(() => expect(calls.map((call) => call.kind)).toEqual([
      'heartbeat', 'claim', 'event', 'event', 'complete',
    ]));
    expect(calls.slice(2).map((call) => call.sequence)).toEqual([4, 5, 6]);
    expect(clock.wait).toHaveBeenCalledOnce();
    controller.abort();
    wake?.();
    await running;
    expect(calls).toHaveLength(5);
  });

  it('renews the active lease with an ordered same-state event before completion', async () => {
    const calls: Array<{ kind: string; state?: string; next?: string; sequence?: number }> = [];
    const controller = new AbortController();
    let tick: (() => void) | undefined;
    let release: (() => void) | undefined;
    let releaseFirstEvent: (() => void) | undefined;
    const clock: RuntimeClock = {
      wait: () => new Promise<void>(() => undefined),
      every: (callback) => { tick = callback; return () => { tick = undefined; }; },
    };
    const api: AgentApi = {
      heartbeat: async () => { calls.push({ kind: 'heartbeat' }); },
      claim: async () => {
        calls.push({ kind: 'claim' });
        return {
          itemId: '10000000-0000-4000-8000-000000000001', batchId: '10000000-0000-4000-8000-000000000002',
          state: 'authenticating', nextSequence: 1, leaseExpiresAt: '2026-09-21T12:01:30Z',
          competence: '2026-09', revenueCents: 100, activity: 'commerce', taxOption: 'test',
          municipalityCode: null, parameters: {},
          taxpayer: { id: '1', name: 'Fictícia', document: '00000000000000' },
          responsible: { id: '2', name: 'Responsável', document: '00000000000' },
        };
      },
      event: async (_id, input) => {
        calls.push({ kind: 'event', state: input.expectedState, next: input.nextState, sequence: input.sequence });
        if (input.sequence === 1) await new Promise<void>((resolve) => { releaseFirstEvent = resolve; });
      },
      complete: async (_id, input) => {
        calls.push({ kind: 'complete', state: input.expectedState, sequence: input.sequence });
        controller.abort();
      },
      interrupt: async () => { calls.push({ kind: 'interrupt' }); },
    };
    const adapter = { execute: async (_job: unknown, reporter: { transition: (state: 'transmitting' | 'awaiting_result', message: string) => Promise<void> }) => {
      await reporter.transition('transmitting', 'Simulated step one');
      await new Promise<void>((resolve) => { release = resolve; });
      await reporter.transition('awaiting_result', 'Simulated step two');
    } };
    const running = new AgentRuntime(api, adapter, clock).start(controller.signal);
    await vi.waitFor(() => expect(calls.map((call) => call.kind)).toEqual(['heartbeat', 'claim', 'event']));
    tick?.();
    releaseFirstEvent?.();
    await vi.waitFor(() => expect(calls.map((call) => call.kind)).toEqual(['heartbeat', 'claim', 'event', 'event']));
    release?.();
    await running;
    expect(calls.slice(2)).toEqual([
      { kind: 'event', state: 'authenticating', next: 'transmitting', sequence: 1 },
      { kind: 'event', state: 'transmitting', next: 'transmitting', sequence: 2 },
      { kind: 'event', state: 'transmitting', next: 'awaiting_result', sequence: 3 },
      { kind: 'complete', state: 'awaiting_result', sequence: 4 },
    ]);
  });

  it('interrupts an active item when shutdown is requested', async () => {
    const calls: string[] = [];
    const controller = new AbortController();
    const api: AgentApi = {
      heartbeat: async () => { calls.push('heartbeat'); },
      claim: async () => {
        calls.push('claim');
        return {
          itemId: '10000000-0000-4000-8000-000000000001', batchId: '10000000-0000-4000-8000-000000000002',
          state: 'authenticating', nextSequence: 1, leaseExpiresAt: '2026-09-21T12:01:30Z',
          competence: '2026-09', revenueCents: 100, activity: 'commerce', taxOption: 'test',
          municipalityCode: null, parameters: {},
          taxpayer: { id: '1', name: 'Fictícia', document: '00000000000000' },
          responsible: { id: '2', name: 'Responsável', document: '00000000000' },
        };
      },
      event: async () => { calls.push('event'); },
      complete: async () => { calls.push('complete'); },
      interrupt: async () => { calls.push('interrupt'); },
    };
    const adapter = { execute: async (_job: unknown, _reporter: unknown, signal: AbortSignal) => {
      calls.push('execute');
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    } };
    const clock: RuntimeClock = { wait: async () => undefined, every: () => () => undefined };
    const running = new AgentRuntime(api, adapter, clock).start(controller.signal);
    await vi.waitFor(() => expect(calls).toEqual(['heartbeat', 'claim', 'execute']));
    controller.abort();
    await running;
    expect(calls).toEqual(['heartbeat', 'claim', 'execute', 'interrupt']);
  });
});
