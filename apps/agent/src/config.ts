import { z } from 'zod';

const environment = z.object({
  LAZYBOT_URL: z.url(),
  LAZYBOT_DEVICE_TOKEN: z.string().min(1),
  LAZYBOT_DEVICE_NAME: z.string().trim().min(1),
  LAZYBOT_OS: z.string().trim().min(1),
  LAZYBOT_AGENT_VERSION: z.string().trim().min(1),
});

export type AgentConfig = {
  url: string;
  deviceToken: string;
  deviceName: string;
  os: string;
  agentVersion: string;
};

export function readAgentConfig(source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): AgentConfig {
  const result = environment.safeParse(source);
  if (!result.success) throw new Error('INVALID_CONFIGURATION');
  const parsedUrl = new URL(result.data.LAZYBOT_URL);
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
    throw new Error('INVALID_CONFIGURATION');
  }
  return {
    url: parsedUrl.href.replace(/\/$/, ''),
    deviceToken: result.data.LAZYBOT_DEVICE_TOKEN,
    deviceName: result.data.LAZYBOT_DEVICE_NAME,
    os: result.data.LAZYBOT_OS,
    agentVersion: result.data.LAZYBOT_AGENT_VERSION,
  };
}
