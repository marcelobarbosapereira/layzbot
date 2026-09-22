import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

const root = join(process.cwd(), '');

describe('packaging launch boundaries', () => {
  it('keeps launcher paths aligned with the packaged dist layout and user service path', async () => {
    const windows = await readFile(join(root, 'scripts', 'package-windows.ps1'), 'utf8');
    const arch = await readFile(join(root, 'scripts', 'package-arch.sh'), 'utf8');
    const service = await readFile(join(root, 'packaging', 'lazybot-agent.service'), 'utf8');
    expect(windows).toContain('dist\\src\\cli\\main.js');
    expect(arch).toContain('dist/src/cli/main.js');
    expect(service).toContain('%h/.local/share/lazybot-agent/lazybot-agent');
  });

  it('packages the runtime dependencies and converts the scheduler XML encoding', async () => {
    const windows = await readFile(join(root, 'scripts', 'package-windows.ps1'), 'utf8');
    const arch = await readFile(join(root, 'scripts', 'package-arch.sh'), 'utf8');
    expect(windows).toContain('node_modules\\zod');
    expect(windows).toContain('Encoding Unicode');
    expect(arch).toContain('node_modules/zod');
    expect(arch).toContain('node_modules/@lazybot/contracts/dist');
  });

  it.skipIf(process.platform !== 'win32')('executes the packaged launcher from its clean output directory', async () => {
    const output = await mkdtemp(join(tmpdir(), 'lazybot-package-smoke-'));
    await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'package-windows.ps1'), '-Output', output]);
    await expect(execFileAsync('cmd.exe', ['/d', '/c', join(output, 'lazybot-agent.cmd'), 'invalid'])).rejects.toMatchObject({ stdout: expect.stringContaining('INVALID_ARGUMENTS') });
  }, 30000);
});
