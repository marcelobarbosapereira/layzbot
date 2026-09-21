import { spawn } from 'node:child_process';
import type { SecretProvider } from './provider';

function invoke(args: string[], input?: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const child = spawn('secret-tool', args);
    const out: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.on('error', () => reject(new Error('SECRET_PROVIDER_UNAVAILABLE')));
    child.on('close', (code) => code === 0 ? resolve(Buffer.concat(out)) : reject(new Error('SECRET_PROVIDER_ERROR')));
    if (input) child.stdin.end(input); else child.stdin.end();
  });
}

export function normalizeSecretLookup(value: Uint8Array): Uint8Array {
  const end = value.length && value[value.length - 1] === 10 ? value.length - 1 : value.length;
  const trimmedEnd = end && value[end - 1] === 13 ? end - 1 : end;
  return value.slice(0, trimmedEnd);
}

export function createLinuxSecretServiceProvider(): SecretProvider {
  return {
    async store(key, value) { await invoke(['store', '--label=LazyBot certificate secret', 'application', 'lazybot', 'key', key], value); },
    async read(key) { const bytes = normalizeSecretLookup(await invoke(['lookup', 'application', 'lazybot', 'key', key])); return bytes.length ? bytes : null; },
    async delete(key) { await invoke(['clear', 'application', 'lazybot', 'key', key]).catch(() => undefined); },
  };
}
