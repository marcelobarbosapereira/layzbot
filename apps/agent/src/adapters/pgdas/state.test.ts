import { describe, expect, it } from 'vitest';
import {
  assertTransmissionAllowed,
  isTerminal,
  isRetryable,
  transition,
  type PgdasState,
} from './state.js';

describe('PGDAS state machine', () => {
  it('accepts the safe calculation-to-submit checkpoint', () => {
    expect(transition('calculated', 'submitted')).toBe('submitted');
  });

  it('rejects skipping calculation and backwards transitions', () => {
    expect(() => transition('calculated', 'completed')).toThrow('INVALID_TRANSITION');
    expect(() => transition('submitted', 'assessment_filled')).toThrow('INVALID_TRANSITION');
  });

  it('identifies terminal and automatically retryable states', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('needs_attention')).toBe(true);
    expect(isRetryable('interrupted')).toBe(true);
    expect(isRetryable('failed')).toBe(true);
    expect(isRetryable('submitted')).toBe(false);
  });

  it('requires an immutable confirmed snapshot before transmission', () => {
    expect(() => assertTransmissionAllowed({ confirmed: false, fingerprint: 'x' })).toThrow('CONFIRMATION_REQUIRED');
    expect(() => assertTransmissionAllowed({ confirmed: true, fingerprint: '' })).toThrow('SNAPSHOT_FINGERPRINT_REQUIRED');
    expect(assertTransmissionAllowed({ confirmed: true, fingerprint: 'snapshot-1' })).toBeUndefined();
  });

  it('does not expose an unrecognised state as valid', () => {
    expect(() => transition('calculated' as PgdasState, 'bogus' as PgdasState)).toThrow('INVALID_TRANSITION');
  });
});
