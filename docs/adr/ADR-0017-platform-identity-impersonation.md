# ADR-0017: Platform Identity and Impersonation

Status: **Proposed** (grilled 2026-08-04 during `docs/06-modules/system-administration.md`; awaiting user review) · Date: 2026-08-04 · Deciders: product owner + engineering

## Context

`platform_users` has existed since core-schema §4 with an `email` and a `password_hash` and no specification of how either is used. ADR-0005 established that Super Admin is *"a platform-level user outside tenant RBAC"* entering tenants *"only via audited impersonation"*; ADR-0002 said impersonation *"issues a short-lived token carrying the target `tenantId` + impersonation claims"* and deferred the mechanics to the module doc; ADR-0004 specified sessions for **tenant** users on mobile and web, with device binding, a tenant picker, and Drift-backed clients. Nothing specified how a platform user logs in, what session backs them, how long an impersonation token lives, or how it ends.

Two facts make this more than a documentation gap. First, a platform credential reaches **every tenant**: at the D1 design ceiling that is 500 companies and up to five million employees' NIK, NPWP, salary, and bank data. Second, A-007 records *"MFA (TOTP/OTP) is out of V1"* and ADR-0004's session-model bullet restates it — but A-007's stated evidence is *"Spec §5.8 lists password/PIN/biometric/remember-device but no MFA"*, and §5.8 is the tenant login surface. Applied to a surface that did not exist when it was written, A-007 would leave the one credential that bypasses tenant isolation as the one credential with a single factor.

`sessions` cannot be reused: it is tenant-class, carries `tenant_id NOT NULL`, and lives under the RLS policy protecting every tenant session in the system.

## Decision

### 1. Platform identity is a second, disjoint identity class

`platform_users` authenticate through their own routes under `/api/v1/platform/auth/*`, backed by a new platform-class table `platform_sessions` (no `tenant_id`, no RLS, no device binding — the console is web-only). ADR-0004's session law is **applied unchanged**: 15-minute access JWT, rotating single-use refresh, session row as the revocation point, BR-AUTH-006's liveness predicate, BR-AUTH-004's family revocation on reuse.

Two deliberate divergences from ADR-0004, both narrow:

- **No rotation grace window.** BR-AUTH-005's 10-second window exists for legitimate multi-tab races on a product surface used by thousands. The console is one tab used by a handful of operators; here a reused refresh token means theft.
- **No `mfa_verified` column.** A `platform_sessions` row is minted only by the TOTP leg, so its existence is the proof. A boolean that is `true` on every row is a column that can be wrong.

### 2. Token audiences are separated in both directions

Platform access tokens carry `typ: 'platform_access'` and **no `tenantId`** claim. A tenant token presented to a platform route fails, and a platform token presented to a tenant route fails. One signing key, two audiences, and no guard that trusts the other's.

### 3. TOTP is mandatory for platform users, and only for platform users

Every platform user enrols on first login and cannot opt out; there is no remember-device and no trusted-device marker. `platform_users` gains `totp_secret` (ADR-0016 `encryptedText`) and `totp_enrolled_at`. An unenrolled user can reach exactly one route — enrolment.

**A-007 is narrowed, not reversed.** It continues to hold verbatim for tenant users: employees, managers, and every tenant admin role log in with password and device-local PIN/biometric, and TOTP for them stays the first fast-follow. What changes is only its scope, which was never argued to cover a surface that had no specification.

### 4. Impersonation is a 30-minute, non-renewable, single-occupancy token

- Targets a **named, `active` user in a named tenant**. There is no "enter the tenant" abstraction, because BR-AUTHZ-013 resolves a specific person's permission set.
- Requires a **free-text reason of at least 20 characters**, recorded on the session and in every audit row.
- Lives **30 minutes with no refresh path**. The TTL is the entire session. This diverges from ADR-0004's 15-minute horizon deliberately: 15 minutes is right when a refresh path sits behind it and it is merely the re-authentication interval, and wrong when it is the whole working session. Re-entry after expiry is a fresh act with a fresh reason and a fresh audit row — which is the point, because the trail then carries a human justification at least twice an hour rather than one reason covering a whole day.
- **One live session per platform user**, by partial unique index.
- **Revoking the parent `platform_sessions` row ends every impersonation minted from it, in the same transaction.** Without the cascade, killing a compromised platform account would leave a live token inside a customer tenant for up to thirty more minutes.
- Ends three ways — exited, expired, revoked — and liveness is computed (`ended_at IS NULL AND now < expires_at`) rather than swept by a cron.

### 5. Impersonation bypasses tenant status, and nothing else

`TenantStatusGuard` (multi-tenancy §2) is bypassed for `suspended` and `archived` tenants: fixing the cause of a suspension and servicing an export request against an archived tenant are both the job. This is the only bypass of that guard anywhere in the system.

### 6. No action deny-list

BR-AUTHZ-013's ceiling — the impersonated user's own permission set — is the entire boundary. The control is not prevention but visibility: dual-identity audit rows on every mutation (BR-AUD-008), `platform.impersonated_request` as a registered sensitive read on every request, a mandatory notification to the tenant's System Administrators at session start, a non-dismissible banner with a live countdown, and a 30-minute ceiling.

The consequence is stated rather than hidden: **an operator impersonating a Payroll Admin can finalize a payroll run.**

### 7. Platform-user administration is not an API surface

Creating, disabling, or recovering a platform user is a deploy-time operations act, not a console form. Three things follow: every remaining console action has a tenant target, so audit-log §9's cross-tenant-platform-operations rule covers all of them with no change to `audit_logs`; a compromised platform session cannot mint itself a persistent second identity; and there is no self-service TOTP recovery in V1.

## Alternatives considered

- **Extend ADR-0004 in place rather than write this ADR.** Rejected: ADR-0004 is titled for sessions and *device management* and reasons throughout about mobile clients, tenant pickers, and Drift. The alternatives that need recording here — staff SSO, IP allowlisting, no-MFA-at-all — are not ADR-0004's alternatives, and burying a second identity class inside it would hide the decision from exactly the reader who needs it.
- **No MFA for platform users, consistent with a broad reading of A-007.** Rejected: every compensating control available — audit rows, notifications, short sessions, mandatory reasons — is **detective**. A phished platform password with no second factor yields full read and write across all tenants, and the audit log then documents the incident beautifully. The cost of the preventive control is one column and one library.
- **IP allowlisting instead of TOTP.** Rejected as the primary control: it binds support to fixed egress and has no answer for a laptop at a customer site. Retained as a future addition, not a substitute.
- **Staff SSO (OIDC) now.** Rejected for V1: it makes an external identity provider a hard dependency of the break-glass path used when things are already broken, for an operator population D13 describes as small. `platform_sessions` is IdP-agnostic, so this remains a clean addition.
- **Reuse `sessions` with a nullable `tenant_id`.** Rejected: amends core-schema and punches a hole in the RLS policy on the table holding every tenant session — the exact class of change ADR-0002 exists to forbid.
- **Stateless platform JWTs with no session table.** Rejected: no revocation. A leaked platform token would stay valid to its horizon with nothing to press during an incident.
- **Read-only impersonation.** Rejected: contradicts BR-AUD-008, which is explicitly built to record impersonated *mutations*, and support that cannot fix anything is not support.
- **Tenant-scoped impersonation without a named target user.** Rejected: BR-AUTHZ-013 would have no permission set to resolve, and the audit trail would lose the answer to "acting as whom".
- **A deny-list of irreversible actions during impersonation.** Rejected: every module would have to declare an impersonation-forbidden set, complete only until the next module ships, and its real failure mode is the destructive action nobody thought to list. Visibility over an incomplete prohibition.
- **Two platform tiers (`super_admin` / `support`) now.** Rejected as speculative. The route annotations exist from day one, so a tier is a grant table later rather than a re-plumb.

## Tradeoffs

Mandatory TOTP makes the platform login strictly harder than the product's own, which is an inconsistency a reader will notice — the answer is that the two credentials protect different blast radii, and this ADR is the place that says so. No self-service TOTP recovery means a lost device is an operations ticket; correct at the operator count D13 implies, wrong at fifty. The 30-minute non-renewable impersonation session costs an operator a re-entry roughly twice an hour during long debugging, bought deliberately in exchange for a reason stamp at the same cadence. One live impersonation per operator forbids comparing two tenants side by side. No deny-list leaves genuinely destructive tenant actions reachable by support, mitigated only by visibility. Keeping platform-user administration out of the API means adding an operator requires a deploy, which is friction on the one path that most needs an audit trail — accepted precisely because that trail has nowhere tenant-scoped to live.

## Consequences

- `docs/06-modules/system-administration.md` implements all seven decisions: `platform_sessions`, `impersonation_sessions`, the `platform_users` TOTP columns, BR-ADM-001 through BR-ADM-023, and UC-ADM-001, 002, 007, and 008.
- `docs/adr/ADR-0004-auth-sessions-device-management.md` gains a pointer line scoping its MFA sentence to tenant users; its decisions are otherwise unchanged and unsuperseded.
- `ASSUMPTIONS.md` A-007 is narrowed to tenant users, with the platform carve-out named and this ADR cited.
- `docs/03-standards/security-standards.md` §1's *"gap: no MFA in V1"* row is qualified: the gap is tenant-side only.
- `docs/03-standards/error-catalog.md` registers `ADM_TOTP_INVALID`, `ADM_IMPERSONATION_ACTIVE`, and `ADM_IMPERSONATION_ENDED`.
- `docs/05-platform/notification.md` §4.2 registers `sysadmin.impersonation_started` as a mandatory template.
- `docs/05-platform/audit-log.md` §4.3's `platform.impersonated_request` row is now fully attributed; §4.2 gains a note on why this module's three tables are absent from the channel-1 registry.
- The leak-test matrix (multi-tenancy §5) gains a platform-context case: a query from a platform session against any tenant-class table returns zero rows.

## Future considerations

Staff SSO (OIDC) when the operator population justifies a directory; `platform_sessions` is IdP-agnostic by design and the impersonation model is unaffected. TOTP backup codes and a self-service recovery path, which become necessary at the same headcount. WebAuthn/passkeys for the console, a strictly better second factor once the operator fleet has hardware. IP allowlisting on `/api/v1/platform/*` once egress is predictable, as an addition rather than a replacement. A `support` tier over the existing route annotations. Two-person authorization for any future destructive operation — which is the reason such an operation is a runbook and not an endpoint today.
