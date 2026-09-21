export interface SecretProvider {
  store(key: string, value: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

export function createInMemorySecretProvider(): SecretProvider {
  const values = new Map<string, Uint8Array>();
  return {
    async store(key, value) { values.set(key, value.slice()); },
    async read(key) { const value = values.get(key); return value ? value.slice() : null; },
    async delete(key) { values.delete(key); },
  };
}
