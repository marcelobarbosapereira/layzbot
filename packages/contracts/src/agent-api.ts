import { z } from 'zod';

export const certificateMetadata = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
  subject: z.string().trim().min(1).max(500),
  expiresAt: z.iso.datetime({ offset: true }),
  available: z.boolean(),
});

export const agentHeartbeat = z.object({
  agentVersion: z.string().trim().min(1).max(100),
  os: z.string().trim().min(1).max(100),
  capabilities: z.array(z.string().trim().min(1).max(100)).max(100),
  certificates: z.array(certificateMetadata).max(500),
});

export const agentEnrollment = z.object({
  enrollmentToken: z.string().min(40).max(500),
  agentVersion: z.string().trim().min(1).max(100),
  os: z.string().trim().min(1).max(100),
});

export const deviceHeartbeatStatus = z.object({
  id: z.string().uuid(),
  online: z.literal(true),
  certificateCount: z.number().int().nonnegative(),
  lastSeenAt: z.iso.datetime({ offset: true }),
});

export const agentJobState = z.enum([
  'authenticating',
  'transmitting',
  'awaiting_result',
  'completed',
  'interrupted',
  'needs_attention',
  'failed',
]);

export const agentJobClaim = z.object({}).strict();

export const agentJobEvent = z.object({
  expectedState: agentJobState,
  nextState: agentJobState,
  message: z.string().trim().min(1).max(1000),
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export const agentJobTerminal = z.object({
  expectedState: agentJobState,
  message: z.string().trim().min(1).max(1000),
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export type AgentHeartbeat = z.infer<typeof agentHeartbeat>;
export type AgentEnrollment = z.infer<typeof agentEnrollment>;
export type DeviceHeartbeatStatus = z.infer<typeof deviceHeartbeatStatus>;
export type AgentJobEvent = z.infer<typeof agentJobEvent>;
export type AgentJobTerminal = z.infer<typeof agentJobTerminal>;
