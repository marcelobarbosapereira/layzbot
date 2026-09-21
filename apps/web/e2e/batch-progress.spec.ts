import { expect, test } from '@playwright/test';

const email = process.env.LAZYBOT_E2E_EMAIL;
const password = process.env.LAZYBOT_E2E_PASSWORD;
const batchId = process.env.LAZYBOT_E2E_BATCH_ID;
const sourceToken = process.env.LAZYBOT_E2E_SOURCE_DEVICE_TOKEN;
const targetDeviceId = process.env.LAZYBOT_E2E_TARGET_DEVICE_ID;
const targetToken = process.env.LAZYBOT_E2E_TARGET_DEVICE_TOKEN;

test.skip(!email || !password || !batchId || !sourceToken || !targetDeviceId || !targetToken || process.env.LAZYBOT_E2E_ALLOW_MUTATION !== '1',
  'Requires a fabricated disposable batch, both agent tokens, hosted test user, and explicit mutation opt-in.');

test('streams an agent interruption and explicitly reassigns the unfinished item', async ({ page, request }) => {
  test.setTimeout(150_000);
  const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
  async function agentPost(path: string, token: string, data: unknown) {
    const response = await request.post(`${base}${path}`, { headers: { authorization: `Bearer ${token}` }, data });
    expect(response.ok()).toBe(true);
    return response.json();
  }
  const heartbeat = { agentVersion: 'e2e-simulator', os: 'test', capabilities: [], certificates: [] };
  await agentPost('/api/agent/v1/heartbeat', sourceToken!, heartbeat);
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha').fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.goto(`/execucoes/${batchId}`);
  await expect(page.getByRole('heading', { name: /Execução/ })).toBeVisible();
  const claim = await agentPost('/api/agent/v1/jobs/claim', sourceToken!, {});
  const itemId = claim.job?.itemId as string;
  expect(itemId).toBeTruthy();
  await agentPost(`/api/agent/v1/jobs/${itemId}/events`, sourceToken!, { expectedState: 'authenticating', nextState: 'transmitting', message: 'Transmitindo pelo simulador', sequence: 1 });
  await expect(page.getByText('Transmitindo pelo simulador')).toBeVisible();
  await agentPost(`/api/agent/v1/jobs/${itemId}/interrupt`, sourceToken!, { expectedState: 'transmitting', message: 'Interrupção de teste', sequence: 2 });
  await expect(page.getByText('Interrompidos: 1')).toBeVisible();
  const heartbeatThresholdSeconds = Number(process.env.DEVICE_HEARTBEAT_THRESHOLD_SECONDS ?? '90');
  await page.waitForTimeout((heartbeatThresholdSeconds + 1) * 1000);
  await agentPost('/api/agent/v1/heartbeat', targetToken!, heartbeat);
  await page.reload();
  await expect(page.getByLabel('Novo dispositivo').locator(`option[value="${targetDeviceId}"]`)).toBeEnabled();
  await page.getByLabel('Novo dispositivo').selectOption(targetDeviceId!);
  await page.getByRole('button', { name: 'Reatribuir itens seguros' }).click();
  await expect(page.getByRole('status')).toContainText('itens reatribuídos');
});
