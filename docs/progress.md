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

## 2026-09-17 — Web/data plan, Task 3 completed

- Completed plan task: `docs/superpowers/plans/2026-09-16-lazybot-01-web-data.md`, Task 3 — Private Document Storage and Access Policies.
- Initial atomic step: wrote `supabase/tests/storage_policies.test.sql` before any Task 3 production code. Its first form had 16 transactional pgTAP assertions, including two direct DELETE checks; all identifiers were fabricated and the script ended with `ROLLBACK`. The compatibility correction to the final 14-assertion form is recorded below.
- Focused local RED command: `pnpm dlx supabase test db supabase/tests/storage_policies.test.sql`. It failed before executing assertions with `ECONNREFUSED 127.0.0.1:54322`; Docker is absent and Podman has no machine because WSL is unavailable. This infrastructure failure is not claimed as RED.
- Baseline application verification passed before the task: `pnpm test` (15/15 tests in 6 files). The Task 3 implementer also ran `git diff --check` successfully after adding the SQL test.
- Independent Task 2 review is now complete: spec compliant and task quality approved, with no Critical or Important findings. A minor suggestion to add positive owner UPDATE/DELETE database coverage is deferred to final branch review.
- First remote RED attempt was invalid: SQLSTATE `42501` came from `storage.protect_delete()` because current Supabase Storage forbids direct deletion from internal Storage tables even inside this test. This was a test-shape incompatibility, not the expected missing-bucket/policy RED.
- Corrected the test before any production code by removing the two direct DELETE assertions and changing the plan from 16 to 14. SELECT, INSERT, and UPDATE still behaviorally cover owner-prefix and bucket isolation. Static assertion count and `git diff --check` pass.
- Corrected remote RED passed its gate in the dedicated empty Supabase project: pgTAP `finish()` reported `# Looks like you failed 9 tests of 14`, specifically before the Task 3 bucket and policies exist. A separate read-only rollback check returned `fiscal_bucket_exists=false`, `control_bucket_exists=false`, and `test_object_count=0`; no test schema/data remained.
- TypeScript TDD completed locally: `storage-path.test.ts` first failed with `Cannot find module './storage-path'`; after the minimal Zod UUID helper, the focused suite passed 3/3 tests. The contracts package now runs this suite through the workspace test command.
- Implemented `202609160002_storage.sql`: private `fiscal-documents` bucket plus authenticated owner-scoped SELECT, INSERT, UPDATE, and DELETE policies. Every policy restricts the bucket and first path segment to `auth.uid()`; UPDATE has both `USING` and `WITH CHECK`. No artifact metadata was added.
- Local verification passed: `pnpm test` (18/18 tests across 7 files), `pnpm lint`, `pnpm typecheck`, `pnpm build`, static 14-assertion/4-policy inspection, and `git diff --check`.
- Required local database commands remain infrastructure-blocked: `pnpm dlx supabase db reset` cannot connect to the Podman Linux VM, and `pnpm dlx supabase test db` returns `ECONNREFUSED 127.0.0.1:54322`. Neither is claimed as SQL GREEN.
- Remote SQL GREEN passed on the dedicated disposable project: pgTAP reached `ok 14 - owner cannot update foreign-prefix or foreign-bucket objects`, `finish()` returned no failure summary, and no PostgreSQL error occurred. After `ROLLBACK`, the read-only check returned `fiscal_bucket_exists=false`, `control_bucket_exists=false`, and `test_object_count=0`; no migration or fabricated test state remained.
- Final review found no Critical or Important issues. Task 3 is committed as `feat: secure fiscal document storage`; no push, deployment, permanent remote change, service-role key use, taxpayer data, artifact metadata, or fiscal transmission occurred.
- Next incomplete plan task: Task 4 — Read-Only Excel Import Preview and Commit.

## 2026-09-17 — Web/data plan, Task 4 completed

- Implemented the read-only Excel import path: sanitized six-sheet XLSX fixtures, deterministic in-memory ExcelJS parsing, CPF/CNPJ/NIT and obligation-specific validation, preview errors with exact source location/reason, server-side preview tokens, a two-step import UI, and a token-only commit Server Action.
- The two fixtures were authored and re-opened with the bundled `@oai/artifact-tool` runtime and contain fabricated identifiers only. A minimal XML namespace canonicalization was required after export for ExcelJS 4.4 compatibility; source workbook bytes are never written by application code, and no inspection/render support files are included in the task changes.
- App TDD evidence: the parser suite first failed because `parse-workbook` did not exist; action/UI suites first failed because their modules did not exist. The final workspace run passes 26 tests across 10 files, including source-byte immutability, Simples `Valor` to exact cents, document deduplication without lost obligations, invalid-row preservation, and a commit action that ignores client-supplied rows and calls only `commit_import` with the preview token.
- Database TDD evidence: `supabase/tests/import_commit.test.sql` was written before `202609160003_import.sql`. The local focused command, `pnpm dlx supabase test db supabase/tests/import_commit.test.sql`, and local database lint both fail before inspection/assertions with `ECONNREFUSED 127.0.0.1:54322` because no Docker, Podman/WSL, or local Supabase database is available. These infrastructure failures are not claimed as SQL RED, SQL GREEN, or a successful database lint.
- The 31-assertion pgTAP suite covers RLS/privileges, owner and expiry checks, valid deduplicating UPSERTs, multiple obligations, exact Simples revenue cents, one-time token consumption, and a forced invalid child row that must roll back all earlier writes and preserve the preview. Static inspection reports 31 planned and 31 assertion calls; this is not a substitute for PostgreSQL execution.
- Fresh application verification passed with repository-compatible Corepack pnpm 10: `corepack pnpm -r test` (26/26), `corepack pnpm -r lint`, `corepack pnpm -r typecheck`, and `corepack pnpm -r build` (including dynamic `/import`). The bare `pnpm` shim attempted an interactive modules-store purge and exited before tests because it resolved a different pnpm store version; it did not produce a test failure.
- The first remote transactional attempt stopped before pgTAP assertions with SQLSTATE `23514`: the expired-preview test fixture set `expires_at` in the past while leaving `created_at` at its current-time default. Production SQL remains unchanged; the fixture now supplies a historically earlier `created_at` so the row is valid but expired.
- A second remote run exposed one test-only catalog expectation mismatch: PostgreSQL reports the pinned setting as `search_path=""`; the assertion now checks that exact value.
- Final rollback-only remote validation passed pgTAP plan `1..31` with every assertion `ok`, zero `not ok` results, clean `finish()`, and final `ROLLBACK`. The cleanup query returned `import_previews_removed=true`, `commit_import_removed=true`, and `fabricated_users_removed=true`.
- Fresh local verification passed after the final test correction: focused import suites 11/11, workspace tests 26/26, lint, typecheck, build, `git diff --check`, secret scan, and static pgTAP count 31/31. Local Supabase remains unavailable with `ECONNREFUSED 127.0.0.1:54322`; remote verification used a dedicated disposable project and left no permanent state.
- Task 4 is committed as `eb0f66f` (`feat: import LazyBot workbook with preview`). The next incomplete plan task is Task 5.

## 2026-09-17 — Web/data plan, Task 5 completed with infrastructure limitations

- Implemented the monthly Simples workspace at `/simples`: competence creation, owner-scoped reads, optimistic versioned assessment updates, Brazilian revenue parsing, company/status filters, row selection, CNPJ masking with explicit reveal, visible-row tabular paste, and the required obligation tabs with non-MVP notices.
- TDD RED evidence: the component suite first failed because `assessment-grid` did not exist; the action suite first failed because `actions` did not exist; the query suite first failed because `queries` did not exist. After implementation, the focused assessment run passes 16/16 tests across 3 files.
- `createCompetence` reads only active Simples obligations, active taxpayers, and existing Simples profiles, then performs an idempotent upsert with `ignoreDuplicates: true` and explicit zero revenue. It never reads or copies a prior competence's revenue.
- `updateAssessment` validates UUIDs and positive row version, parses pt-BR revenue into exact integer cents, requires an owner-visible profile, binds the assessment to the profile taxpayer, and predicates the update on the current version. A zero-row mutation returns the explicit conflict message.
- Fresh application checks pass with the repository-compatible Corepack pnpm 10 invocation: focused tests 16/16, workspace tests 42/42 (39 web + 3 contracts), lint, typecheck, build (including dynamic `/simples`), and `git diff --check`.
- The Playwright scenario is implemented and covers local sign-in, creation of two competences, two revenue edits, reload persistence, and preservation of the prior competence. Without `LAZYBOT_E2E_EMAIL` and `LAZYBOT_E2E_PASSWORD`, the fresh run reported 1 skipped; no live browser/auth persistence is claimed.
- Review fix: the grid now exposes `Salvando…`/`Salvo` around the asynchronous mutation, and the Playwright scenario waits for two server-confirmed `Salvo` states before reloading. The scoped re-review marked the race addressed with no new Critical or Important findings.
- The hosted project is now the database reference. Rollback-only remote pgTAP bundles are the required SQL gate; `db reset` is not used against the hosted project. The local Docker/Supabase CLI is optional and no longer blocks completion.
- All identifiers in tests are fabricated. No secrets, deployment, push, permanent remote change, or fiscal transmission occurred.
- Exact next step: configure a fabricated hosted test user in `LAZYBOT_E2E_EMAIL`/`LAZYBOT_E2E_PASSWORD`, start the web app with the hosted project URL/key, and run `corepack pnpm --dir apps/web exec playwright test e2e/monthly-assessments.spec.ts`. After that hosted live gate, continue with `docs/superpowers/plans/2026-09-16-lazybot-02-orchestration.md`.

## 2026-09-17 — Scope ruling: hosted Supabase homologation

- The project scope now treats Supabase as the hosted project `wfkvddqecvkxffdeikyw` (`https://wfkvddqecvkxffdeikyw.supabase.co`), not as a required local Docker service.
- Hosted SQL validation must use fabricated identities/data and rollback-only transactions. `db reset` is explicitly prohibited against the hosted project unless separately authorized.
- The hosted project is the target for live Auth/Playwright verification; local Supabase remains optional tooling rather than a completion blocker.
- Updated `.env.example`, `apps/web/README.md`, and the Plan 1 completion gate to reflect this scope. No hosted migration or persistent data change was performed by this documentation/configuration change.
- Hosted reference check (read-only, 2026-09-17): `current_database=postgres`, `current_user=postgres`, and `responsibles_present=false`, `assessments_present=false`, `import_previews_present=false`, `commit_rpc_present=false`, `fiscal_bucket_present=false`. The empty state confirms prior remote validation transactions left no persistent test state.

## 2026-09-17 — Orchestration plan, Task 6 completed

- Implemented Task 6 of `docs/superpowers/plans/2026-09-16-lazybot-02-orchestration.md`: immutable batch and item snapshots, artifact metadata with composite owner/item foreign key, owner-scoped read access, restricted atomic confirmation RPC, shared contracts, Server Action and single-confirmation review dialog.
- Confirmation validates owner, a non-revoked device online within 90 seconds, distinct selected IDs, competence, safe integer revenue cents, active taxpayer/responsible/Simples obligation and existing profile. Source rows are locked while copying the snapshot. Later source edits do not modify confirmed values; client writes are denied and database triggers protect snapshot fields.
- Task dependency ruling: introduced only the minimal `devices` identity/read schema required by confirmation. Task 7 must extend it for enrollment, tokens and heartbeat; no token/secret fields or behavior are included now.
- Integration ruling: the review dialog remains reusable and unmounted until Task 7 supplies live device/certificate metadata and connects it to `/simples`. Online status, certificate availability and last successful device usage are typed inputs at this boundary. No execution agent or fiscal transmission is provided by Task 6.
- TDD evidence: SQL tests preceded the migration. The local Supabase CLI command failed with pnpm cache `ENOENT` before contacting a database. The controller's rollback-only hosted RED bundle failed with SQLSTATE `42P01`, missing `public.devices` at fixture insertion before assertions. App RED failed on missing action/dialog modules; subsequent focused tests passed 10/10.
- First hosted GREEN attempt reported `42P01 relation confirmed does not exist`; changed the test's temporary result storage to a transaction-local setting. The controller's final hosted rerun passed all 19/19 pgTAP assertions, and the subsequent cleanup query returned all six checks true, confirming rollback of the bundle.
- Fresh local verification passed: workspace 53 tests (50 web, 3 contracts), lint, typecheck, production build and `git diff --check`. Hosted SQL verifies database behavior with fabricated fixtures; live authenticated browser/device operation remains unverified and deferred to the integration boundary. No hosted reset, persistent migration/data, push, deployment or fiscal transmission occurred.
- Commit: `feat: create immutable execution batches` (SHA recorded in the SDD report). Next incomplete plan task: Task 7 — authenticated devices and heartbeat, including the explicit UI integration boundary above.
- Task-scoped review correction: automatic device selection now requires both online state and a non-null last successful execution timestamp. If no device qualifies, the field remains blank until explicitly selected. Regression RED reproduced two incorrect defaults; focused GREEN passed 11/11. The minor review suggestion to distinguish each SQL `22023` validation cause in field errors remains deferred; the transaction currently returns a general selection/device validation message.
- Review-fix verification passed: workspace 54 tests (51 web, 3 contracts), lint, typecheck, build and `git diff --check`. Database code is unchanged; the previous hosted 19/19 SQL gate remains applicable.

## 2026-09-18 — Orchestration plan, Task 7 completed

- Implemented device enrollment, revocable long-lived authentication and heartbeat monitoring. One-time enrollment and device tokens use SHA-256 with the server-only `DEVICE_TOKEN_PEPPER`; PostgreSQL receives only hashes, and ordinary owner queries cannot select `devices.token_hash`.
- Extended the Task 6 device foundation with OS, agent version and capabilities; added one-time enrollment rows and owner-scoped certificate metadata. Enrollment redemption is atomic, expired/consumed tokens fail, heartbeat updates only the authenticated active device, and revoked devices receive HTTP 401.
- Added versioned `/api/agent/v1/enroll` and `/api/agent/v1/heartbeat` Route Handlers, shared Zod contracts, owner Server Actions, configured server-side online calculation, a device list with last signal/certificate count, one-time enrollment display and revocation.
- Security checks: exposed tables use RLS and explicit grants; security-definer functions use an empty search path and restricted execute grants. No service-role or secret Supabase key was added or used. Current Supabase RLS/function guidance and relevant 2026 changelog changes were checked.
- TDD evidence from the active task: SQL and token tests preceded implementation. The finishing pass added explicit coverage for absent and mismatched bearer tokens; because the required behavior was already present, these additional tests were GREEN immediately and are not claimed as a new RED/GREEN production change.
- Hosted rollback-only SQL validation passed on `wfkvddqecvkxffdeikyw`: pgTAP reached final row `ok 19` with no reported failure. The transaction rolled back, and all six cleanup checks returned true, confirming no schema, function, fabricated identity or device data remained.
- Fresh local verification: focused device suites 13/13; workspace tests 67/67 (64 web, 3 contracts); lint, typecheck, production build and `git diff --check` passed. Static pgTAP inspection found 19 planned assertions and 19 assertion calls; the secret scan found no private keys, service-role/secret keys, JWT-shaped credentials or credential-bearing database URLs.
- No hosted reset, persistent migration/data, push, deployment, fiscal transmission or service-role use occurred.
- Commit to be created after controller inspection: `feat: authenticate and monitor executor devices`.
- Next incomplete plan task: Task 8 — Atomic Item Claiming, Leases, and Events.

## 2026-09-18 — Orchestration plan, Task 8 completed

- Implemented atomic assigned-device claiming with `FOR UPDATE SKIP LOCKED`, 90-second renewable leases, terminal lease expiration, append-only ordered events, idempotent replay, validated execution-state transitions, and versioned claim/event/complete/interrupt Route Handlers.
- Hardened the Data API boundary beyond UUID-only identification: claim and event RPCs require the server-peppered device token hash, validate the active device and composite owner relationship, use security-definer functions with an empty search path, and expose no raw token or service-role credential.
- TDD evidence: four route suites first failed because their production modules did not exist, then passed 6/6. SQL tests preceded the migration. The first hosted run exposed a fabricated-fixture uniqueness conflict; using a second fabricated taxpayer corrected the test without weakening production constraints.
- Hosted rollback-only validation on `wfkvddqecvkxffdeikyw` passed pgTAP 29/29. Cleanup checks confirmed the event table, all lease columns, both RPCs, and fabricated users were absent after rollback.
- Local Supabase execution remains unavailable. The hosted SQL Editor cannot run two independent connections inside one outer rollback transaction, so simultaneous-session stress is not claimed; the suite exercises competing claims sequentially and verifies exactly one claim, while the function implements the atomic locking statement directly.
- Fresh final local verification passed: workspace tests 73/73 (70 web, 3 contracts), lint, typecheck, production build, `git diff --check`, and static pgTAP count 29/29. No hosted reset, permanent migration/data, service-role use, push, deployment, or fiscal transmission occurred.
- Next incomplete plan task: Task 9 — Realtime Progress, Intervention, and Explicit Reassignment.

## 2026-09-21 — Orchestration plan, Task 9 completed

- Added `/execucoes/[batchId]` with owner-scoped server reads, item status totals, ordered timeline, intervention message, recommended manual check, and signed links to owner-authorized documents. Realtime subscriptions filter both item updates and events by batch ID; event IDs are reconciled to avoid duplicate display.
- Added explicit owner Server Action and narrow migration `202609160007_reassignment.sql`. The RPC requires an online target, moves only `pending`, `interrupted`, `failed`, or `needs_attention` items whose current device is offline or revoked, clears leases, preserves submitted/DAS/completed items, and writes a timestamped user audit event in the same transaction. Per-item assignment overrides keep the original batch assignment for existing records.
- Extended the agent protocol to emit terminal `needs_attention` and `failed` states. Claim responses expose `nextSequence` so a reassigned agent continues after the audit event. Event rows carry batch ID for scoped Realtime delivery; both tables are added to the Realtime publication.
- TDD evidence: progress component tests first failed on missing module; later intervention test failed on missing notice. Contract tests for terminal states failed on schema rejection before implementation. SQL pgTAP test preceded migration; no local database RED is claimed because the hosted project is the database reference and local Docker is unavailable.
- Hosted rollback-only validation on project `wfkvddqecvkxffdeikyw`: pgTAP 19/19, followed by all cleanup checks true for new columns/RPC and fabricated users. No schema or fabricated data remained applied.
- Playwright scenario uses an HTTP agent simulator for heartbeat, claim, progress, interruption, and explicit reassignment; it skips unless fabricated hosted credentials, disposable batch/device tokens, and mutation opt-in are present. The live browser flow was not exercised in this checkpoint.
- Fresh local verification: 79/79 workspace tests (74 web, 5 contracts), lint, typecheck, production build including dynamic `/execucoes/[batchId]`, `git diff --check`, and static pgTAP count 19/19 passed. Playwright reported 1 skipped under the absent opt-in fixture credentials.
- No service-role key, hosted reset, persistent hosted migration, deployment, push, or fiscal transmission occurred. Protocol remains `/api/agent/v1`; the next plan is `docs/superpowers/plans/2026-09-16-lazybot-03-agents-certificates.md`.

### Task 9 whole-branch review fixes

- Migration 007 now drops and recreates the append-only event trigger within the same migration transaction while backfilling `batch_id`; a hosted upgrade fixture with a preexisting event validates the backfill and restored trigger.
- Explicit reassignment terminalizes expired active leases from offline/revoked source devices before selecting safe items. It still excludes `submitted`, `das_downloaded`, and `completed`; the expanded pgTAP suite covers both recovery and fiscal-effect preservation.
- Mounted device enrollment/revocation at `/dispositivos` and batch review from selected `/simples` rows, with homepage navigation to `/simples` and a link from successful confirmation to `/execucoes/[batchId]`. Device choice uses current certificate availability and last completed event.
- Realtime progress now reconciles owner-scoped rows on subscribe/reconnect, merges by event ID, ignores stale overlapping snapshots, and refreshes device availability. The Playwright simulator waits for the source to go offline, then heartbeats the target immediately before selecting it.
- Hosted rollback-only upgrade bundle passed pgTAP 22/22; `existing_event_backfilled=true` and `append_only_trigger_enabled=true`. Cleanup removed fabricated users `091`, `092`, `099` and migration objects after rollback. Fresh local checks passed: 83/83 workspace tests (78 web, 5 contracts), lint, typecheck and production build. Live Playwright remains skipped without disposable hosted credentials and explicit mutation opt-in.

## 2026-09-21 — Plan 3 Tasks 10–13

- Task 10 added the cross-platform executor runtime, typed HTTP client, configuration validation, lease-aware heartbeat/claim loop, and simulated adapter. Task 11 added injectable Windows DPAPI/Linux Secret Service providers and a user-only certificate registry. Task 12 added disposable mTLS fixtures, Playwright PFX options, zeroization, and an allowlisted TLS probe. These tasks have no real fiscal or certificate effects.
- Task 13 added secure injectable enrollment and run commands, platform packaging scripts/artifacts, and [agent installation instructions](agent-installation.md). Enrollment exchanges a one-time token once, stores only the returned device token through `SecretProvider`, and excludes credentials from `agent.json`, logs, and command arguments.
- Task 13 verification: agent tests 25 passed / 1 skipped, workspace tests passed, lint/typecheck/build passed, secret scan and `git diff --check` passed. Windows/Arch installation and enrollment are unavailable on this host; no platform success claim is made.
- Task 13 review fixes corrected Windows root traversal, added package launchers consistent with the scheduler/systemd artifacts, hid enrollment-token input, and converted the packaged Windows XML to UTF-16 with BOM. A package smoke check confirmed the launcher and `FF FE` BOM; no platform installation claim was added.
- Task 13 review fixes round 2 aligned the generated `dist/` launcher layout with Windows/XML and Arch/systemd, included the `zod` and shared-contract runtime trees in both packages, and updated the Arch installation commands to `~/.local/share/lazybot-agent/lazybot-agent`. Packaging regression tests passed; no platform installation claim was added.
- Task 13 review fixes round 3 compile the shared contracts to standalone NodeNext JavaScript in each package, add a clean Windows launcher smoke test (skipped where PowerShell packaging is unavailable), and align Arch instructions with the default `apps/agent/dist/package-arch` output. No platform installation claim was added.
- Task 13 review fixes round 3 completed the standalone contract compilation through temporary staging, with the package launcher smoke test executing successfully and the expected invalid-command response. No platform installation claim was added.
- Task 13 final review fixes include the Node `playwright` runtime package, real `probe` CLI dispatcher wiring with regression coverage, and active-execution heartbeats in the agent runtime with ordered lease events. No platform installation claim was added.
- Task 13 final review fix round 2 adds `playwright-core` and configures `PLAYWRIGHT_BROWSERS_PATH` to the packaged browser cache in both launchers. No platform installation claim was added.

## 2026-09-21 — checkpoint before Plan 3 Task 10

- Plan 2 Task 9 is complete and committed in `a701fd4` plus review-fix commit `a33819d`; the whole-branch review found no remaining Critical or Important findings.
- Task 10 was intentionally deferred to the next five-hour window at the user's request. Partial uncommitted agent-runtime files are preserved in the local stash `wip: pause task 10 agent runtime for next window`; they were not included in a success commit.
- Exact next step: restore the stash, finish Task 10 with independent tests/review, then commit `feat: add cross-platform executor runtime` only after verification.

## 2026-09-22 — PGDAS automation plan, Task 14

- Added a strict allow-listed PGDAS state machine with terminal/retry classification and an explicit immutable snapshot guard before any transmission boundary.
- Added `PgdasAdapter` and a deterministic fixture-only HTTP portal. The adapter reads sanitized certificate, representative, competence, declaration, revenue, calculation, and confirmation pages, then stops before submission; it never POSTs, transmits, downloads fiscal documents, or uses real certificates.
- Added sanitized HTML fixtures for success, receipt/DAS placeholders, CAPTCHA, missing authorization, and maintenance outcomes, plus tests proving the state rules and read-only adapter behavior.
- Verification: focused PGDAS tests 36 passed / 1 skipped; agent typecheck and build passed; `git diff --check` passed. No Supabase mutation, portal access, fiscal transmission, or push occurred.
- Next incomplete plan task: Task 15 — authentication, identity, and representative selection page objects.

### Task 14 review fixes

- Every fixture GET now has a preceding checkpoint event carrying the current state and read intent; regression coverage proves event-before-GET ordering.
- Adapter tests cover CAPTCHA, maintenance, and missing authorization, all stopping before any external side effect.
- `failed` and `interrupted` have an explicit `-> authenticating` re-entry transition, so retryability cannot silently dead-end at a terminal state.
