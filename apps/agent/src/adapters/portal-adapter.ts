export type AgentJob = {
  itemId: string;
  batchId: string;
  state: 'authenticating';
  nextSequence: number;
  leaseExpiresAt: string;
  competence: string;
  revenueCents: number;
  activity: string;
  taxOption: string;
  municipalityCode: string | null;
  parameters: Record<string, unknown>;
  taxpayer: { id: string; name: string; document: string };
  responsible: { id: string; name: string; document: string };
};

export interface JobReporter {
  transition(nextState: 'transmitting' | 'awaiting_result', message: string): Promise<void>;
}

export interface PortalAdapter {
  execute(job: AgentJob, reporter: JobReporter, signal: AbortSignal): Promise<void>;
}
