import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SecretProvider } from './provider.js';

const SCRIPT = '$input=[Console]::OpenStandardInput();$ms=New-Object IO.MemoryStream;$input.CopyTo($ms);$b=$ms.ToArray();if($args[0]-eq"protect"){$b=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)}else{$b=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)};[Console]::OpenStandardOutput().Write($b,0,$b.Length)';

function run(args: string[], input: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT, ...args], { windowsHide: true });
    const out: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.on('error', () => reject(new Error('SECRET_PROVIDER_UNAVAILABLE')));
    child.on('close', (code) => code === 0 ? resolve(Buffer.concat(out)) : reject(new Error('SECRET_PROVIDER_ERROR')));
    child.stdin.end(input);
  });
}

export function createWindowsDpapiProvider(filePath = `${process.env.LOCALAPPDATA ?? '.'}/LazyBot/secrets.json`): SecretProvider {
  async function load(): Promise<Record<string, string>> { try { return JSON.parse(await readFile(filePath, 'utf8')) as Record<string, string>; } catch { return {}; } }
  async function save(data: Record<string, string>) { await mkdir(dirname(filePath), { recursive: true }); await writeFile(filePath, JSON.stringify(data), { mode: 0o600 }); }
  return {
    async store(key, value) { const data = await load(); data[key] = Buffer.from(await run(['protect'], value)).toString('base64'); await save(data); },
    async read(key) { const value = (await load())[key]; return value ? run(['unprotect'], Buffer.from(value, 'base64')) : null; },
    async delete(key) { const data = await load(); delete data[key]; await save(data); },
  };
}

export function secureWindowsFile(filePath: string): Promise<void> {
  const username = process.env.USERNAME;
  if (!username) return Promise.reject(new Error('SECRET_PROVIDER_CONFIGURATION'));
  return new Promise((resolve, reject) => {
    const child = spawn('icacls.exe', [filePath, '/inheritance:r', '/grant:r', `${username}:(R,W)`], { windowsHide: true });
    child.on('error', () => reject(new Error('SECRET_PROVIDER_UNAVAILABLE')));
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error('SECRET_PROVIDER_ERROR')));
  });
}
