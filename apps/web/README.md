# LazyBot web

Run commands from the repository root unless indicated otherwise.

## Hosted Supabase setup

1. Use the hosted project `wfkvddqecvkxffdeikyw` in the Supabase dashboard.
2. Copy the root `.env.example` to `apps/web/.env.local` and fill the publishable key from Project Settings → API. Never put a `service_role` key in these variables.
3. Apply migrations through the hosted SQL Editor or an explicitly targeted Supabase migration command. Do not run `db reset` against the hosted project.
4. Create only fabricated homologation users and taxpayer data in the hosted project. Rollback-only pgTAP bundles must end with `ROLLBACK`; never use production taxpayer data in tests.
5. Configure `LAZYBOT_E2E_EMAIL` and `LAZYBOT_E2E_PASSWORD` with a fabricated hosted test user, then run `pnpm --dir apps/web dev` and sign in at `http://localhost:3000/login`.

The root route is inside the authenticated `(app)` layout. Server-side `getUser()` verifies identity; the Node.js proxy refreshes sessions and forwards cookie and cache headers. Future data mutations must also verify authentication and rely on database RLS; a layout alone does not authorize Server Actions.

## Checks

```powershell
pnpm dlx supabase test db
pnpm test
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

If route files have moved since the previous build, regenerate Next.js route types with `pnpm --dir apps/web exec next typegen` before running typecheck.

The SQL tests run inside a rollback-only transaction against the hosted project and use fabricated identities and documents. The Vitest auth tests replace the external auth boundary; the hosted Playwright scenario is the live login/persistence gate.

See the [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client) for the cookie refresh flow.
