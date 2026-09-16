# LazyBot progress

## 2026-09-16 — Web/data plan, Task 1

- Completed: Workspace and Executable Web Shell.
- Added the pnpm workspace, the Next.js App Router shell, Vitest with Testing Library, and `@lazybot/contracts`.
- TDD evidence: `page.test.tsx` first failed because the generated Next.js page had no `LazyBot` heading; it passed after the minimal page implementation.
- Verification passed: `pnpm install`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.
- Next incomplete plan task: Task 2.

## 2026-09-16 — Web/data plan, Task 2 (historical blocked checkpoint; resolved below)

- Active plan: `docs/superpowers/plans/2026-09-16-lazybot-01-web-data.md`.
- Base commit: `bd0feb0` (`chore: scaffold LazyBot workspace`). Work is isolated in `.worktrees/web-data-foundation`.
- Implemented: local Supabase config; five core tables with owner/parent RLS, composite ownership foreign keys, document/obligation enums, timestamps, uniqueness, and assessment `version`; shared taxpayer/responsible contracts; Supabase browser/server clients; login action/page; authenticated home/layout; Node.js session-refresh proxy.
- Added a 40-assertion pgTAP test **before** the migration. It exercises authenticated insertion, tenant isolation on all tables, spoofed owners, foreign parent insertion/reassignment, duplicate prevention, initial version, and anonymous reads.
- SQL TDD is **not verified**. Before the migration, `pnpm dlx supabase start` failed with `LegacyDockerLifecycleInspectError`: Docker and Podman are not installed/on PATH. `pnpm dlx supabase test db` failed with `ECONNREFUSED 127.0.0.1:54322`. These are infrastructure failures, not the expected RED failure for missing tables. No SQL RED or GREEN is claimed.
- App TDD evidence: contracts first failed because validation exports did not exist; auth/layout/login suites first failed because their modules did not exist; proxy test first failed because the proxy module did not exist. After implementation, all 15 application tests pass (6 files).
- Passed: `pnpm test` (15/15), `pnpm lint`, `pnpm typecheck`, `pnpm build`, `git diff --check`. The first typecheck encountered stale generated Next route types after moving home into `(app)`; the successful build regenerated these and the subsequent typecheck passed.
- Still blocked: `pnpm dlx supabase db reset` (`LegacyLocalDbRunningError: failed to inspect service`), SQL test execution, and live Supabase login/session verification. The application tests use a fake external auth boundary; they do not establish a live login.
- Static database inspection: pgTAP declares 40 assertions and contains 40 assertion calls; all five exposed tables enable RLS and explicitly scope mutations to authenticated owners and owned parents. This is not a substitute for running PostgreSQL.
- No commit created. `AGENTS.md` requires: “Commit only when the repository is coherent and the recorded checks pass. Never create a success commit for broken or partial behavior.” SQL checks are mandatory and remain unverified. No push, deployment, or fiscal transmission occurred.
- Files: `supabase/{config.toml,.gitignore,migrations/202609160001_core.sql,tests/core_schema.test.sql}`, `packages/contracts/{package.json,src/index.ts,src/taxpayer.ts}`, `apps/web/{package.json,README.md,src/lib/supabase/*,src/features/auth/*,src/app/(app)/*,src/app/login/*,src/proxy.ts,src/proxy.test.ts}`, `.env.example`, and `pnpm-lock.yaml`. Original root/web `.gitignore` files are unchanged.
- Exact resume point: Task 2 Step 3 (database RED evidence), then Step 7 database/live-auth verification and Step 8 review/commit. The next plan task after verified completion is Task 3, Private Document Storage and Access Policies; do not start it yet.
- Next command after Docker is installed and running: `pnpm dlx supabase start`. Before the first start, temporarily park the new core migration outside `supabase/migrations` to obtain the missing-table RED evidence against a fresh disposable local database; restore the migration, run `pnpm dlx supabase db reset`, then `pnpm dlx supabase test db`. Do not reset any non-disposable database. Follow `apps/web/README.md` for public environment variables and a fabricated local test user, verify login/session refresh, rerun the application checks, review, and commit with `feat: add authenticated taxpayer data model` only after the required checks pass.

## 2026-09-16 — Web/data plan, Task 2 completed

- Completed implementation: Supabase Auth and Core Taxpayer Schema. The controller accepted transactional validation on the dedicated remote Supabase project in place of the unavailable local Docker stack and authorized the planned commit.
- Remote database evidence supplied by the controller: migration plus pgTAP suite ran within one transaction; output `1..40`, zero `not ok` results, clean `finish()`, and final assertion `ok 40 - anonymous cannot read assessments`. After `ROLLBACK`, `list_tables(public)` returned `[]`. No schema or fabricated test data was left permanently applied.
- Fixes found through remote execution: enable pgTAP in `extensions` inside the test transaction and set a local search path; use a numeric five-table RLS assertion to avoid indeterminate collation; use `[0-9]` in both SQL document checks for transport portability. Test plan remains 40/40.
- Fresh local checks passed before commit: `pnpm test` (15 tests / 6 files), `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.
- Inspected tracked/untracked changes and scanned for private keys, Supabase secret tokens, JWT-shaped tokens, and credential-bearing database URLs; none found. Tests contain fabricated identities/documents, and `.env.example` has an empty public-key placeholder. Existing secret exclusions remain intact.
- TDD limitation remains explicit: initial missing-table SQL RED was not observed because Docker was unavailable; subsequent remote test failures were reproduced and fixed before the final 40/40 GREEN run. Live browser login/session-refresh against Supabase has not been exercised; auth behavior is covered with a substituted external boundary in Vitest. End-to-end auth remains part of the Task 5 gate.
- Commit message: `feat: add authenticated taxpayer data model`. The SDD report/ledger records the resulting SHA.
- Next incomplete task: Task 3 — Private Document Storage and Access Policies, in `docs/superpowers/plans/2026-09-16-lazybot-01-web-data.md`. No push, deployment, permanent remote migration, or fiscal transmission occurred.
