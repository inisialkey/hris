# Security Standards

Status: Active (Phase 2) · Source: `docs/adr/ADR-0002-multi-tenancy-rls.md`, `docs/adr/ADR-0004-auth-sessions-device-management.md`, `docs/adr/ADR-0005-rbac-permission-model.md` · Related: `docs/adr/ADR-0009-file-storage-strategy.md`, `docs/adr/ADR-0011-observability-stack.md`, `docs/adr/ADR-0016-field-level-encryption.md` (Accepted), `docs/05-platform/audit-log.md` · Downstream: `docs/07-operations/ci-cd.md` (gates), `docs/07-operations/environments.md` (secrets wiring)

Binding security rules across all three apps and the platform. Posture: **OWASP ASVS 4.x Level 2** as the working target (PII-heavy business app; L3 controls adopted selectively where cheap). §1 maps ASVS chapters to owners honestly — including the accepted gaps.

## 1. ASVS chapter map

| ASVS chapter | Where handled | Status / accepted gaps |
|---|---|---|
| V1 Architecture | ADR-0001/0002, system-overview | covered |
| V2 Authentication | ADR-0004 + §2 below, ADR-0017 (platform) | **gap: no MFA for *tenant* users in V1** (A-007, accepted; first fast-follow). Platform users are **not** in the gap — ADR-0017 makes TOTP mandatory for `platform_users`, on the ground that one platform credential reaches every tenant (2026-08-04) |
| V3 Session management | ADR-0004 (rotation, family revoke, session list) | covered |
| V4 Access control | ADR-0005, error-catalog §2 (existence hiding), multi-tenancy §3/§5 | covered; leak-test matrix mandatory |
| V5 Validation, sanitization, encoding | ADR-0006 split, api-standards §3, §6 below | covered |
| V6 Cryptography | §8 below, ADR-0016 (Accepted) | covered |
| V7 Error handling & logging | ADR-0006/0011, §10 redaction registry | covered |
| V8 Data protection | §8/§9 below, database-conventions §4.4 retention | covered with VERIFY markers |
| V9 Communication | §4 below | **gap: no mobile cert pinning in V1** (§12, reasoned) |
| V10 Malicious code | §11 supply chain, ADR-0014 sandbox | covered |
| V11 Business logic | module BR-* rules + approval engine (ADR-0008) | per-module duty |
| V12 Files & resources | ADR-0009 | **gap: no inline AV in V1** (accepted, hook reserved) |
| V13 API & web service | api-standards, ADR-0007 | covered |
| V14 Configuration | §7 secrets, environments.md (Phase 4) | covered |

## 2. Authentication hardening

Model is ADR-0004; operational defaults here. Tenant-tunable rows map to registered `auth.*` settings (`docs/05-platform/settings.md`); reset/invite token TTLs and the PIN-unlock threshold are **platform-fixed** — no settings keys (grilled 2026-08-02), as is hashing.

| Control | Default |
|---|---|
| Password policy | Min 10 chars, no forced composition classes, no periodic expiry; deny top-breached-passwords list + tenant-name/email-derived strings. Max length 128 (DoS guard — argon2 itself has no input cap) |
| Hashing (platform-fixed) | argon2id — memory 64 MiB, iterations 3, parallelism 4 (OWASP-recommended baseline; retune only via this doc) |
| Lockout | 5 failed attempts → 15 min lock (`AUTH_ACCOUNT_LOCKED`, `retryAfterSeconds`); counter per user+tenant, reset on success. Lockout responses identical for existing and unknown emails (no enumeration — pairs with `AUTH_INVALID_CREDENTIALS` single-code rule) |
| Password reset | Single-use token, 30 min TTL, SHA-256 stored, sent via email only; response timing/shape identical whether the email exists or not; all sessions revoked on successful reset |
| Password change | Requires current password; revokes all other sessions (keeps the acting one) |
| First login / provisioning | Invite tokens, same single-use mechanics; no default passwords, ever |
| PIN/biometric | Device-local only — never transmitted, never stored server-side (ADR-0004); 5 failed unlocks → local token wipe |

## 3. Rate limiting

Redis sliding-window via the throttler guard (backend-nestjs §5, position 2 — before auth work, so credential stuffing pays no argon2 cost). Defaults are **platform configuration** (environments.md), not settings keys; per-tenant tuning is post-V1 (grilled 2026-08-02):

| Class | Limit | Key |
|---|---|---|
| Login | 5/min + 20/hour **per email**; 30/min + 300/hour **per IP** (both must pass) | per-email carries the anti-stuffing load; per-IP is a NAT-tolerant backstop — onboarding-day office wifi must not lock a tenant out (grilled 2026-08-02) |
| Password reset request | 3/hour per email; 30/hour per IP | same split, same reason |
| Refresh | 10/min | per session |
| Attendance punch | 12/min | per user — generous; the D1 spike is many users, not one hot user |
| Mutations (general) | 60/min | per user |
| Reads (general) | 300/min | per user |
| Unauthenticated (all other public) | 30/min | per IP |

- Over limit → 429 `SYS_RATE_LIMITED` + `Retry-After` (mandatory). `RateLimit-Limit/Remaining/Reset` headers ship on 429 and on the last 10% of budget for authenticated routes.
- Sync drains back off on 429 like any transient failure (offline-sync §4) — limits above leave normal drains untouched.
- IP source = trusted proxy chain configured at ingress only (never `X-Forwarded-For` trust from arbitrary hops).

## 4. Transport, headers, CORS

- **TLS 1.2+ (1.3 preferred) at ingress; HSTS `max-age=31536000; includeSubDomains`** on API and admin origins. Cluster-internal traffic runs plaintext inside the private VPC in V1 (accepted; mesh/mTLS is a post-V1 environments.md concern — **answered 2026-08-04**: `docs/07-operations/environments.md` §15.1 excludes a service mesh from V1 explicitly, with a compliance requirement or a shared cluster as the trigger, A-120). Managed PostgreSQL/Redis connections use TLS.
- API responses: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on all authenticated JSON (payroll data must never land in shared caches).
- **Admin web CSP** (Next.js, nonce-based):
  `default-src 'self'; script-src 'self' 'nonce-…'; connect-src 'self' <api-origin> <sentry>; img-src 'self' data: <storage-origin>; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  `style-src 'unsafe-inline'` is the one concession (Tailwind runtime styles); scripts are never unsafe-inline.
- Files are served from the storage origin with `Content-Disposition: attachment` for non-image types — never from the app origins (ADR-0009).
- **CORS (API):** exact-match allow-list of admin origins; `Access-Control-Allow-Credentials: true` **only** on the refresh/login path (the cookie surface, admin-nextjs §5); preflight cached 1 h. Mobile doesn't use CORS.

## 5. CSRF

The API is bearer-token; the only ambient credential is the refresh cookie (`httpOnly`, `Secure`, `SameSite=Strict`, path-scoped to refresh — ADR-0004). Defense: SameSite=Strict + server-side `Origin` allow-list check on the refresh/login endpoints. That closes the surface — **no CSRF token machinery exists or should be added**; a future cookie-authenticated state-changing endpoint would violate this section and needs this doc amended first.

## 6. Injection and input handling

| Vector | Rule |
|---|---|
| SQL | Drizzle parameterized queries only; raw SQL exists only inside repositories and only as `sql\`\`` tagged templates with bound params (database-conventions §1.9). String-concatenated SQL anywhere = review blocker |
| XSS | React/Flutter escape by default; `dangerouslySetInnerHTML`/`Html` widgets require a sanitizer + review sign-off; CSP (§4) as backstop; API never emits HTML |
| File uploads | Three-layer type enforcement + size caps + storage-origin isolation (ADR-0009); filenames sanitized server-side (naming §11.4 path grammar — client names never become paths) |
| Path traversal | Storage paths are server-constructed from metadata rows only (metadata-as-authority, ADR-0009) |
| SSRF | V1 fetches no user-supplied URLs anywhere. Any future feature that does (webhooks, imports-by-URL) requires an allowlist design added to this section first |
| Command injection | No shell-outs. The only spawned binary is sandboxed no-network Chromium (ADR-0014, worker-only) |
| Template injection | PDF templates are code (React SSR, ADR-0014), not tenant-editable content |
| Excel formula injection | Import/export framework escapes leading `= + - @` on write and never evaluates on read (ADR-0015) |
| Transport validation | Whitelist DTOs, unknown fields rejected (api-standards §3); domain rules server-side only (ADR-0006) |

## 7. Secrets and signing keys

- Secrets reach processes as env vars injected from the cluster secret store (secret-manager-backed; wiring in environments.md). Never in: source, images, `NEXT_PUBLIC_*`, Flutter `--dart-define` for release builds (naming §12), logs (redaction registry §10).
- Boot-time env validation fails the pod on missing/malformed secrets (backend-nestjs §11) — no limping defaults.
- **JWT signing: EdDSA (Ed25519), asymmetric, with `kid` rotation** (A-014). Private key exists only in api pods; anything may verify with the public key. Rotation: introduce new `kid`, sign with it, keep old public keys verify-only until max access-token lifetime + clock skew passes (≈ 20 min), then drop. No `alg` negotiation — verifier pins EdDSA.
- Rotation cadences (defaults): JWT signing key 90 d; DB/Redis credentials per environment policy (environments.md); tenant DEKs on demand + on suspicion (ADR-0016). Every rotation is an audit-log platform event.

## 8. Encryption

| Layer | Rule |
|---|---|
| In transit | §4 (TLS at edges + managed-store connections) |
| At rest — infrastructure | Managed PG + GCS + Redis provider encryption (Google-managed keys; CMEK post-V1 per ADR-0009) |
| At rest — mobile | SQLCipher mandatory, key in Keychain/Keystore (ADR-0003, mobile-flutter §6) |
| Field-level | ADR-0016 (**Accepted**): AES-256-GCM app-layer for NIK/NPWP/BPJS numbers/bank data; HMAC blind indexes (NIK + NPWP only) for equality; per-tenant DEK under KMS KEK; crypto-shredding on tenant offboarding; individual erasure purge-based. Column list finalized in employee.md |
| Redis contents | Ids, counters, rate-limit state, sessions bookkeeping, idempotency response envelopes. The envelopes are transient business data (7 d) — Redis therefore sits in the same trust class as the database: private network, auth required, TLS, no public exposure, and **never** stores the ADR-0016 field set in any form |

## 9. UU PDP obligations map

Tenant = data controller for employee data; the platform operator = processor (contractual DPA is a business artifact, out of handbook scope). Engineering obligations and owners:

| Obligation | Implementation | Owner |
|---|---|---|
| Lawful basis / purpose limitation | Processing scoped to employment administration; module docs define per-feature data use; attendance selfie processing disclosed at first clock-in with recorded acknowledgment | attendance.md, employee.md |
| Data subject access | Self-service profile + payslip/document access; exportable on request via admin | employee.md, reports.md |
| Correction | Self-service data-change requests through the approval flow | employee.md |
| Erasure / retention limits | Retention windows + purge jobs (database-conventions §4.4); post-employment purges honor statutory floors; tenant offboarding = export + crypto-shred (ADR-0016) + storage purge | database-conventions, ADR-0016, system-administration.md |
| Security of processing | This document, in total | — |
| Breach handling | Detection via ADR-0011 alerting + audit log; incident runbook with notification duty to the authority and subjects within the statutory window. **Discharged 2026-08-04** — observability.md §14: six enumerated detection signals including *a report from outside*, containment in a fixed order whose third step is **delete nothing else**, scoping **from the audit log** because 30 days of telemetry cannot scope a breach, notification through the controller with the clock starting **at detection rather than confirmation**, and the window and addressees left behind the ⚠️ VERIFY marker below | observability.md §14 |
| Records of processing | Audit log (who/what/when/before/after, 2 y hot + archive) | audit-log.md |
| Data residency | `asia-southeast2` for DB, storage, backups (A-003) | environments.md |

> ⚠️ VERIFY: confirm against current Indonesian regulation before implementation. — UU PDP 27/2022 specifics: breach-notification window and addressees, consent vs legitimate-interest basis for attendance selfies, post-employment retention ceilings vs statutory floors.

## 10. Sensitive-key redaction registry

The single list consumed by Pino `redact`, Sentry `beforeSend` (all three SDKs), and span-attribute lint (ADR-0011). Matching is case-insensitive on key names, recursive:

`password`, `passwordHash`, `currentPassword`, `newPassword`, `pin`, `authorization`, `cookie`, `token`, `accessToken`, `refreshToken`, `idempotencyKey`-stored-bodies, `nik`, `npwp`, `bpjsKesehatanNumber`, `bpjsKetenagakerjaanNumber`, `bankAccountNumber`, `bankAccountHolder`, `ptkpStatus`, any key matching `/amount|salary|wage/i`, `selfieUrl`/signed-URL query strings, `fcmToken`, `payload` (outbox/job payloads logged by id only).

Adding a sensitive field anywhere in the system = adding it here in the same change (same-session registry rule). Telemetry carries identifiers only (ADR-0011); this registry is the enforcement list, not the policy.

## 11. Supply chain

- Lockfiles committed in all three repos; automated dependency PRs (Renovate) with grouped minor updates.
- CI gates: `npm audit` / `dart pub` advisories — build fails on high/critical with no accepted-exception entry (exceptions live in the repo, expiring, with reason).
- Container images: pinned base digests, Trivy scan in CI, fail on high/critical fixable.
- No install scripts from untrusted packages (`--ignore-scripts` where feasible); shadcn/ui code is vendored by design (admin-nextjs §9).
- **SAST: Semgrep OSS CLI** for the two TypeScript repositories, blocking merge on `ERROR` and advisory on `WARNING`; Flutter gets strict `dart analyze` and **no real SAST**, stated plainly rather than implied (`docs/07-operations/ci-cd.md` §9, A-108). CodeQL is rejected: on private repositories it requires GitHub Advanced Security, a per-committer licence for a team of this size.
- Accepted exceptions live in `security-exceptions.yml`, mirroring `test-waivers.yml` — advisory id, package, reason, reviewer, **expiry date** — and an expired entry fails the pipeline (testing-strategy §12's quarantine rule, same discipline).
- **Scans are re-run weekly against the currently deployed digests.** A build-time scan judges an image once, forever; a CVE published after the build stays invisible until the next deploy, and a stable service may not redeploy for weeks.
- Third-party GitHub Actions are pinned by commit SHA, never by tag — a tag is mutable and an action runs with repository secrets in scope.
- Pipeline detail: ci-cd.md §9 (gates C1–C5), §6 (image tagging and base pinning), §11 (CI identity and secret inventory).

## 12. Mobile-specific posture

- Secure storage rules per ADR-0004/mobile-flutter §9; nothing sensitive in SharedPreferences, logs, or crash breadcrumbs (registry §10 applies to the Sentry Flutter SDK).
- **Screen capture blocked** (`FLAG_SECURE` / iOS equivalent) on payslip and punch-selfie screens — cheap, targeted; not app-wide (screenshots of rosters are legitimate).
- **No certificate pinning in V1** — reasoned: pinning + long-lived offline installs + managed cert rotation = self-inflicted outage risk that exceeds the MITM risk remaining after TLS 1.2+/HSTS on a public CA; revisit post-GA alongside Play Integrity (D10). Root/jailbreak detection: basic signals only (D10), never a hard block in V1.
- Release builds: obfuscation on (Dart `--obfuscate`), no debug endpoints, no cleartext traffic permitted (Android `usesCleartextTraffic=false`, iOS ATS default).

## 13. Enforcement

| Gate | Where |
|---|---|
| Headers/CSP present on responses | integration tests (backend + admin) |
| Leak-test matrix **L1–L9** per module | `docs/07-operations/testing-strategy.md` §5.1 — the `describeTenantIsolation` kit (matrix defined in multi-tenancy §5; L7 added 2026-08-02, L8/L9 2026-08-04) |
| Redaction registry ↔ Pino/Sentry configs in sync | CI check comparing configs against §10 list |
| Dependency/image scans | `docs/07-operations/ci-cd.md` §9 — C1 advisories and C2 SAST block merge, C4 Trivy blocks the staging deploy, C5 re-scans deployed digests weekly |
| Rate-limit + lockout behavior | authentication.md test scenarios |
| No secret in `NEXT_PUBLIC_`/dart-define/source | secret-scanning hook (gitleaks) in CI — `docs/07-operations/ci-cd.md` §9 gate C3, over the pull request's full history, blocking merge |
