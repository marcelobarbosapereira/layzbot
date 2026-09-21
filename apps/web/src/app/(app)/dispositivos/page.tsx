import { DeviceList } from '../../../features/devices/device-list';
import { listDevices } from '../../../features/devices/actions';

export default async function DevicesPage() {
  const devices = await listDevices();
  return <main><h1>Dispositivos executores</h1><DeviceList devices={devices} /></main>;
}
