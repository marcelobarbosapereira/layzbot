import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright';

export type DownloadedDocument = { bytes: Uint8Array; suggestedFilename: string; temporaryPath: string };

/** Captures one Playwright download in an isolated temporary directory. */
export async function downloadDocument(page: Page, trigger: () => Promise<void>, options: { timeoutMs?: number } = {}): Promise<DownloadedDocument> {
  const directory = await mkdtemp(join(tmpdir(), 'lazybot-document-'));
  try {
    const downloadPromise = page.waitForEvent('download', { timeout: options.timeoutMs ?? 30_000 });
    await trigger();
    const download = await downloadPromise;
    const path = join(directory, 'download.pdf');
    await download.saveAs(path);
    return { bytes: await readFile(path), suggestedFilename: download.suggestedFilename(), temporaryPath: path };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function removeDownloadedDocument(document: DownloadedDocument): Promise<void> {
  await rm(document.temporaryPath, { force: true });
}
