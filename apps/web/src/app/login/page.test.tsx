import { render, screen } from '@testing-library/react';
import Login from './page';

vi.mock('../../features/auth/actions', () => ({ signIn: vi.fn() }));

it('provides labeled email and password fields for signing in', async () => {
  render(await Login({ searchParams: Promise.resolve({}) }));
  expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email');
  expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

it('renders a safe error message without reflecting URL input', async () => {
  render(await Login({ searchParams: Promise.resolve({ error: '<script>secret</script>' }) }));
  expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível entrar');
  expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
});
