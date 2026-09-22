import type { PortalAdapter } from './portal-adapter.js';

/** Exercises the executor protocol without opening a browser or contacting a fiscal portal. */
export class SimulatedAdapter implements PortalAdapter {
  async execute(_job: Parameters<PortalAdapter['execute']>[0], reporter: Parameters<PortalAdapter['execute']>[1]): Promise<void> {
    await reporter.transition('transmitting', 'Simulated transmission started');
    await reporter.transition('awaiting_result', 'Simulated result received');
  }
}
