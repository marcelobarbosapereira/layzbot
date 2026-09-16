import { render, screen } from '@testing-library/react';
import AppLayout from './layout';

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock('../../lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));

it('redirects missing sessions before rendering protected content', async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: null });
  await expect(AppLayout({ children: <p>Protected</p> })).rejects.toThrow('redirect:/login');
});

it('rejects a user when server-side authentication reports an error', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'user' } }, error: new Error('invalid token') });
  await expect(AppLayout({ children: <p>Protected</p> })).rejects.toThrow('redirect:/login');
});

it('renders content for a server-verified user', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'user' } }, error: null });
  render(await AppLayout({ children: <p>Protected</p> }));
  expect(screen.getByText('Protected')).toBeVisible();
});
