import { describe, expect, it } from 'vitest';

import { buildOwnerStoragePrefix } from './storage-path';

describe('buildOwnerStoragePrefix', () => {
  it('builds the exact storage prefix for a valid owner UUID', () => {
    expect(buildOwnerStoragePrefix('10000000-0000-4000-8000-000000000001')).toBe(
      '10000000-0000-4000-8000-000000000001/',
    );
  });

  it('rejects an invalid owner UUID', () => {
    expect(() => buildOwnerStoragePrefix('not-an-owner-id')).toThrow();
  });

  it('rejects traversal segments appended to an owner UUID', () => {
    expect(() =>
      buildOwnerStoragePrefix('10000000-0000-4000-8000-000000000001/../other-owner'),
    ).toThrow();
  });
});
