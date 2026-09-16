import { signIn } from '../../features/auth/actions';

export const runtime = 'nodejs';

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main>
      <h1>Entrar no LazyBot</h1>
      <form action={signIn}>
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <button type="submit">Entrar</button>
      </form>
      {error && <p role="alert">Não foi possível entrar. Confira seu e-mail e senha e tente novamente.</p>}
    </main>
  );
}
