import { afterEach, describe, expect, it } from 'vitest';
import { PgdasAdapter, type PgdasReporter } from './adapter.js';
import { FixturePortalServer } from './fixture-server.js';
import type { AgentJob } from '../portal-adapter.js';

const job: AgentJob = {
  itemId: '11111111-1111-4111-8111-111111111111', batchId: '22222222-2222-4222-8222-222222222222',
  state: 'authenticating', nextSequence: 1, leaseExpiresAt: '2026-09-22T10:00:00Z',
  competence: '2026-09', revenueCents: 0, activity: 'services', taxOption: 'service',
  municipalityCode: null, parameters: { confirmed: true, snapshotFingerprint: 'snapshot-1' },
  taxpayer: { id: '33333333-3333-4333-8333-333333333333', name: 'Fixture Ltda', document: '00000000000100' },
  responsible: { id: '44444444-4444-4444-8444-444444444444', name: 'Fixture Resp', document: '00000000000' },
};

describe('PgdasAdapter fixture portal', () => {
  const server = new FixturePortalServer();
  afterEach(async () => { await server.close(); });

  it('walks to the confirmation boundary without transmitting', async () => {
    const url = await server.start();
    const methods: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      methods.push(init?.method ?? 'GET');
      return fetch(input, init);
    };
    const states: string[] = [];
    const adapter = new PgdasAdapter({ baseUrl: url, fetcher });
    await adapter.execute(job, {
      transition: async () => undefined,
      checkpoint: async (state) => { states.push(state); },
    } as PgdasReporter, new AbortController().signal);
    expect(adapter.lastState).toBe('calculated');
    expect(states).toEqual(['profile_selected', 'profile_selected', 'assessment_filled', 'assessment_filled', 'assessment_filled', 'calculated', 'calculated']);
    expect(methods.every((method) => method === 'GET')).toBe(true);
  });

  it('requires the immutable confirmation snapshot', async () => {
    const url = await server.start();
    await expect(new PgdasAdapter({ baseUrl: url }).execute(
      { ...job, parameters: {} }, { transition: async () => undefined }, new AbortController().signal,
    )).rejects.toThrow('CONFIRMATION_REQUIRED');
  });
});
