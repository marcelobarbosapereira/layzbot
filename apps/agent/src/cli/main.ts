#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createDefaultCertificateCli, runCertificateCli } from './certificates';
import { createLinuxSecretServiceProvider } from '../secrets/linux-secret-service';
import { createWindowsDpapiProvider } from '../secrets/windows-dpapi';
import { enroll } from './enroll';
import { createDefaultAgentDataDir, runAgent } from './run';

const dataDir = createDefaultAgentDataDir();
const secrets = process.platform === 'win32' ? createWindowsDpapiProvider() : createLinuxSecretServiceProvider();

async function promptEnroll(): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    const result = await enroll({ dataDir, secrets, prompts: {
      ask: (question) => rl.question(question), askSecret: (question) => rl.question(question),
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
