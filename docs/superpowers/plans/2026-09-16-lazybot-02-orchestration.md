# LazyBot Batch Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immutable batch confirmation, authenticated devices, atomic work claiming, live progress, and interruption-safe reassignment.

**Architecture:** Supabase owns durable state and atomic database functions. The Next.js app exposes narrowly scoped Route Handlers for agents and Server Actions for users; agents never receive a Supabase service key.

**Tech Stack:** Next.js App Router, TypeScript, Supabase Postgres/RLS/Realtime, Zod, Vitest, pgTAP, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-16-lazybot-automation-design.md`

## Global Constraints

- Complete Plan 1 and its completion gate first.
- Each task must fit one five-hour Codex window with at least one hour reserved for verification and checkpointing.
- All fiscal-effect states are durable before the next external action begins.
- A batch snapshot is immutable after confirmation.
- Two devices must never own the same batch item concurrently.
- Device credentials are revocable, hashed at rest, and never exposed to browser JavaScript.
- Finish every task with tests, `git diff --check`, `docs/progress.md`, and a commit.

## File Map

- `supabase/migrations/*_batches.sql`: batch, item, event, device, and lease schema.
- `supabase/tests/batches.test.sql`: atomicity, immutability, and RLS tests.
- `packages/contracts/src/batch.ts`: shared batch and event schemas.
- `packages/contracts/src/agent-api.ts`: versioned agent protocol.
- `apps/web/src/features/batches/`: review, confirmation, status, and retry UX.
- `apps/web/src/app/api/agent/v1/`: device-authenticated agent endpoints.
- `apps/web/src/lib/device-auth.ts`: token hashing and verification.

---

### Task 6: Immutable Batch Snapshot and Single Confirmation

**Files:**
- Create: `supabase/migrations/202609160004_batches.sql`
- Create: `supabase/tests/batches.test.sql`
- Create: `packages/contracts/src/batch.ts`
- Create: `packages/contracts/src/artifact.ts`
- Create: `apps/web/src/features/batches/actions.ts`
- Create: `apps/web/src/features/batches/review-dialog.tsx`
- Create: `apps/web/src/features/batches/review-dialog.test.tsx`

**Interfaces:**
- Consumes: validated `monthly_assessments` from Plan 1.
- Produces: `confirmBatch(input): BatchSummary`, tables `batches`, `batch_items`, and `artifacts`, plus RPC `confirm_batch`.

- [ ] **Step 1: Write failing database tests**

Assert that `confirm_batch` copies competence, revenue, activity, responsible, and taxpayer document into `batch_items`; edits to assessments after confirmation do not alter the snapshot; a second confirmation uses a different batch ID.

- [ ] **Step 2: Run the tests and observe the expected failure**

Run: `pnpm dlx supabase test db`

Expected: FAIL because batch tables and RPC are absent.

- [ ] **Step 3: Implement the transaction**

The migration creates `batches`, `batch_items`, and `artifacts`. `artifacts.batch_item_id` references the newly created item table and stores kind, object path, SHA-256, byte size, and creation time. The `confirm_batch` function must validate owner, selected device, selected assessment IDs, non-null revenue, and active profile, then insert the batch and snapshot items in one transaction. Return counts and total revenue as integer cents.

- [ ] **Step 4: Implement shared contracts and action**

Define:

```ts
export const confirmBatchInput = z.object({
  competence: z.string().regex(/^\d{4}-\d{2}$/),
  deviceId: z.string().uuid(),
  assessmentIds: z.array(z.string().uuid()).min(1),
});
```

The Server Action parses input, invokes the RPC, and returns field errors without creating partial data.

- [ ] **Step 5: Implement the single-confirmation dialog**

Show competence, company count, revenue total, responsibles, blocked rows, chosen device, and certificate availability. Preselect the last successfully used online device but require the device field to remain visible and editable. One `Confirmar e executar` action calls `confirmBatch` once and disables itself while pending.

- [ ] **Step 6: Verify and commit**

Run SQL tests, component tests, typecheck, build, and `git diff --check`. Update `docs/progress.md`, then commit:

```powershell
git add supabase packages/contracts apps/web docs/progress.md
git commit -m "feat: create immutable execution batches"
```

---

### Task 7: Device Enrollment, Revocation, and Heartbeat

**Files:**
- Create: `supabase/migrations/202609160005_devices.sql`
- Create: `supabase/tests/devices.test.sql`
- Create: `packages/contracts/src/agent-api.ts`
- Create: `apps/web/src/lib/device-auth.ts`
- Create: `apps/web/src/lib/device-auth.test.ts`
- Create: `apps/web/src/app/api/agent/v1/heartbeat/route.ts`
- Create: `apps/web/src/features/devices/actions.ts`
- Create: `apps/web/src/features/devices/device-list.tsx`

**Interfaces:**
- Consumes: authenticated owner from Plan 1.
- Produces: one-time enrollment token, long-lived device token, `POST /api/agent/v1/heartbeat`, online status, and revocation.

- [ ] **Step 1: Write failing token tests**

Test that raw tokens are never returned by database queries, hashes use SHA-256 with a server-side pepper, expired enrollment tokens fail, and revoked device tokens return HTTP 401.

- [ ] **Step 2: Run tests and observe the expected failure**

Run: `pnpm --dir apps/web test -- device-auth.test.ts`

Expected: FAIL because token functions are absent.

- [ ] **Step 3: Implement schema and token helpers**

Store `token_hash`, `owner_id`, `name`, `os`, `agent_version`, `last_seen_at`, and `revoked_at`. Implement:

```ts
export async function hashDeviceToken(raw: string): Promise<string>;
export async function authenticateDevice(request: Request): Promise<DevicePrincipal>;
```

Use constant-time comparison and reject absent, revoked, or mismatched tokens.

- [ ] **Step 4: Implement enrollment and heartbeat**

Enrollment displays the raw token once. Heartbeat accepts agent version, OS, certificate metadata, and capabilities; it updates only the authenticated device row.

- [ ] **Step 5: Implement device list**

Show name, OS, version, last signal, online/offline state, certificate count, and revoke action. Define online as a server-side comparison against the configured heartbeat threshold.

- [ ] **Step 6: Verify and commit**

Run database tests, unit tests, typecheck, build, and `git diff --check`. Update progress and commit:

```powershell
git add supabase packages/contracts apps/web docs/progress.md
git commit -m "feat: authenticate and monitor executor devices"
```

---

### Task 8: Atomic Item Claiming, Leases, and Events

**Files:**
- Create: `supabase/migrations/202609160006_job_leases.sql`
- Create: `supabase/tests/job_leases.test.sql`
- Create: `apps/web/src/app/api/agent/v1/jobs/claim/route.ts`
- Create: `apps/web/src/app/api/agent/v1/jobs/[itemId]/events/route.ts`
- Create: `apps/web/src/app/api/agent/v1/jobs/[itemId]/complete/route.ts`
- Create: `apps/web/src/app/api/agent/v1/jobs/[itemId]/interrupt/route.ts`

**Interfaces:**
- Consumes: authenticated device and confirmed batch.
- Produces: `claim_next_batch_item(device_id)`, renewable lease, append-only event endpoint, and terminal result endpoints.

- [ ] **Step 1: Write failing concurrency tests**

Open two SQL sessions or use concurrent promises to claim the same pending item. Assert exactly one claim succeeds. Test that a device cannot claim an item assigned to another device and that an expired lease becomes `interrupted`, not silently reassigned.

- [ ] **Step 2: Run tests and observe the expected failure**

Run: `pnpm dlx supabase test db`

Expected: FAIL because lease columns and RPC do not exist.

- [ ] **Step 3: Implement atomic claiming**

Use `for update skip locked` inside a security-definer function with explicit ownership checks. Return only the snapshot data needed by the agent. Set `lease_owner_device_id`, `lease_expires_at`, and state `authenticating` in the same transaction.

- [ ] **Step 4: Implement validated state transitions**

Create a database function that accepts expected current state, next state, sanitized message, and sequence number. Reject backward transitions, duplicate sequence numbers with different content, and events from a non-owner device.

- [ ] **Step 5: Implement Route Handlers**

Every handler calls `authenticateDevice`, parses the request with `agent-api.ts`, invokes one RPC, and returns stable error codes such as `DEVICE_REVOKED`, `LEASE_LOST`, or `INVALID_TRANSITION`.

- [ ] **Step 6: Verify and commit**

Run database concurrency tests, API unit tests, typecheck, build, and `git diff --check`. Update progress and commit:

```powershell
git add supabase apps/web docs/progress.md
git commit -m "feat: claim batch work atomically"
```

---

### Task 9: Realtime Progress, Intervention, and Explicit Reassignment

**Files:**
- Create: `apps/web/src/features/batches/batch-progress.tsx`
- Create: `apps/web/src/features/batches/batch-progress.test.tsx`
- Create: `apps/web/src/features/batches/queries.ts`
- Create: `apps/web/src/features/batches/reassign-action.ts`
- Create: `apps/web/src/app/(app)/execucoes/[batchId]/page.tsx`
- Create: `apps/web/e2e/batch-progress.spec.ts`

**Interfaces:**
- Consumes: batch events and leases from Task 8.
- Produces: live counts, item timeline, intervention messages, document links, and explicit reassignment of incomplete items.

- [ ] **Step 1: Write failing progress tests**

Test aggregation of `completed`, `needs_attention`, `failed`, and `interrupted`; verify a progress event updates the visible row; verify reassignment excludes `submitted`, `das_downloaded`, and `completed` items.

- [ ] **Step 2: Run tests and observe the expected failure**

Run: `pnpm --dir apps/web test -- batch-progress.test.tsx`

Expected: FAIL because the progress view does not exist.

- [ ] **Step 3: Implement initial server read and Realtime subscription**

Fetch batch and items in the Server Component, pass serializable data to the client progress component, and subscribe only to item/event rows for that batch. Reconcile every event by ID to avoid duplicate display.

- [ ] **Step 4: Implement explicit reassignment**

The Server Action verifies the current device is offline or revoked, selects only incomplete safe states, clears leases, assigns the chosen online device, and appends an audit event with user and timestamp.

- [ ] **Step 5: Add the end-to-end test**

Use an HTTP agent simulator to heartbeat, claim one item, emit progress, interrupt it, and verify the UI count and explicit reassignment flow.

- [ ] **Step 6: Verify the complete second plan**

Run:

```powershell
pnpm dlx supabase db reset
pnpm dlx supabase test db
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm --dir apps/web exec playwright test e2e/batch-progress.spec.ts
git diff --check
```

- [ ] **Step 7: Record and commit**

Update `docs/progress.md` with protocol version and the next plan path, then commit:

```powershell
git add apps/web docs/progress.md
git commit -m "feat: show and recover live batch execution"
```

## Plan Completion Gate

Before Plan 3, prove with automated tests that two simulated devices cannot claim one item, a revoked device cannot heartbeat, an interruption does not auto-transfer work, and the UI updates without refreshing.
