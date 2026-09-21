import { describe, expect, it } from 'vitest';
import { normalizeSecretLookup } from './linux-secret-service';

describe('Secret Service output', () => {
  it('removes either LF or CRLF terminators without changing secret bytes', () => {
    expect(normalizeSecretLookup(new TextEncoder().encode('secret\n'))).toEqual(new TextEncoder().encode('secret'));
    expect(normalizeSecretLookup(new TextEncoder().encode('secret\r\n'))).toEqual(new TextEncoder().encode('secret'));
  });
});
