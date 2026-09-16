# LazyBot Web and Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a deployable Next.js application with Supabase authentication, secured core data, Excel import, and an editable monthly Simples Nacional grid.

**Architecture:** A pnpm workspace contains the Next.js application and shared TypeScript contracts. Supabase owns authentication, Postgres, RLS, and private document storage; the web app reads through Server Components and mutates through Server Actions.

**Tech Stack:** TypeScript, pnpm workspaces, Next.js App Router, React, Supabase, Zod, Vitest, Testing Library, Playwright, ExcelJS.

**Spec:** `docs/superpowers/specs/2026-09-16-lazybot-automation-design.md`

## Global Constraints

- Each task must fit in one five-hour Codex window and target no more than four hours of implementation.
- Reserve the remainder of every window for tests, review, documentation, and a clean commit.
- Use TDD: add a failing test, observe the expected failure, implement the smallest passing change, then run the full affected suite.
- Never commit Supabase keys, certificate files, passwords, browser state, taxpayer exports, or generated fiscal documents.
- Use Next.js Node.js runtime by default; do not opt into Edge runtime.
- Keep the original workbook read-only; import from it but never overwrite it.
- All exposed Supabase tables and Storage objects require RLS.
- Finish every task with a clean checkpoint recorded in `docs/progress.md`.

## File Map

- `package.json`: root scripts and Node/pnpm requirements.
- `pnpm-workspace.yaml`: workspace boundaries.
- `apps/web/`: Next.js application.
- `apps/web/src/lib/supabase/`: browser, server, and admin-free Supabase clients.
- `apps/web/src/features/auth/`: sign-in and session behavior.
- `apps/web/src/features/import/`: workbook parsing, preview, and commit workflow.
- `apps/web/src/features/assessments/`: competency selector and editable grid.
- `packages/contracts/`: Zod schemas shared later with the agent.
- `supabase/migrations/`: versioned SQL schema and policies.
- `supabase/tests/`: SQL policy and database behavior tests.
- `tests/fixtures/`: sanitized workbook fixtures.
- `docs/progress.md`: durable handoff between Codex windows.

---

### Task 1: Workspace and Executable Web Shell

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `apps/web/**`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/index.ts`
- Create: `apps/web/src/app/page.test.tsx`
- Create: `docs/progress.md`

**Interfaces:**
- Consumes: none.
- Produces: workspace scripts `dev`, `build`, `lint`, `typecheck`, and `test`; package `@lazybot/contracts`.

- [ ] **Step 1: Scaffold the workspace without starting a dev server**

Run:

```powershell
pnpm create next-app apps/web --ts --eslint --app --src-dir --use-pnpm --import-alias "@/*" --no-tailwind
```

Expected: `apps/web` contains an App Router application and no command remains running.

- [ ] **Step 2: Add the root workspace configuration**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

Create root `package.json`:

```json
{
  "name": "lazybot",
  "private": true,
  "packageManager": "pnpm@10",
  "scripts": {
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test"
  }
}
```

- [ ] **Step 3: Install and configure the test runner, then write the failing home-page test**

Add Vitest, jsdom, Testing Library, `vitest.config.ts`, and `src/test/setup.ts` before running the first test. Add `test` and `typecheck` scripts to `apps/web/package.json`.

Create `apps/web/src/app/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import Home from './page';

it('identifies the application and its monthly workflow', () => {
  render(<Home />);
  expect(screen.getByRole('heading', { name: 'LazyBot' })).toBeVisible();
  expect(screen.getByText('Apurações mensais')).toBeVisible();
});
```

- [ ] **Step 4: Run the test and observe the expected failure**

Run: `pnpm --dir apps/web test -- page.test.tsx`

Expected: FAIL because the generated page does not contain both required texts.

- [ ] **Step 5: Implement the minimal shell and shared package**

Replace `apps/web/src/app/page.tsx` with:

```tsx
export default function Home() {
  return (
    <main>
      <h1>LazyBot</h1>
      <p>Apurações mensais</p>
    </main>
  );
}
```

Create `packages/contracts/src/index.ts`:

```ts
export const APP_NAME = 'LazyBot';
```

Add a `build` script to `packages/contracts/package.json` using `tsc --noEmit`.

- [ ] **Step 6: Add secret and artifact exclusions**

Ensure `.gitignore` contains:

```gitignore
.env*
!.env.example
*.pfx
*.p12
playwright/.auth/
downloads/
artifacts/
.next/
node_modules/
```

- [ ] **Step 7: Verify the checkpoint**

Run:

```powershell
pnpm install
pnpm test
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Expected: all commands succeed.

- [ ] **Step 8: Record and commit**

Add Task 1 verification commands and results to `docs/progress.md`, then run:

```powershell
git add package.json pnpm-workspace.yaml .gitignore .env.example apps packages docs/progress.md
git commit -m "chore: scaffold LazyBot workspace"
```

---

### Task 2: Supabase Auth and Core Taxpayer Schema

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202609160001_core.sql`
- Create: `supabase/tests/core_schema.test.sql`
- Create: `apps/web/src/lib/supabase/server.ts`
- Create: `apps/web/src/lib/supabase/browser.ts`
- Create: `apps/web/src/features/auth/actions.ts`
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/(app)/layout.tsx`
- Create: `packages/contracts/src/taxpayer.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: `@lazybot/contracts` package from Task 1.
- Produces: `TaxpayerInput`, `ResponsibleInput`, authenticated app layout, tables `responsibles`, `taxpayers`, `taxpayer_obligations`, `simple_profiles`, and `monthly_assessments`.

- [ ] **Step 1: Add dependencies and initialize Supabase locally**

Run:

```powershell
pnpm --dir apps/web add @supabase/ssr @supabase/supabase-js zod
pnpm --dir packages/contracts add zod
pnpm dlx supabase init
```

- [ ] **Step 2: Write the failing database test**

Create `supabase/tests/core_schema.test.sql` with assertions that an authenticated user can insert their own responsible and cannot read another user's responsible:

```sql
begin;
select plan(2);

select has_table('public', 'responsibles', 'responsibles exists');
select has_table('public', 'monthly_assessments', 'monthly_assessments exists');

select * from finish();
rollback;
```

- [ ] **Step 3: Run the database test and observe the expected failure**

Run: `pnpm dlx supabase db start && pnpm dlx supabase test db`

Expected: FAIL because the application tables do not exist.

- [ ] **Step 4: Create the core migration**

Create enums for document and obligation types, then create the five tables with UUID primary keys, `owner_id uuid not null references auth.users(id)`, timestamps, and these constraints:

```sql
create unique index taxpayers_owner_document_key
  on public.taxpayers(owner_id, document);

create unique index monthly_assessments_unique_period
  on public.monthly_assessments(taxpayer_id, obligation, competence);

alter table public.responsibles enable row level security;
alter table public.taxpayers enable row level security;
alter table public.taxpayer_obligations enable row level security;
alter table public.simple_profiles enable row level security;
alter table public.monthly_assessments enable row level security;
```

Add owner policies using `(select auth.uid()) = owner_id`; child tables must verify ownership through their parent rather than trusting a client-supplied owner.

- [ ] **Step 5: Add shared validation contracts**

Create `packages/contracts/src/taxpayer.ts`:

```ts
import { z } from 'zod';

export const responsibleInput = z.object({
  name: z.string().trim().min(2),
  document: z.string().regex(/^\d{11}$|^\d{14}$/),
});

export const taxpayerInput = z.object({
  name: z.string().trim().min(2),
  document: z.string().regex(/^\d{11}$|^\d{14}$/),
  responsibleId: z.string().uuid(),
});

export type TaxpayerInput = z.infer<typeof taxpayerInput>;
```

- [ ] **Step 6: Implement Supabase clients and sign-in action**

Use `createServerClient` with awaited `cookies()` in `server.ts`, `createBrowserClient` in `browser.ts`, and a Server Action that calls `signInWithPassword`. The authenticated layout must redirect unauthenticated users to `/login`.

- [ ] **Step 7: Verify auth, schema, and policies**

Run:

```powershell
pnpm dlx supabase db reset
pnpm dlx supabase test db
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Expected: SQL tests and application checks pass.

- [ ] **Step 8: Record and commit**

Update `docs/progress.md`, then run:

```powershell
git add supabase apps/web packages/contracts docs/progress.md
git commit -m "feat: add authenticated taxpayer data model"
```

---

### Task 3: Private Document Storage and Access Policies

**Files:**
- Create: `supabase/migrations/202609160002_storage.sql`
- Create: `supabase/tests/storage_policies.test.sql`
- Create: `packages/contracts/src/storage-path.ts`
- Create: `packages/contracts/src/storage-path.test.ts`

**Interfaces:**
- Consumes: authenticated owner and taxpayer schema from Task 2.
- Produces: private bucket `fiscal-documents` and `buildOwnerStoragePrefix(ownerId)`; artifact metadata is added after batch items exist in Plan 2.

- [ ] **Step 1: Write failing storage policy tests**

Test that the bucket exists, is private, and rejects a path whose first segment differs from `auth.uid()`:

```sql
select is(
  (select public from storage.buckets where id = 'fiscal-documents'),
  false,
  'fiscal documents bucket is private'
);
```

- [ ] **Step 2: Run the tests and observe the expected failure**

Run: `pnpm dlx supabase test db`

Expected: FAIL because the bucket and policies do not exist.

- [ ] **Step 3: Add the private bucket and policies**

The object path must start with the authenticated owner UUID:

```sql
create policy "owners read fiscal objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'fiscal-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
```

Do not create document metadata before the batch-item foreign key exists.

- [ ] **Step 4: Write the failing owner-prefix unit test**

Assert invalid UUIDs are rejected and a valid owner ID produces exactly `<owner-id>/` without accepting caller-supplied traversal segments.

- [ ] **Step 5: Implement the storage prefix helper**

Implement:

```ts
import { z } from 'zod';

export function buildOwnerStoragePrefix(ownerId: string): string {
  return `${z.string().uuid().parse(ownerId)}/`;
}
```

- [ ] **Step 6: Verify and commit**

Run:

```powershell
pnpm dlx supabase db reset
pnpm dlx supabase test db
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Update `docs/progress.md`, then commit:

```powershell
git add supabase packages/contracts apps/web docs/progress.md
git commit -m "feat: secure fiscal document storage"
```

---

### Task 4: Read-Only Excel Import Preview and Commit

**Files:**
- Create: `packages/contracts/src/import.ts`
- Create: `supabase/migrations/202609160003_import.sql`
- Create: `supabase/tests/import_commit.test.sql`
- Create: `apps/web/src/features/import/parse-workbook.ts`
- Create: `apps/web/src/features/import/parse-workbook.test.ts`
- Create: `apps/web/src/features/import/actions.ts`
- Create: `apps/web/src/features/import/import-dialog.tsx`
- Create: `apps/web/src/app/(app)/import/page.tsx`
- Create: `tests/fixtures/lazybot-valid.xlsx`
- Create: `tests/fixtures/lazybot-invalid.xlsx`

**Interfaces:**
- Consumes: taxpayer and obligation tables from Task 2.
- Produces: `parseWorkbook(bytes): ImportPreview` and `commitImport(previewToken): ImportCommitResult`.

- [ ] **Step 1: Add ExcelJS and create sanitized fixtures**

Run: `pnpm --dir apps/web add exceljs`

Create fixtures containing the six expected sheet names but only fabricated CPF/CNPJ/NIT values that pass checksum validation.

- [ ] **Step 2: Write failing parser tests**

Cover sheet-name normalization, `Valor` mapping to `revenue`, deduplication by normalized document, multiple obligations for one taxpayer, and invalid rows remaining in the preview:

```ts
it('maps Simples Valor to monthly revenue without changing the source file', async () => {
  const preview = await parseWorkbook(await fixture('lazybot-valid.xlsx'));
  expect(preview.simple[0]).toMatchObject({ revenue: 10000, activity: 'commerce' });
});
```

- [ ] **Step 3: Run the parser test and observe the expected failure**

Run: `pnpm --dir apps/web test -- parse-workbook.test.ts`

Expected: FAIL because `parseWorkbook` does not exist.

- [ ] **Step 4: Implement deterministic parsing**

Read from an in-memory buffer only. Normalize headers and documents, map the six workbook tabs, and return:

```ts
export type ImportPreview = {
  validRows: ImportRow[];
  invalidRows: Array<ImportRow & { errors: string[] }>;
  summary: Record<string, number>;
};
```

Never write to the uploaded workbook path.

- [ ] **Step 5: Implement preview-token commit**

Store the validated preview in a short-lived server-side record keyed by a random token. Create an `commit_import` RPC that verifies ownership and upserts responsible, taxpayer, obligation, profile, and monthly assessment rows in one database transaction. Add a pgTAP test that forces one invalid child row and proves the entire import rolls back. The Server Action must call only this RPC for the commit.

- [ ] **Step 6: Implement the two-step UI**

The first action uploads and previews counts and row errors. The second explicit action commits only valid rows. Display invalid row number, sheet, document, and exact reason.

- [ ] **Step 7: Verify and commit**

Run:

```powershell
pnpm --dir apps/web test -- parse-workbook.test.ts
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Update `docs/progress.md`, then commit:

```powershell
git add packages/contracts apps/web tests/fixtures docs/progress.md
git commit -m "feat: import LazyBot workbook with preview"
```

---

### Task 5: Spreadsheet-Like Monthly Assessments UI

**Files:**
- Create: `apps/web/src/features/assessments/queries.ts`
- Create: `apps/web/src/features/assessments/actions.ts`
- Create: `apps/web/src/features/assessments/assessment-grid.tsx`
- Create: `apps/web/src/features/assessments/assessment-grid.test.tsx`
- Create: `apps/web/src/features/assessments/competence-picker.tsx`
- Create: `apps/web/src/app/(app)/simples/page.tsx`
- Create: `apps/web/e2e/monthly-assessments.spec.ts`

**Interfaces:**
- Consumes: authenticated taxpayers, profiles, and assessments from Task 2.
- Produces: `createCompetence(yyyyMm)`, `updateAssessment(input)`, and a grid with paste, validation, filters, and selection.

- [ ] **Step 1: Add the grid dependency and write failing component tests**

Run: `pnpm --dir apps/web add react-data-grid`

Test that changing revenue to a negative value shows `Receita inválida`, selecting a new competence preserves the prior competence, and pasted tab-separated revenue values update matching visible rows.

- [ ] **Step 2: Run the component tests and observe the expected failure**

Run: `pnpm --dir apps/web test -- assessment-grid.test.tsx`

Expected: FAIL because the grid does not exist.

- [ ] **Step 3: Implement competence creation**

`createCompetence('2026-09')` must insert one assessment for every active Simples taxpayer that lacks that competence. Use `on conflict do nothing`; never copy a prior month's revenue.

- [ ] **Step 4: Implement validated cell mutation**

Parse Brazilian-formatted input into numeric cents, validate non-negative revenue and an existing profile, and use the row version in the update predicate. Return a conflict message when another edit changed the row.

- [ ] **Step 5: Implement the grid and tabs**

Display `Executar`, `Empresa`, `CNPJ`, `Receita do período`, `Atividade`, `Responsável`, `Status`, and `Documentos`. Mask CPF/CNPJ by default and require an explicit reveal action for the full value. Preserve the familiar obligation tabs while marking non-MVP tabs as `Cadastro disponível; automação em ciclo posterior`.

- [ ] **Step 6: Add the end-to-end test**

The Playwright test signs in with a local test user, creates a competence, edits two revenues, reloads, and verifies both values persist while the previous competence remains unchanged.

- [ ] **Step 7: Verify the complete first plan**

Run:

```powershell
pnpm dlx supabase db reset
pnpm dlx supabase test db
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm --dir apps/web exec playwright test e2e/monthly-assessments.spec.ts
git diff --check
```

Expected: all checks pass and no sensitive fixture contains a real taxpayer.

- [ ] **Step 8: Record and commit**

Update `docs/progress.md` with the end-to-end evidence and the next plan path, then commit:

```powershell
git add apps/web docs/progress.md
git commit -m "feat: add monthly Simples assessment grid"
```

## Plan Completion Gate

Before starting Plan 2, verify that a clean clone can start Supabase, sign in, import the sanitized workbook, create a competence, edit revenue, and pass all commands from Task 5 Step 7.
