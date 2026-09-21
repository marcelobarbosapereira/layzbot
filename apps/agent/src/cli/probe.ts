import type { CertificateRegistry } from '../certificates/registry';
import { assertAllowedHttpsOrigin, clearClientCertificateOptions, createClientCertificateOptions, type ClientCertificateOptions } from '../certificates/client-certificate';

type ProbeContext = { newPage(): Promise<{ goto(url: string): Promise<unknown> }>; close(): Promise<void> };
type ProbeBrowser = { newContext(options: ClientCertificateOptions): Promise<ProbeContext>; close(): Promise<void> };
type Launch = (options: { headless: boolean }) => Promise<ProbeBrowser>;

export type PortalOriginProbeInput = {
  registry: Pick<CertificateRegistry, 'resolve'>;
  responsibleId: string;
  origin: string;
  allowlistedOrigins: string[];
  headless?: boolean;
  launch?: Launch;
};

export type PortalOriginProbeResult = { origin: string; tlsAccepted: boolean };

async function launchChromium(options: { headless: boolean }): Promise<ProbeBrowser> {
  const { chromium } = await import('playwright');
  return chromium.launch(options);
}

/** Opens only the allowlisted origin and records the TLS outcome, never page data. */
export async function runPortalOriginProbe(input: PortalOriginProbeInput): Promise<PortalOriginProbeResult> {
  const origin = assertAllowedHttpsOrigin(input.origin, input.allowlistedOrigins);
  const options = await createClientCertificateOptions(input.registry, input.responsibleId, [origin]);
  const browser = await (input.launch ?? launchChromium)({ headless: input.headless ?? false });
  let context: ProbeContext | undefined;
  try {
    context = await browser.newContext(options);
    clearClientCertificateOptions(options);
    let tlsAccepted = false;
    try {
      const page = await context.newPage();
      await page.goto(origin);
      tlsAccepted = true;
    } catch {
      tlsAccepted = false;
    }
    return { origin, tlsAccepted };
  } finally {
    clearClientCertificateOptions(options);
    await context?.close().catch(() => undefined);
    await browser.close();
  }
}

export type ProbeCliIo = {
  registry: Pick<CertificateRegistry, 'resolve'>;
  launch?: Launch;
  write: (line: string) => void;
};

/** CLI facade: `probe --responsible ID --origin ORIGIN --allow-origin ORIGIN`. */
export async function runProbeCli(argv: string[], io: ProbeCliIo): Promise<PortalOriginProbeResult> {
  if (argv[0] !== 'probe' || argv.length < 7) throw new Error('INVALID_ARGUMENTS');
  const responsibleIndex = argv.indexOf('--responsible');
  const originIndex = argv.indexOf('--origin');
  const allowIndexes = argv.reduce<number[]>((indexes, value, index) => value === '--allow-origin' ? [...indexes, index] : indexes, []);
  if (responsibleIndex < 1 || originIndex < 1 || !argv[responsibleIndex + 1] || !argv[originIndex + 1] || responsibleIndex + 2 > argv.length || originIndex + 2 > argv.length || allowIndexes.length === 0) {
    throw new Error('INVALID_ARGUMENTS');
  }
  const expectedLength = 3 + allowIndexes.length * 2 + 2;
  if (argv.length !== expectedLength) throw new Error('INVALID_ARGUMENTS');
  const result = await runPortalOriginProbe({
    registry: io.registry,
    responsibleId: argv[responsibleIndex + 1],
    origin: argv[originIndex + 1],
    allowlistedOrigins: allowIndexes.map((index) => argv[index + 1]),
    headless: false,
    launch: io.launch,
  });
  io.write(JSON.stringify(result));
  return result;
}

export type { Launch };
