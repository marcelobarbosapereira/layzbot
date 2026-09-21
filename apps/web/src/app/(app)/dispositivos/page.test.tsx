import { render, screen } from '@testing-library/react';
import DevicesPage from './page';

vi.mock('../../../features/devices/actions', () => ({
  listDevices: async () => [{ id: '60000000-0000-4000-8000-000000000071', name: 'Executor', os: 'linux', agentVersion: '1.0', lastSeenAt: null, revokedAt: null, online: false, certificateCount: 0 }],
  createDeviceEnrollment: async () => ({ status: 'error', message: 'Unavailable in test' }),
  revokeDevice: async () => ({ status: 'success' }),
}));

it('mounts device enrollment and revocation controls on the app route', async () => {
  render(await DevicesPage());
  expect(screen.getByRole('heading', { name: 'Dispositivos executores' })).toBeInTheDocument();
  expect(screen.getByLabelText('Nome do novo dispositivo')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Revogar Executor' })).toBeInTheDocument();
});
