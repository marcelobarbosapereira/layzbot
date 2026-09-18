import { fireEvent, render, screen } from '@testing-library/react';
import { DeviceList } from './device-list';

it('shows device status, certificate count, and revoke control', () => {
  render(<DeviceList devices={[{ id: '60000000-0000-4000-8000-000000000071', name: 'Executor', os: 'linux', agentVersion: '1.0.0', lastSeenAt: '2026-09-18T11:59:30Z', revokedAt: null, online: true, certificateCount: 2 }]} />);
  expect(screen.getByText('Executor')).toBeInTheDocument();
  expect(screen.getByText('Online')).toBeInTheDocument();
  expect(screen.getByText('2 certificados')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Revogar Executor' })).toBeInTheDocument();
});

it('displays the enrollment token returned by the server exactly in the enrollment result', async () => {
  const enroll = vi.fn().mockResolvedValue({ status: 'success', enrollmentToken: '70000000-0000-4000-8000-000000000071.one-time-secret', expiresAt: '2026-09-18T12:10:00Z' });
  render(<DeviceList devices={[]} onEnroll={enroll} />);
  fireEvent.change(screen.getByLabelText('Nome do novo dispositivo'), { target: { value: 'Notebook escritório' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar código de inscrição' }));
  expect(await screen.findByText('70000000-0000-4000-8000-000000000071.one-time-secret')).toBeInTheDocument();
  expect(enroll).toHaveBeenCalledWith({ name: 'Notebook escritório' });
});
