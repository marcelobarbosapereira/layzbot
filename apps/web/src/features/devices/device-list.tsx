'use client';

import { useState, useTransition } from 'react';
import { createDeviceEnrollment, revokeDevice, type DeviceListItem } from './actions';

type Enroll = (input: { name: string }) => Promise<{ status: 'success'; enrollmentToken: string; expiresAt: string } | { status: 'error'; message: string }>;

export function DeviceList({ devices: initialDevices, onEnroll = createDeviceEnrollment }: { devices: DeviceListItem[]; onEnroll?: Enroll }) {
  const [devices, setDevices] = useState(initialDevices);
  const [name, setName] = useState('');
  const [enrollment, setEnrollment] = useState<{ token: string; expiresAt: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return <section>
    <form onSubmit={(event) => {
      event.preventDefault();
      setEnrollment(null);
      startTransition(async () => {
        const result = await onEnroll({ name });
        if (result.status === 'success') setEnrollment({ token: result.enrollmentToken, expiresAt: result.expiresAt });
      });
    }}>
      <label>Nome do novo dispositivo <input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <button type="submit" disabled={pending || name.trim().length === 0}>Criar código de inscrição</button>
    </form>
    {enrollment && <aside aria-live="polite">
      <p>Copie este código agora. Ele é exibido somente nesta inscrição e expira em {new Date(enrollment.expiresAt).toLocaleString('pt-BR')}.</p>
      <code>{enrollment.token}</code>
    </aside>}
    <ul aria-label="Dispositivos executores">
    {devices.map((device) => <li key={device.id}>
      <strong>{device.name}</strong>{' — '}
      <span>{device.revokedAt ? 'Revogado' : device.online ? 'Online' : 'Offline'}</span>{' — '}
      <span>{device.os ?? 'SO não informado'} / {device.agentVersion ?? 'versão não informada'}</span>{' — '}
      <span>{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString('pt-BR') : 'Sem sinal'}</span>{' — '}
      <span>{device.certificateCount} {device.certificateCount === 1 ? 'certificado' : 'certificados'}</span>
      {!device.revokedAt && <button type="button" disabled={pending} aria-label={`Revogar ${device.name}`} onClick={() => startTransition(async () => {
        const result = await revokeDevice(device.id);
        if (result.status === 'success') setDevices((current) => current.map((item) => item.id === device.id ? { ...item, revokedAt: new Date().toISOString(), online: false } : item));
      })}>Revogar</button>}
    </li>)}
    </ul>
  </section>;
}
