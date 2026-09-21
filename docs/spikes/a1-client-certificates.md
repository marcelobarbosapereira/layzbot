# A1 client-certificate feasibility spike

Status: disposable local mTLS harness implemented; platform evidence is recorded below. No production portal, taxpayer data, fiscal submission, Supabase mutation, or real certificate was used.

## Harness

`apps/agent/test/mtls/generate-fixtures.ts` creates a one-day local CA, `localhost` server certificate, fictitious client certificate, and password-protected PFX below `apps/agent/test/fixtures/generated/`. The directory is ignored by Git. `client-certificate.test.ts` starts the HTTPS server with `requestCert`/`rejectUnauthorized`, proves the configured Playwright `clientCertificates` option reaches the protected page, and proves a context without the PFX cannot authenticate.

The production helper validates HTTPS origin allowlists, resolves metadata and secret material through `CertificateRegistry.resolve`, and clears copied PFX byte buffers in `finally` after context creation or failure. Passphrases are never logged; JavaScript strings cannot be scrubbed in place, so the reference is dropped after context creation.

## Evidence

| Platform | Node | Playwright / Chromium | Result | Notes |
| --- | --- | --- | --- | --- |
| Windows host used for this spike | Node v24.19.0 | Playwright 1.63.0 package; Chromium executable unavailable; OpenSSL unavailable | Not run | The focused unit suite runs; the mTLS test skips with an explicit availability condition. Install OpenSSL and `playwright install chromium` to execute the disposable handshake. No compatibility claim is made. |
| Arch Linux | Unavailable in this environment | Unavailable | Not run | Requires an Arch runner with Node, OpenSSL, and bundled Chromium. No compatibility claim is made. |

The implementation is intentionally a feasibility harness. It does not navigate into a fiscal form and does not transmit any document.
