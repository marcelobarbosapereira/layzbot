import { signIn } from './actions';

const { signInWithPassword } = vi.hoisted(() => ({ signInWithPassword: vi.fn() }));
vi.mock('../../lib/supabase/server', () => ({
  createClient: async () => ({ auth: { signInWithPassword } }),
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));

beforeEach(() => vi.clearAllMocks());

it('rejects malformed credentials before sending an auth request', async () => {
  const form = new FormData();
  form.set('email', 'invalid');
  form.set('password', '');
  await expect(signIn(form)).rejects.toThrow('redirect:/login?error=invalid');
  expect(signInWithPassword).not.toHaveBeenCalled();
});

it('sends trimmed email and unmodified password then redirects on success', async () => {
  signInWithPassword.mockResolvedValue({ data: { user: { id: 'user' }, session: {} }, error: null });
  const form = new FormData();
  form.set('email', '  user@example.test  ');
  form.set('password', ' test password ');
  await expect(signIn(form)).rejects.toThrow('redirect:/');
  expect(signInWithPassword).toHaveBeenCalledWith({ email: 'user@example.test', password: ' test password ' });
});

it('shows a generic failure without leaking Supabase details', async () => {
  signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: new Error('internal auth detail') });
  const form = new FormData();
  form.set('email', 'user@example.test');
  form.set('password', 'invalid-password');
  await expect(signIn(form)).rejects.toThrow('redirect:/login?error=credentials');
});
