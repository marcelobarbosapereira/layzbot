#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createDefaultCertificateCli, runCertificateCli } from './certificates.js';
import { createLinuxSecretServiceProvider } from '../secrets/linux-secret-service.js';
import { createWindowsDpapiProvider } from '../secrets/windows-dpapi.js';
import { enroll } from './enroll.js';
import { createDefaultAgentDataDir, runAgent } from './run.js';

const dataDir = createDefaultAgentDataDir();
const secrets = process.platform === 'win32' ? createWindowsDpapiProvider() : createLinuxSecretServiceProvider();

export async function askHidden(question: string): Promise<string> {
  output.write(question);
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    const chunks: Buffer[] = [];
    for await (const chunk of input) chunks.push(Buffer.from(chunk));
    output.write('\n');
    return Buffer.concat(chunks).toString('utf8').trim();
  }
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') { input.setRawMode?.(false); input.pause(); reject(new Error('ENROLLMENT_CANCELLED')); return; }
        if (char === '\r' || char === '\n') { input.setRawMode?.(false); input.pause(); input.off('data', onData); output.write('\n'); resolve(value); return; }
        if (char === '\u007f') { value = value.slice(0, -1); continue; }
        value += char;
      }
    };
    input.setRawMode(true); input.resume(); input.on('data', onData);
  });
}

async function promptEnroll(): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    const result = await enroll({ dataDir, secrets, prompts: {
      ask: (question) => rl.question(question), askSecret: askHidden,
    } });
    output.write(`Enrolled device ${result.deviceId}. Keep this terminal private.\n`);
  } finally { rl.close(); }
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  if (argv[0] === 'enroll' && argv.length === 1) return promptEnroll();
  if (argv[0] === 'run' && argv.length === 1) return runAgent({ dataDir, secrets });
  if (argv[0] === 'cert') { await runCertificateCli(argv, { registry: createDefaultCertificateCli(), readPassphrase: async () => {
    const rl = createInterface({ input, output }); try { return await rl.question('PFX passphrase: '); } finally { rl.close(); }
  }, write: (line) => output.write(`${line}\n`) }); return; }
  throw new Error('INVALID_ARGUMENTS');
}

main().catch((error: unknown) => { output.write(`${error instanceof Error ? error.message : 'COMMAND_FAILED'}\n`); process.exitCode = 1; });
