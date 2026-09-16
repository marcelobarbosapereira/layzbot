# LazyBot web

Run commands from the repository root unless indicated otherwise.

## Local setup

1. Install Node.js, pnpm, and Docker Desktop (or a compatible Docker runtime), then start Docker.
2. Run `pnpm install` and `pnpm dlx supabase start`.
3. Copy the root `.env.example` to `apps/web/.env.local`. Set the public URL and publishable key reported by the local Supabase CLI. Never put a `service_role` key in these variables.
4. Run `pnpm dlx supabase db reset` to apply migrations to the disposable local database. This clears local database data.
5. Open local Supabase Studio at `http://127.0.0.1:54323` and create a test user under Authentication / Users. Use fabricated credentials only.
6. Run `pnpm --dir apps/web dev`, then sign in at `http://localhost:3000/login`.

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

The SQL tests run inside a transaction and use fabricated identities and documents. They require the local stack; the Vitest auth tests replace the external auth boundary and do not prove a live Supabase login.

See the [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client) for the cookie refresh flow.
