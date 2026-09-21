import { describe, expect, it } from 'vitest';
import type { SecretProvider } from './provider';
import { createInMemorySecretProvider } from './provider';

describe('SecretProvider contract', () => {
  it('stores, reads and deletes opaque bytes without exposing them in errors', async () => {
    const provider: SecretProvider = createInMemorySecretProvider();
    const value = new TextEncoder().encode('fabricated-passphrase');
    await provider.store('cert/test', value);
    expect(await provider.read('cert/test')).toEqual(value);
    await provider.delete('cert/test');
    expect(await provider.read('cert/test')).toBeNull();
  });
});
