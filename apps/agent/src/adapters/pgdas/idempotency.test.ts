import { describe, expect, it } from 'vitest';
import { createAttemptId, reconcileDeclaration } from './idempotency.js';

const expected = { confirmationId: 'PG-001', summaryFingerprint: 'fp-1' };

describe('PGDAS idempotency reconciliation', () => {
  it('classifies no declaration as safe for the first guarded attempt', () => {
    expect(reconcileDeclaration(null, expected)).toBe('none');
  });

  it('only matches a transmitted declaration with both immutable identifiers', () => {
    expect(reconcileDeclaration({ status: 'transmitted', confirmationId: 'PG-001', summaryFingerprint: 'fp-1' }, expected)).toBe('matching');
    expect(reconcileDeclaration({ status: 'transmitted', confirmationId: 'PG-001', summaryFingerprint: 'other' }, expected)).toBe('conflict');
    expect(reconcileDeclaration({ status: 'transmitted', confirmationId: 'other', summaryFingerprint: 'fp-1' }, expected)).toBe('conflict');
  });

  it('treats unreadable and non-transmitted declarations as attention', () => {
    expect(reconcileDeclaration({ status: 'conflict', confirmationId: 'PG-002', summaryFingerprint: 'fp-2' }, expected)).toBe('conflict');
    expect(reconcileDeclaration({ status: 'unknown' }, expected)).toBe('unknown');
  });

  it('creates unique attempt identifiers without embedding the fingerprint', () => {
    const first = createAttemptId('PG-001');
    const second = createAttemptId('PG-001');
    expect(first).not.toBe(second);
    expect(first).toMatch(/^pgdas-PG-001-/);
    expect(first).not.toContain('fp-1');
  });
});
