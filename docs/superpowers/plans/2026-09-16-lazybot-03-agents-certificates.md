# LazyBot Cross-Platform Agents and Certificates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver enrolled Windows and Arch Linux agents that securely store A1 certificate configuration, claim simulated work, and prove PFX client-certificate authentication on both platforms.

**Architecture:** One TypeScript agent package contains platform-neutral orchestration and explicit platform adapters for secret storage. It communicates only with the versioned Next.js agent API, uses Playwright browser contexts, and never receives a Supabase service key.

**Tech Stack:** Node.js, TypeScript, Playwright, Zod, Vitest, Windows DPAPI, Linux Secret Service, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-16-lazybot-automation-design.md`

## Global Constraints

- Complete Plans 1 and 2 first.
- Each task must fit one five-hour Codex window with a verification and handoff reserve.
- Never use a real taxpayer or production certificate in automated tests or repository fixtures.
- Never log PFX bytes, passphrases, browser cookies, access tokens, or raw taxpayer documents.
- The same protocol types must compile in web and agent packages.
- Certificate feasibility is a spike with documented evidence before portal implementation.
- Finish every task with tests, platform-specific verification evidence, `docs/progress.md`, and a commit.

## File Map

- `apps/agent/`: cross-platform executor entrypoint.
- `apps/agent/src/api/`: typed HTTP client for `/api/agent/v1`.
- `apps/agent/src/runtime/`: heartbeat, claim loop, leases, and shutdown.
- `apps/agent/src/secrets/`: OS-specific secret providers.
- `apps/agent/src/certificates/`: PFX metadata, validation, and Playwright options.
- `apps/agent/src/adapters/`: simulated and later real portal adapters.
- `apps/agent/scripts/`: Windows and Arch packaging/provisioning.
- `apps/agent/test/fixtures/`: generated local-only test certificates ignored by Git.

---

### Task 10: Agent Runtime and Simulated Adapter

**Files:**
- Create: `apps/agent/package.json`
- Create: `apps/agent/tsconfig.json`
- Create: `apps/agent/src/config.ts`
- Create: `apps/agent/src/api/client.ts`
- Create: `apps/agent/src/runtime/agent.ts`
- Create: `apps/agent/src/runtime/agent.test.ts`
- Create: `apps/agent/src/adapters/portal-adapter.ts`
- Create: `apps/agent/src/adapters/simulated.ts`
- Modify: `pnpm-workspace.yaml`

**Interfaces:**
- Consumes: `AgentApi` contracts from Plan 2.
- Produces: `AgentRuntime.start(signal)`, `PortalAdapter.execute(job, reporter)`, heartbeat and claim loop.

- [ ] **Step 1: Write the failing runtime test**

Use a fake API and fake clock. Assert the agent heartbeats, claims one item, emits ordered events, completes it, then waits; aborting the signal stops without claiming more work.

```ts
expect(api.calls.map((call) => call.kind)).toEqual([
  'heartbeat', 'claim', 'event', 'event', 'complete'
]);
```

- [ ] **Step 2: Run the test and observe the expected failure**

Run: `pnpm --dir apps/agent test -- agent.test.ts`

Expected: FAIL because `AgentRuntime` does not exist.

- [ ] **Step 3: Implement typed configuration and API client**

Require `LAZYBOT_URL`, `LAZYBOT_DEVICE_TOKEN`, device name, OS, and agent version. Validate once at startup with Zod. Redact the authorization header from all errors.

- [ ] **Step 4: Implement the runtime and simulated adapter**

The runtime sends heartbeat, claims one item at a time, renews its lease while active, and invokes the adapter. The simulated adapter emits the exact state sequence through `completed` without browser activity.

- [ ] **Step 5: Verify and commit**

Run agent tests, workspace typecheck/build, and `git diff --check`. Update progress and commit:

```powershell
git add apps/agent pnpm-workspace.yaml docs/progress.md
git commit -m "feat: add cross-platform executor runtime"
```

---

### Task 11: Local Secret Provider and Certificate Registry

**Files:**
- Create: `apps/agent/src/secrets/provider.ts`
- Create: `apps/agent/src/secrets/windows-dpapi.ts`
- Create: `apps/agent/src/secrets/linux-secret-service.ts`
- Create: `apps/agent/src/secrets/provider.test.ts`
- Create: `apps/agent/src/certificates/registry.ts`
- Create: `apps/agent/src/certificates/registry.test.ts`
- Create: `apps/agent/src/cli/certificates.ts`

**Interfaces:**
- Consumes: responsible IDs from the web system.
- Produces: `SecretProvider.store/read/delete`, `CertificateRegistry.add/list/remove/resolve`, and CLI commands `cert add|list|remove`.

- [ ] **Step 1: Write failing contract tests**

Run the same tests against an in-memory provider and platform provider when its OS is available. Assert stored passphrases do not appear in registry JSON, logs, or thrown errors.

- [ ] **Step 2: Run tests and observe the expected failure**

Run: `pnpm --dir apps/agent test -- provider.test.ts registry.test.ts`

Expected: FAIL because providers and registry are absent.

- [ ] **Step 3: Implement the provider interface**

```ts
export interface SecretProvider {
  store(key: string, value: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}
```

On Windows, invoke a fixed PowerShell script using `.NET ProtectedData` with `CurrentUser`; pass secret bytes through stdin, never command arguments. On Arch, invoke `secret-tool store` and `secret-tool lookup`, also through stdin.

- [ ] **Step 4: Implement certificate registry and CLI**

Copy the password-protected PFX into the agent data directory with user-only permissions, store its passphrase through `SecretProvider`, calculate SHA-256 and expiry metadata, and associate it with one responsible ID. Reject expired certificates and duplicate fingerprints.

- [ ] **Step 5: Verify separately on each platform**

Windows:

```powershell
pnpm --dir apps/agent test -- provider.test.ts registry.test.ts
pnpm --dir apps/agent cert add --responsible test-responsible --pfx .local/test-a1.pfx
pnpm --dir apps/agent cert list
```

Arch:

```bash
pnpm --dir apps/agent test -- provider.test.ts registry.test.ts
pnpm --dir apps/agent cert add --responsible test-responsible --pfx .local/test-a1.pfx
pnpm --dir apps/agent cert list
```

Expected: metadata is listed; neither command prints the passphrase or PFX bytes.

- [ ] **Step 6: Record and commit**

Record both platform outcomes in `docs/progress.md`, then commit:

```powershell
git add apps/agent docs/progress.md
git commit -m "feat: protect local A1 certificate configuration"
```

---

### Task 12: Playwright PFX Authentication Feasibility Spike

**Files:**
- Create: `apps/agent/src/certificates/client-certificate.ts`
- Create: `apps/agent/src/certificates/client-certificate.test.ts`
- Create: `apps/agent/test/mtls/server.ts`
- Create: `apps/agent/test/mtls/generate-fixtures.ts`
- Create: `docs/spikes/a1-client-certificates.md`

**Interfaces:**
- Consumes: `CertificateRegistry.resolve(responsibleId)`.
- Produces: `createClientCertificateOptions(responsibleId, origins)` and verified Windows/Arch compatibility evidence.

- [ ] **Step 1: Generate disposable mTLS fixtures outside Git**

Create a script that produces a local CA, server certificate, and password-protected PFX beneath `apps/agent/test/fixtures/generated/`. Ensure the directory is ignored by Git.

- [ ] **Step 2: Write the failing Playwright test**

Start the local HTTPS server requiring a client certificate. Launch Chromium with:

```ts
const context = await browser.newContext({
  clientCertificates: [{ origin, pfx, passphrase }],
});
```

Assert the protected page returns the expected test certificate subject; without the configured certificate, assert authentication fails.

- [ ] **Step 3: Run the test and observe the expected failure**

Run: `pnpm --dir apps/agent test -- client-certificate.test.ts`

Expected: FAIL until certificate options and test server are implemented.

- [ ] **Step 4: Implement certificate resolution and zeroization**

Load PFX and passphrase only for context creation. Return origin-specific options. Clear mutable buffers in `finally` after the browser context is created or fails.

- [ ] **Step 5: Verify on Windows and Arch**

Run the same test command on each OS with the bundled Chromium. Record Node, Playwright, Chromium, OS versions, pass/fail, and limitations in `docs/spikes/a1-client-certificates.md`.

- [ ] **Step 6: Define the portal-origin probe without transmitting**

Add a CLI command that accepts an allowlisted HTTPS origin, opens a visible browser, and records only whether the TLS certificate was accepted. It must not navigate into or submit a fiscal form.

- [ ] **Step 7: Verify and commit**

Run agent tests, typecheck, build, secret scan over Git-tracked files, and `git diff --check`. Update progress and commit:

```powershell
git add apps/agent docs/spikes docs/progress.md .gitignore
git commit -m "test: prove A1 browser authentication on both platforms"
```

---

### Task 13: Enrollment and Platform Packaging

**Files:**
- Create: `apps/agent/src/cli/enroll.ts`
- Create: `apps/agent/src/cli/run.ts`
- Create: `apps/agent/scripts/package-windows.ps1`
- Create: `apps/agent/scripts/package-arch.sh`
- Create: `apps/agent/packaging/lazybot-agent.service`
- Create: `apps/agent/packaging/lazybot-agent.xml`
- Create: `apps/agent/src/cli/enroll.test.ts`
- Create: `docs/agent-installation.md`

**Interfaces:**
- Consumes: one-time enrollment token from Plan 2 and runtime from Task 10.
- Produces: installable agent artifacts, `lazybot-agent enroll`, and `lazybot-agent run`.

- [ ] **Step 1: Write the failing enrollment test**

Mock the enrollment endpoint. Assert the one-time token is exchanged once, the returned device token enters the secret provider, and subsequent runs never need the enrollment token.

- [ ] **Step 2: Run the test and observe the expected failure**

Run: `pnpm --dir apps/agent test -- enroll.test.ts`

Expected: FAIL because enrollment CLI is absent.

- [ ] **Step 3: Implement enrollment and run commands**

`enroll` prompts for URL, device name, and one-time token; `run` reads the stored device token, starts the runtime, handles SIGINT/SIGTERM, marks the active job interrupted, and exits nonzero on unrecoverable configuration errors.

- [ ] **Step 4: Package Windows and Arch artifacts**

Windows packaging includes the compiled agent, Playwright Chromium, configuration directory creation, and an optional Task Scheduler XML that starts on user login. Arch packaging includes the same compiled agent and a user-level systemd unit. Neither enables automatic job creation; execution still requires manual web confirmation.

- [ ] **Step 5: Write installation and removal instructions**

Document enrollment, certificate import, start/stop, logs, upgrades, revocation, and complete removal for both platforms with exact commands.

- [ ] **Step 6: Verify the complete third plan**

Install each artifact on its platform, enroll it against the development web app, import a disposable certificate, heartbeat, claim a simulated item, complete it, revoke the device, and verify the next heartbeat returns 401.

- [ ] **Step 7: Record and commit**

Record both platform results and artifact hashes in progress, then commit:

```powershell
git add apps/agent docs/agent-installation.md docs/progress.md
git commit -m "feat: package Windows and Arch executor agents"
```

## Plan Completion Gate

Do not begin real PGDAS-D automation until both operating systems pass the disposable mTLS test, an enrolled agent completes simulated work, device revocation works, and the spike document contains no real certificate metadata.

