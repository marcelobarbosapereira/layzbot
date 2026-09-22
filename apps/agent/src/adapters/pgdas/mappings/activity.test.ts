import { describe, expect, it } from 'vitest';
import { activityOptionMatches, mapActivity } from './activity.js';

describe('PGDAS activity mappings', () => {
  it.each([
    ['commerce', 'Comércio'],
    ['services', 'Serviços'],
  ])('maps %s to the exact visible option', (code, option) => {
    const result = mapActivity(code);
    expect(result).toEqual({ status: 'matched', mapping: { code, portalOption: option } });
    if (result.status === 'matched') expect(activityOptionMatches(result.mapping, `  ${option}  `)).toBe(true);
  });

  it('rejects unsupported options instead of choosing by row position', () => {
    expect(mapActivity('manufacturing')).toEqual({ status: 'needs_attention', reason: 'ACTIVITY_MISMATCH' });
  });
});
