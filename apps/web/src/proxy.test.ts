// @vitest-environment node
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: unknown) => ({
    auth: { getUser: () => refresh(options) },
  }),
}));

it('passes refreshed cookies to rendering and the browser with private cache headers', async () => {
  refresh.mockImplementation(({ cookies }) => {
    expect(cookies.getAll()).toEqual([{ name: 'session', value: 'expired' }]);
    cookies.setAll([{ name: 'session', value: 'refreshed', options: { path: '/', httpOnly: true } }], {
      'Cache-Control': 'private, no-store', Pragma: 'no-cache', Expires: '0',
    });
    return { data: { user: { id: 'user' } }, error: null };
  });
  const request = new NextRequest('http://localhost:3000/', { headers: { cookie: 'session=expired' } });
  const response = await proxy(request);
  expect(request.cookies.get('session')?.value).toBe('refreshed');
  expect(response.cookies.get('session')?.value).toBe('refreshed');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('pragma')).toBe('no-cache');
  expect(response.headers.get('x-middleware-request-cookie')).toContain('session=refreshed');
});
