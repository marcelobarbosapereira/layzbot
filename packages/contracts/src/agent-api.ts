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

export type AgentHeartbeat = z.infer<typeof agentHeartbeat>;
export type AgentEnrollment = z.infer<typeof agentEnrollment>;
export type DeviceHeartbeatStatus = z.infer<typeof deviceHeartbeatStatus>;
