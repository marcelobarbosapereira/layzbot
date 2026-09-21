import { expect, it } from 'vitest';
import { agentJobEvent } from './agent-api';

it('accepts an intervention state with a user-visible message', () => {
  expect(agentJobEvent.safeParse({ expectedState: 'transmitting', nextState: 'needs_attention', message: 'Procuração expirada', sequence: 1 }).success).toBe(true);
});

it('accepts a terminal failure state', () => {
  expect(agentJobEvent.safeParse({ expectedState: 'awaiting_result', nextState: 'failed', message: 'Portal indisponível', sequence: 2 }).success).toBe(true);
});
