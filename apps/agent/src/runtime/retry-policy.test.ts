import { describe, expect, it, vi } from 'vitest';
import { retryTransientRead, type RetryPolicyError } from './retry-policy.js';

describe('retryTransientRead', () => {
  it('retries a transient network read with bounded exponential delays', async () => {
    const waits: number[] = [];
    let attempts = 0;
    const result = await retryTransientRead(async () => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error('temporarily unavailable'), { code: 'ETIMEDOUT' });
      return 'ok';
    }, { maxAttempts: 3, baseDelayMs: 10, jitterRatio: 0, sleep: async (ms) => { waits.push(ms); } });

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
    expect(waits).toEqual([10, 20]);
  });

  it('does not retry CAPTCHA, authorization, identity or activity errors', async () => {
    for (const code of ['CAPTCHA_REQUIRED', 'AUTHORIZATION_MISSING', 'IDENTITY_MISMATCH', 'ACTIVITY_MISMATCH', 'AMBIGUOUS_SUBMISSION']) {
      let attempts = 0;
      await expect(retryTransientRead(async () => {
        attempts += 1;
        throw Object.assign(new Error(code), { code } satisfies Partial<RetryPolicyError>);
      }, { sleep: async () => {} })).rejects.toThrow(code);
      expect(attempts).toBe(1);
    }
  });

  it('exhausts transient attempts and preserves the last error', async () => {
    const failure = Object.assign(new Error('gateway timeout'), { code: 'ETIMEDOUT' });
    const operation = vi.fn(async () => { throw failure; });
    await expect(retryTransientRead(operation, { maxAttempts: 2, sleep: async () => {} })).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('allows the caller to continue another item after one item fails', async () => {
    const outcomes = await Promise.allSettled([
      retryTransientRead(async () => { throw Object.assign(new Error('down'), { code: 'ECONNRESET' }); }, { maxAttempts: 1, sleep: async () => {} }),
      retryTransientRead(async () => 'next', { maxAttempts: 1, sleep: async () => {} }),
    ]);
    expect(outcomes[0].status).toBe('rejected');
    expect(outcomes[1]).toEqual({ status: 'fulfilled', value: 'next' });
  });
});
