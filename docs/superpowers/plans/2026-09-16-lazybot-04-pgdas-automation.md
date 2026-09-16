# LazyBot PGDAS-D Automation and Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate one-activity PGDAS-D declarations safely, download and validate DAS/receipts, survive interruption, and complete an accompanied production homologation.

**Architecture:** A PGDAS-D adapter implements the agent's portal interface behind page objects and a strict state machine. Most behavior is tested against sanitized local fixtures; real-portal checkpoints are explicit, visible, and stop before fiscal effects until the user authorizes the accompanied transmission.

**Tech Stack:** Node.js, TypeScript, Playwright, PDF.js, Zod, Vitest, Supabase Storage signed uploads.

**Spec:** `docs/superpowers/specs/2026-09-16-lazybot-automation-design.md`

## Global Constraints

- Complete Plans 1 through 3 first.
- Each task must fit one five-hour window with at least one hour for verification and checkpointing.
- Real portal tests always use a visible browser.
- No production transmission occurs in automated tests.
- The first real transmission requires the user's live review and explicit authorization outside the test suite.
- Before every possible retransmission, query the remote state and reconcile it with durable local state.
- Sanitize screenshots, logs, traces, HAR files, and error messages before persistence.
- One taxpayer failure never stops unrelated batch items.
- Finish every task with tests, evidence, `docs/progress.md`, and a commit.

## File Map

- `apps/agent/src/adapters/pgdas/adapter.ts`: workflow coordinator.
- `apps/agent/src/adapters/pgdas/pages/`: focused page objects.
- `apps/agent/src/adapters/pgdas/state.ts`: permitted states and checkpoints.
- `apps/agent/src/adapters/pgdas/fixtures/`: sanitized HTML fixture pages.
- `apps/agent/src/documents/`: download, PDF validation, hashing, and local mirror.
- `apps/web/src/app/api/agent/v1/artifacts/`: signed upload workflow.
- `docs/runbooks/pgdas-homologation.md`: real-portal checklist and rollback rules.
- `docs/runbooks/pgdas-incidents.md`: operational recovery.

---

### Task 14: PGDAS Adapter Contract, State Machine, and Fixture Portal

**Files:**
- Create: `apps/agent/src/adapters/pgdas/adapter.ts`
- Create: `apps/agent/src/adapters/pgdas/state.ts`
- Create: `apps/agent/src/adapters/pgdas/state.test.ts`
- Create: `apps/agent/src/adapters/pgdas/fixture-server.ts`
- Create: `apps/agent/src/adapters/pgdas/fixtures/*.html`

**Interfaces:**
- Consumes: `PortalAdapter`, batch item snapshot, and reporter from Plan 3.
- Produces: `PgdasAdapter.execute(job, reporter)` and validated transitions through `completed`.

- [ ] **Step 1: Write failing state tests**

Assert the permitted sequence and explicitly reject `calculated -> completed`, `submitted -> assessment_filled`, and any attempt to transmit from an unconfirmed snapshot.

```ts
expect(() => transition('calculated', 'submitted')).not.toThrow();
expect(() => transition('submitted', 'assessment_filled')).toThrow('INVALID_TRANSITION');
```

- [ ] **Step 2: Run the test and observe the expected failure**

Run: `pnpm --dir apps/agent test -- state.test.ts`

Expected: FAIL because the state machine is absent.

- [ ] **Step 3: Implement explicit transitions and checkpoints**

Define every state from the spec, terminal states, and whether a state is safe to retry automatically. Persist an event before starting the next external action.

- [ ] **Step 4: Build the sanitized fixture portal**

Create deterministic pages for certificate accepted, representative selection, competence selection, existing declaration, revenue entry, calculation, confirmation, receipt, DAS, CAPTCHA, missing authorization, and maintenance.

- [ ] **Step 5: Implement the adapter skeleton**

Use dependency-injected page objects and base URL. The skeleton traverses fixtures and reports states but does not yet submit.

- [ ] **Step 6: Verify and commit**

Run agent tests, typecheck, build, and `git diff --check`. Update progress and commit:

```powershell
git add apps/agent docs/progress.md
git commit -m "feat: define PGDAS workflow state machine"
```

---

### Task 15: Authentication, Identity, and Representative Selection

**Files:**
- Create: `apps/agent/src/adapters/pgdas/pages/login-page.ts`
- Create: `apps/agent/src/adapters/pgdas/pages/profile-page.ts`
- Create: `apps/agent/src/adapters/pgdas/pages/profile-page.test.ts`
- Create: `apps/agent/src/sanitization/screenshot.ts`
- Create: `docs/runbooks/pgdas-homologation.md`

**Interfaces:**
- Consumes: responsible certificate and taxpayer document snapshot.
- Produces: verified responsible identity and selected taxpayer profile, or `needs_attention` with a stable reason.

- [ ] **Step 1: Write failing fixture tests**

Test success, unexpected certificate subject, missing taxpayer authorization, maintenance, and CAPTCHA. Assert no test result contains a full document number.

- [ ] **Step 2: Run tests and observe the expected failure**

Run: `pnpm --dir apps/agent test -- profile-page.test.ts`

Expected: FAIL because the page objects are absent.

- [ ] **Step 3: Implement semantic page objects**

Locate controls by accessible role, label, and stable text. After login, compare normalized certificate metadata with the expected responsible. After profile selection, compare the displayed taxpayer document with the batch snapshot before continuing.

- [ ] **Step 4: Implement sanitization**

Before saving a screenshot, cover document-number, name, revenue, and barcode regions identified by locators. If sanitization cannot be confirmed, do not upload the screenshot; store only a stable error code.

- [ ] **Step 5: Perform the real-origin preflight**

With the user present, open the real origin using a test-authorized certificate, verify authentication and representative selection, then stop before opening an editable declaration. Record portal origins, redirects, semantic locators, and screenshots only after sanitization.

- [ ] **Step 6: Verify and commit**

Run fixture tests and the non-transmitting preflight checklist. Update the runbook and progress, then commit:

```powershell
git add apps/agent docs/runbooks docs/progress.md
git commit -m "feat: verify PGDAS representative identity"
```

---

### Task 16: Competence, One-Activity Revenue, and Calculation

**Files:**
- Create: `apps/agent/src/adapters/pgdas/pages/assessment-page.ts`
- Create: `apps/agent/src/adapters/pgdas/pages/assessment-page.test.ts`
- Create: `apps/agent/src/adapters/pgdas/mappings/activity.ts`
- Create: `apps/agent/src/adapters/pgdas/mappings/activity.test.ts`

**Interfaces:**
- Consumes: competence, integer revenue cents, and exact commerce/service profile snapshot.
- Produces: filled assessment and `CalculatedAssessment { totalDueCents, summaryFingerprint }`.

- [ ] **Step 1: Write failing mapping and boundary tests**

Cover commerce, services, zero revenue, decimal input, unsupported option, missing competence, and a portal option that differs from the confirmed profile.

- [ ] **Step 2: Run tests and observe the expected failure**

Run: `pnpm --dir apps/agent test -- activity.test.ts assessment-page.test.ts`

Expected: FAIL because mappings and page object are absent.

- [ ] **Step 3: Implement exact mappings**

Map stable internal profile codes to the exact visible portal option. Never choose by row position. If the expected option is absent or ambiguous, emit `needs_attention: ACTIVITY_MISMATCH`.

- [ ] **Step 4: Implement entry and independent readback**

Select competence, enter the revenue once, then read the displayed competence, activity, and revenue back from the summary. Compare all three with the immutable snapshot before invoking calculation.

- [ ] **Step 5: Capture the calculated result**

Parse currency into integer cents and calculate `summaryFingerprint` from competence, taxpayer, activity, revenue, and total due. Persist the `calculated` event before any submit interaction.

- [ ] **Step 6: Verify and commit**

Run all PGDAS fixture tests, typecheck, build, and `git diff --check`. Update progress and commit:

```powershell
git add apps/agent docs/progress.md
git commit -m "feat: calculate one-activity PGDAS assessments"
```

---

### Task 17: Existing Declaration Detection and Submission Guard

**Files:**
- Create: `apps/agent/src/adapters/pgdas/pages/submission-page.ts`
- Create: `apps/agent/src/adapters/pgdas/pages/submission-page.test.ts`
- Create: `apps/agent/src/adapters/pgdas/idempotency.ts`
- Create: `apps/agent/src/adapters/pgdas/idempotency.test.ts`
- Modify: `docs/runbooks/pgdas-homologation.md`

**Interfaces:**
- Consumes: calculated fingerprint and durable remote/local state.
- Produces: `SubmissionResult` with `submitted`, `alreadySubmitted`, or `needsAttention`.

- [ ] **Step 1: Write failing idempotency tests**

Cover no existing declaration, matching existing declaration, conflicting existing declaration, connection loss after clicking submit, and retry after local state remains `calculated` while remote state is transmitted.

- [ ] **Step 2: Run tests and observe the expected failure**

Run: `pnpm --dir apps/agent test -- idempotency.test.ts submission-page.test.ts`

Expected: FAIL because guard functions are absent.

- [ ] **Step 3: Implement remote-state-first reconciliation**

Before every submit attempt, query the declaration state. A matching transmitted declaration advances locally without clicking submit. A conflicting declaration becomes `needs_attention`. An unknown state never triggers submission.

- [ ] **Step 4: Implement the confirmation boundary**

Require the immutable batch confirmation ID and exact `summaryFingerprint`. Re-read the portal summary immediately before clicking submit. Persist `submission_started` with a unique attempt ID, click once, then query remote state rather than clicking again after ambiguity.

- [ ] **Step 5: Run the accompanied production transmission**

Follow the runbook with one user-selected company. Pause on the final confirmation page, show competence, activity, revenue, and calculated amount, obtain live authorization, click once, record receipt identity, and stop the batch after that company.

- [ ] **Step 6: Verify and commit**

Manually reconcile the portal receipt with the batch snapshot. Record only sanitized evidence and result identifiers. Run all tests and commit:

```powershell
git add apps/agent docs/runbooks docs/progress.md
git commit -m "feat: guard PGDAS transmission idempotently"
```

---

### Task 18: DAS and Receipt Validation, Storage, and Local Mirror

**Files:**
- Create: `apps/agent/src/documents/download.ts`
- Create: `apps/agent/src/documents/pdf-validation.ts`
- Create: `apps/agent/src/documents/pdf-validation.test.ts`
- Create: `apps/agent/src/documents/naming.ts`
- Create: `apps/agent/src/documents/naming.test.ts`
- Create: `apps/agent/src/documents/upload.ts`
- Create: `apps/web/src/app/api/agent/v1/artifacts/upload/route.ts`
- Create: `apps/web/src/app/api/agent/v1/artifacts/complete/route.ts`

**Interfaces:**
- Consumes: submitted item, downloaded files, and authenticated device.
- Produces: validated `ArtifactManifest`, private Storage object, optional local mirror, and artifact row.

- [ ] **Step 1: Write failing naming and PDF tests**

Cover invalid filename characters, maximum length, masked/full document configuration, duplicate content, different content at the same logical path, empty PDF, wrong competence, wrong taxpayer, and wrong document kind.

- [ ] **Step 2: Run tests and observe the expected failure**

Run: `pnpm --dir apps/agent test -- naming.test.ts pdf-validation.test.ts`

Expected: FAIL because document utilities are absent.

- [ ] **Step 3: Implement download and validation**

Wait for Playwright download events, save to a restricted temporary directory, verify PDF signature and nonzero size, extract text with PDF.js, and match taxpayer plus competence. Delete invalid temporary files after recording a sanitized error.

- [ ] **Step 4: Implement deterministic paths**

Generate:

```text
owner/responsible/simples-nacional/YYYY/MM-YYYY/company/YYYY-MM_KIND_Company_DOCUMENT.pdf
```

Normalize Unicode, remove invalid separators, cap segments, and calculate SHA-256. Same path and hash is a no-op; same path with different hash creates a version and alert.

- [ ] **Step 5: Implement signed upload and local mirror**

The agent requests a one-use signed upload, uploads directly to Storage, and calls completion with hash and size. Only after server verification does it create the artifact row. Mirror to the device-configured root using an atomic temporary-file rename.

- [ ] **Step 6: Verify and commit**

Run document tests, Storage policy tests, typecheck, build, and a simulated end-to-end download. Update progress and commit:

```powershell
git add apps/agent apps/web supabase docs/progress.md
git commit -m "feat: validate and organize fiscal documents"
```

---

### Task 19: Resilience, Final Report, and Cross-Platform MVP Verification

**Files:**
- Create: `apps/agent/src/runtime/retry-policy.ts`
- Create: `apps/agent/src/runtime/retry-policy.test.ts`
- Create: `apps/web/src/features/reports/batch-report.tsx`
- Create: `apps/web/src/features/reports/batch-report.test.tsx`
- Create: `apps/web/e2e/mvp-flow.spec.ts`
- Create: `supabase/migrations/202609160007_log_retention.sql`
- Create: `supabase/tests/log_retention.test.sql`
- Create: `docs/runbooks/pgdas-incidents.md`
- Create: `docs/verification/mvp-windows.md`
- Create: `docs/verification/mvp-arch.md`

**Interfaces:**
- Consumes: all completed subsystems.
- Produces: bounded retry policy, final operational report, incident runbook, and verified MVP evidence on both platforms.

- [ ] **Step 1: Write failing retry tests**

Assert network reads retry with bounded exponential backoff; CAPTCHA, authorization, identity, activity mismatch, and ambiguous submission never auto-retry; one failed item does not stop the next item.

- [ ] **Step 2: Run tests and observe the expected failure**

Run: `pnpm --dir apps/agent test -- retry-policy.test.ts`

Expected: FAIL because retry policy is absent.

- [ ] **Step 3: Implement retry and shutdown behavior**

Use a maximum attempt count and jittered delays for explicitly transient operations. On shutdown, persist interruption and release no lease until the server acknowledges the event. On restart, reconcile remote portal state before continuing.

- [ ] **Step 4: Implement the final report**

Display counts for completed, needs attention, failed, and interrupted; show each company's last safe state, concise action, DAS/receipt links, and retry eligibility. Never label a batch complete while any item is nonterminal.

- [ ] **Step 5: Implement configurable technical-log retention**

Add a per-owner retention setting with a conservative default. Create a database cleanup function that deletes expired technical events and sanitized screenshots while preserving batch audit events, transmission identifiers, DAS, and receipts. Add pgTAP tests proving fiscal audit records survive cleanup.

- [ ] **Step 6: Add the full simulated E2E test**

Import a sanitized workbook, create competence, enter revenues, confirm once, choose a simulated device, process mixed success/intervention outcomes, interrupt and resume, then verify documents and report counts.

- [ ] **Step 7: Execute Windows verification**

Run the complete test suite and one accompanied non-production fixture batch on Windows. Verify certificate lookup, visible browser, local mirror, Storage documents, interruption, restart, and report. Record commands and exact outcomes in `docs/verification/mvp-windows.md`.

- [ ] **Step 8: Execute Arch verification**

Repeat the same acceptance suite on Arch Linux and record outcomes in `docs/verification/mvp-arch.md`.

- [ ] **Step 9: Run the final automated gate**

Run:

```powershell
pnpm dlx supabase db reset
pnpm dlx supabase test db
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm --dir apps/web exec playwright test
git diff --check
```

Expected: all checks pass; verification documents contain no secrets or real taxpayer data.

- [ ] **Step 10: Record and commit**

Update `docs/progress.md` with acceptance evidence and remaining operational limitations, then commit:

```powershell
git add apps docs/runbooks docs/verification docs/progress.md
git commit -m "feat: complete resilient PGDAS MVP"
```

## Plan Completion Gate

The MVP is complete only when the spec's twelve acceptance criteria are evidenced, Windows and Arch verification documents pass, a real accompanied transmission has been reconciled manually, and every generated DAS and receipt is accessible from the authenticated web application.
