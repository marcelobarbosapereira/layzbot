import { readDeviceToken, loadAgentSettings } from './enroll';
import type { SecretProvider } from '../secrets/provider';
import { readAgentConfig } from '../config';
import { HttpAgentApi } from '../api/client';
import { AgentRuntime } from '../runtime/agent';
import { SimulatedAdapter } from '../adapters/simulated';

export type RuntimeFactory = (config: ReturnType<typeof readAgentConfig>, signal: AbortSignal) => Promise<void>;

export async function runAgent(options: { dataDir: string; secrets: SecretProvider; runtime?: RuntimeFactory; onSignal?: (handler: () => void) => () => void }): Promise<void> {
  const settings = await loadAgentSettings(options.dataDir);
  const token = await readDeviceToken(options.secrets);
  const config = readAgentConfig({
    LAZYBOT_URL: settings.url, LAZYBOT_DEVICE_TOKEN: token, LAZYBOT_DEVICE_NAME: settings.deviceName,
    LAZYBOT_OS: settings.os, LAZYBOT_AGENT_VERSION: settings.agentVersion,
  });
  const controller = new AbortController();
  const install = options.onSignal ?? ((handler) => { process.once('SIGINT', handler); process.once('SIGTERM', handler); return () => { process.off('SIGINT', handler); process.off('SIGTERM', handler); }; });
  const removeHandlers = install(() => controller.abort());
  try {
    if (options.runtime) return await options.runtime(config, controller.signal);
    await new AgentRuntime(new HttpAgentApi(config), new SimulatedAdapter()).start(controller.signal);
  } finally { removeHandlers(); }
}

export function createDefaultAgentDataDir(): string {
  return process.env.LAZYBOT_DATA_DIR ?? (process.platform === 'win32' ? `${process.env.LOCALAPPDATA ?? '.'}/LazyBot` : `${process.env.XDG_DATA_HOME ?? `${process.env.HOME ?? '.'}/.local/share`}/LazyBot`);
}
