# Task 13 report — enrollment and platform packaging

Implemented injectable enrollment and run boundaries, secure user-scoped token storage, cross-platform package scripts, declarative startup artifacts, and installation/removal documentation.

## Verification

- RED was observed before implementation: `enroll.test.ts` could not resolve the enrollment module.
- Focused enrollment tests: 2 passed; complete agent suite: 25 passed, 1 skipped.
- Agent typecheck and emitting build passed; workspace tests, lint, typecheck, build, and `git diff --check` passed.
- Secret scan over tracked files found no private keys, PFX/P12 files, service-role keys, JWT credentials, or enrollment/device tokens.

## Platform evidence

- Windows and Arch installation/enrollment were not executed because this host does not provide the supported platform harness. No compatibility claim is made.
- PowerShell and POSIX packaging scripts are declarative and user-scoped. They copy compiled output and bundled Playwright browsers only when present.
- Scheduler/systemd artifacts start only the agent runtime; job creation and fiscal submission remain manual web-confirmed operations.

No real enrollment token, device token, certificate, hosted database mutation, fiscal document, or push was used.

## Review fixes

- Corrected the Windows package root traversal and added executable `lazybot-agent.cmd`/`lazybot-agent` launchers matching the XML and systemd unit.
- Enrollment prompts now collect the one-time token without terminal echo; piped input also avoids echoing it.
- The Windows packaging step converts the scheduler XML to UTF-16 with BOM in a temporary file before replacing the payload. The source remains UTF-8 so it is portable in Git.
- Re-ran the Windows package script: launcher was present and the output XML BOM was `FF FE`.
- Package output now has a stable `dist/` layout, copies the required `zod` and shared-contract runtime trees, and uses launchers that resolve relative to the package directory. Packaging regression tests cover these paths.
- The contracts package is compiled from a temporary NodeNext staging copy with explicit `.js` specifiers, then exported as `node_modules/@lazybot/contracts/dist/index.js`; the repository's web-facing source remains compatible with Next.js. The clean Windows launcher smoke test now executes successfully and reports the expected invalid-command error.
- The Arch instructions install the launcher at `~/.local/share/lazybot-agent/lazybot-agent`, exactly matching the user-level systemd unit.
- Both package scripts now include the Node `playwright` package as well as the optional browser cache, so the probe's dynamic import is available in a copied package.
- The top-level CLI dispatcher now routes `probe` through the real allowlisted origin probe; a focused dispatcher regression covers the command boundary.
- The runtime sends a heartbeat alongside lease renewal at the active interval while a job is executing; the runtime regression verifies the periodic signal and ordered event sequence.
- Packaging now compiles `@lazybot/contracts` to JavaScript with NodeNext-compatible specifiers and points the packaged dependency export at `dist/index.js`; no `.ts` source is required at runtime. A clean Windows package smoke run executed the launcher and returned the expected `INVALID_ARGUMENTS` for an invalid command.
- Arch documentation now explicitly changes into the default `apps/agent/dist/package-arch` output before installation.
