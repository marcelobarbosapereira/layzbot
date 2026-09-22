# Task 15 report — PGDAS identity and representative selection

Implemented semantic fixture-only page objects for certificate identity and taxpayer representative selection.
Certificate responsible ID, normalized subject, and optional fingerprint are checked before a verified result is
returned. Taxpayer profiles are selected by stable data identity and the displayed document is compared with the
immutable snapshot before the accessible selection button is clicked.

Stable attention codes cover unexpected certificate, missing authorization, maintenance, and CAPTCHA. No full
document number is included in returned results or errors. Screenshot capture requires exactly four confirmed,
visible sensitive regions (document number, name, revenue, barcode); otherwise it throws
`SCREENSHOT_SANITIZATION_UNCONFIRMED` before persistence.

The real-origin preflight was not available on this host and was not attempted. The manual, non-transmitting
checklist and evidence rules are recorded in `docs/runbooks/pgdas-homologation.md`.

## Verification

- Focused profile/sanitization suite: 46 passed, 1 environmental skip (Playwright browser unavailable where applicable).
- Workspace tests: 129 passed (agent 46/1 skipped, web 78, contracts 5).
- Workspace lint, typecheck, and build: passed.
- Agent typecheck and build: passed.
- Secret scan for new Task 15 files: clean.
- `git diff --check`: passed.
- No portal access, certificate use, Supabase mutation, deployment, push, or fiscal transmission.
