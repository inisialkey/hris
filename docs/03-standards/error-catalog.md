# Error Catalog

Status: Active (Phase 1 seed — grows every module) · Related: `docs/adr/ADR-0006-result-pattern-error-handling.md` (philosophy), `docs/adr/ADR-0007-api-versioning-response-envelope.md` (envelope), `docs/03-standards/naming-conventions.md` §4 (grammar + prefix registry)

The single registry of every error code in the system. A code that is not in this file does not exist: clients may not branch on it, servers may not emit it, tests may not assert it. Grammar and module prefixes live in naming-conventions §4; this catalog registers concrete codes.

## 1. Registration protocol

1. **Same session rule (CLAUDE.md):** the doc that introduces a code adds its row here in the same session. Module docs list their codes in §11 and link here — this file is authoritative.
2. **Codes are immortal** (ADR-0006): never renamed, reused, or deleted. Retirement = move to the Deprecated section (**§32 as of 2026-08-04** — it renumbers with every module arrival, so it is named rather than numbered elsewhere in this file) with a replacement pointer; the wire may still emit it during the deprecation window.
3. One violated rule (`BR-*`) → one code. No grab-bag codes; no HTTP-status-shaped codes (`X_BAD_REQUEST` is banned).
4. Each code ships an `errors.<CODE>` i18n entry in **both** locales (D12) in the same change; CI fails on missing keys.
5. Prefix blocks are owned: modules own their prefix; `VAL_`/`SYS_` are platform-owned — additions to them need a cross-module reason.
6. Phase 4 audit prunes orphans: every code must be referenced by at least one module doc §11 or ADR.
7. **Reachability (added 2026-08-04):** every registered code must be **asserted by at least one test**, gated in `hris-api` — `docs/07-operations/testing-strategy.md` §4.4, waived only through the same `test-waivers.yml` mechanism the BR gate uses. Item 4 proves a code has translations and item 6 proves it has a written owner; neither proves it can occur. A code no code path can raise is a permanent orphan carrying two locale strings for a condition that no longer exists, and it is also why use cases need no traceability gate of their own: exception flows terminate in registered codes, and a code tag cannot be satisfied by a test title the way a `UC-*` tag can.

## 2. Entry format and envelope

Every row: **Code · HTTP · Description · details payload · Source** (the doc/rule that raises it). Message key is always `errors.<CODE>` — never listed separately. The wire shape is fixed by ADR-0007:

```json
{
  "success": false,
  "error": {
    "code": "AUTH_REFRESH_REUSED",
    "message": "Developer-facing English",
    "messageKey": "errors.AUTH_REFRESH_REUSED",
    "details": null,
    "requestId": "01890b2e-..."
  }
}
```

Default HTTP semantics (a code may override with justification in its row): `400` malformed transport · `401` authentication · `403` permission · `404` absent **or hidden** · `409` state/conflict · `422` validation · `429` rate limit · `5xx` infrastructure.

**Existence-hiding rule:** data-scope denials (ADR-0005 — e.g. a manager probing another team's request id) return 404 with `SYS_NOT_FOUND`, never 403 — a 403 confirms existence. `SYS_NOT_FOUND` is the default code for every entity miss *and* every hidden-scope denial (same code either way — non-committal by design; grilled 2026-08-02). A module mints its own `*_NOT_FOUND` code only when a client must branch on that specific miss (none exist yet). Module docs must apply this rule to every data-scoped resource.

## 3. `SYS_` — infrastructure (platform-owned)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `SYS_INTERNAL` | 500 | Unexpected failure; global exception filter only. Never carries internals — `requestId` is the support handle | — | ADR-0006 |
| `SYS_ROUTE_NOT_FOUND` | 404 | No such route/version | — | ADR-0007 |
| `SYS_NOT_FOUND` | 404 | Entity absent **or outside data scope** (existence hiding, §2) — the default entity-404 code | — | §2 rule (grilled 2026-08-02) |
| `SYS_RATE_LIMITED` | 429 | Rate limit exceeded; `Retry-After` header set | `{ retryAfterSeconds }` | security-standards §3 |
| `SYS_SERVICE_UNAVAILABLE` | 503 | Dependency down or maintenance window | — | ADR-0011 / environments |
| `SYS_IDEMPOTENCY_IN_FLIGHT` | 409 | Same `Idempotency-Key` currently executing; retry after it settles | — | ADR-0007 |

## 4. `VAL_` — validation (platform-owned)

Top-level codes:

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `VAL_VALIDATION_FAILED` | 422 | Transport/DTO validation failed; the only top-level code for schema rejections | array of field entries (ADR-0007 shape), each with a field-level code below | ADR-0006 |
| `VAL_IDEMPOTENCY_PAYLOAD_MISMATCH` | 409 | `Idempotency-Key` reused with a different payload hash | `{ key }` | ADR-0007 |
| `VAL_INVALID_CURSOR` | 400 | Cursor param malformed or expired | — | ADR-0007 |

Field-level codes — appear only inside `details[].code`, never top-level; `details[].params` feeds i18n placeholders:

| Code | Description | params |
|---|---|---|
| `VAL_REQUIRED` | Field missing/empty | — |
| `VAL_INVALID_FORMAT` | Pattern/type mismatch (email, UUID, date string, decimal string) | `{ expected }` |
| `VAL_INVALID_ENUM` | Value outside allowed set | `{ allowed }` |
| `VAL_TOO_SHORT` / `VAL_TOO_LONG` | Length bounds | `{ min }` / `{ max }` |
| `VAL_OUT_OF_RANGE` | Numeric/date bounds | `{ min, max }` |
| `VAL_DATE_RANGE_INVALID` | `from`/`to` pair inverted or overlapping a constraint | `{ from, to }` |
| `VAL_DUPLICATE` | Value collides with an existing live record (per-field uniqueness) | `{ field }` |

## 5. `AUTH_` — authentication (owner: `docs/05-platform/authentication.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong email/password. One code for unknown email *and* wrong password — no account enumeration | — | ADR-0004 |
| `AUTH_ACCOUNT_LOCKED` | 403 | Lockout after failed attempts; unlock via reset or timeout | `{ retryAfterSeconds }` | ADR-0004 |
| `AUTH_TOKEN_INVALID` | 401 | Access token malformed/signature failure | — | ADR-0004 |
| `AUTH_TOKEN_EXPIRED` | 401 | Access token past `exp`; client should refresh | — | ADR-0004 |
| `AUTH_REFRESH_INVALID` | 401 | Refresh token unknown/expired/revoked session | — | ADR-0004 |
| `AUTH_REFRESH_REUSED` | 401 | Rotated token replayed — **session family revoked**; force full re-login | — | ADR-0004 |
| `AUTH_SESSION_REVOKED` | 401 | Session killed (self-service, admin, or device revocation) | `{ reason }` | ADR-0004 |
| `AUTH_DEVICE_REVOKED` | 401 | Device registry status `revoked` | — | ADR-0004 |
| `AUTH_DEVICE_LIMIT_REACHED` | 409 | `auth.max_active_devices` hit; replacement flow required | `{ maxDevices }` | ADR-0004 |
| `AUTH_TENANT_SUSPENDED` | 403 | Tenant status blocks login/refresh | — | ADR-0002 |
| `AUTH_PASSWORD_POLICY_VIOLATION` | 422 | New password fails tenant policy | field entries (policy rules as field-level codes) | ADR-0004 |
| `AUTH_RESET_TOKEN_INVALID` | 401 | Reset token unknown, expired, or already used — one code, no distinction leaked | — | authentication.md BR-AUTH-010 |
| `AUTH_INVITE_TOKEN_INVALID` | 401 | Invite token unknown, expired, or already used | — | authentication.md BR-AUTH-010 |

**Field-level codes** inside `AUTH_PASSWORD_POLICY_VIOLATION` entries (registered 2026-08-06 — entry codes, never top-level responses, so they add no rows above): `AUTH_PASSWORD_BREACHED` — the password is on the platform breached-list; `AUTH_PASSWORD_DERIVED` — the password contains the account's email local part or the tenant name. Length violations reuse `VAL_TOO_SHORT` / `VAL_TOO_LONG` (§4).

Tenant-selection after multi-tenant email match is a **success flow** (200 + choices), not an error — no code.

## 6. `AUTHZ_` — authorization (owner: `docs/05-platform/authorization-rbac.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `AUTHZ_PERMISSION_DENIED` | 403 | Required permission key absent from effective set (company scope included) | `{ permission }` | ADR-0005 |
| `AUTHZ_SYSTEM_ROLE_IMMUTABLE` | 409 | Edit/delete attempted on a system role template | — | authorization-rbac.md BR-AUTHZ-003 |
| `AUTHZ_ROLE_IN_USE` | 409 | Role delete blocked by live assignments | `{ assignmentCount }` | authorization-rbac.md BR-AUTHZ-005 |
| `AUTHZ_LAST_ADMIN` | 409 | Revoke/delete would leave no tenant-wide assignment admin | — | authorization-rbac.md BR-AUTHZ-006 |

Deliberately one denial code: which gate failed (tenant-wide vs company-scoped) is diagnosable server-side via audit/log, and finer client-facing distinctions leak authorization topology. Data-scope misses use the 404 existence-hiding rule (§2), not `AUTHZ_`.

## 7. `SYNC_` — offline sync engine (owner: `docs/02-architecture/offline-sync.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `SYNC_VERSION_CONFLICT` | 409 | Mutable-owned-record write carried a stale `version`; op → `conflict` on device, server state applied | `{ current }` — the current server row | ADR-0003, offline-sync §4 |
| `SYNC_OFFLINE` | — | **Client-side only, never on the wire:** online-only action (MSS approval) attempted without connectivity; mobile repositories emit it as the `Failure` code | — | ADR-0003, offline-sync §11 |

## 8. `APRV_` — approval engine (owner: `docs/05-platform/approval-engine.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `APRV_NO_CHAIN_CONFIGURED` | 422 | Submit found no matching chain (default missing or inactive for the request type) | `{ requestType }` | approval-engine.md BR-APRV-002 |
| `APRV_NOT_AN_APPROVER` | 403 | Actor holds the module permission but is not a live assignee/delegate of the active step (two-gate) | — | approval-engine.md BR-APRV-012 |
| `APRV_STEP_ALREADY_DECIDED` | 409 | Optimistic-version loss on a concurrent assignee/step action | — | approval-engine.md BR-APRV-013 |
| `APRV_INSTANCE_NOT_ACTIONABLE` | 409 | Action attempted on a terminal instance | `{ status }` | approval-engine.md BR-APRV-013 |
| `APRV_COMMENT_REQUIRED` | 422 | Reject/return without a comment | — | approval-engine.md BR-APRV-008 |
| `APRV_SELF_DELEGATION` | 422 | Delegation target is the delegator | — | approval-engine.md UC-APRV-006 |
| `APRV_DELEGATION_OVERLAP` | 409 | A live delegation already covers the date range / request-type scope | `{ conflictingDelegationId }` | approval-engine.md UC-APRV-006 |

## 9. `SET_` — settings (owner: `docs/05-platform/settings.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `SET_LEVEL_NOT_ALLOWED` | 422 | Value write at a level outside the definition's `allowedLevels` | `{ allowedLevels }` | settings.md BR-SET-002 |
| `SET_NOT_EFFECTIVE_DATED` | 422 | Future `effectiveFrom` on a non-effective-dated key | — | settings.md BR-SET-003 |
| `SET_HISTORY_IMMUTABLE` | 409 | Edit/delete of a value row already effective | — | settings.md BR-SET-005 |
| `SET_SCHEDULE_OVERLAP` | 409 | A scheduled future row already exists for the key + scope | `{ existingValueId }` | settings.md BR-SET-006 |

## 10. `NTF_` — notification (owner: `docs/05-platform/notification.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `NTF_TEMPLATE_MANDATORY` | 422 | Preference toggle attempted on a mandatory (preference-immune) template | `{ templateKey }` | notification.md BR-NTF-005 |

## 11. `INB_` — inbox (owner: `docs/05-platform/inbox.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `INB_NOT_ACKNOWLEDGEABLE` | 422 | Acknowledge attempted on an approval-task item | — | inbox.md BR-INB-008 |
| `INB_ITEM_CLOSED` | 409 | Acknowledge on a closed item (announcement retracted) | `{ closedReason }` | inbox.md BR-INB-008 |

## 12. `DOC_` — document storage (owner: `docs/05-platform/document-storage.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `DOC_TYPE_NOT_ALLOWED` | 422 | Declared mime outside the category whitelist | `{ allowed }` | document-storage.md UC-DOC-001 |
| `DOC_SIZE_EXCEEDED` | 422 | Declared or verified size over the effective category cap | `{ maxBytes }` | document-storage.md BR-DOC-004 |
| `DOC_UPLOAD_INCOMPLETE` | 422 | Confirm found no (or empty) staged object | — | document-storage.md BR-DOC-004 |
| `DOC_MIME_MISMATCH` | 422 | Magic-byte sniff contradicts the declared mime | `{ declared, sniffed }` | document-storage.md BR-DOC-005 |
| `DOC_DELETE_FORBIDDEN` | 409 | Delete on a non-client-deletable category (statutory retention / system artifact) | `{ category }` | document-storage.md BR-DOC-009 |

## 13. `IMP_` — import/export (owner: `docs/05-platform/import-export.md`)

Job-level codes only — row-level errors inside workbooks use field-level `VAL_*` + module codes (import-export.md BR-IMP-009).

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `IMP_TEMPLATE_STALE` | 422 | Template version marker missing or mismatched | `{ expected, found }` | import-export.md BR-IMP-006 |
| `IMP_FILE_UNREADABLE` | 422 | Workbook structurally unparseable (corrupt, protected, wrong sheets) | — | import-export.md UC-IMP-002 |
| `IMP_ROW_CAP_EXCEEDED` | 422 | Row count over `import-export.max_rows` | `{ maxRows }` | import-export.md BR-IMP-007 |
| `IMP_ALREADY_RUNNING` | 409 | Active import already exists for tenant + type | `{ activeJobId }` | import-export.md BR-IMP-005 |
| `IMP_INVALID_STATE` | 409 | Confirm/cancel outside `awaiting_confirmation` | `{ status }` | import-export.md UC-IMP-003/004 |

## 14. `HOL_` — holiday (owner: `docs/06-modules/holiday.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `HOL_NOTHING_TO_OVERRIDE` | 422 | `observed=false` row with no broader `(date, kind)` row to negate | — | holiday.md BR-HOL-004 |
| `HOL_PERIOD_LOCKED` | 409 | Calendar mutation touching a date inside a locked attendance/payroll period | `{ periodId }` | holiday.md BR-HOL-008 |

## 15. `ORG_` — organization (owner: `docs/06-modules/organization.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `ORG_IN_USE` | 409 | Archive blocked by live dependents (employees, role assignments, child structure, holders) | `{ blockers: [{ type, count }] }` | organization.md BR-ORG-006 |
| `ORG_CYCLE_DETECTED` | 422 | Department parent or position reports-to edit creates a cycle or exceeds depth 6 | — | organization.md BR-ORG-004 |
| `ORG_CROSS_COMPANY` | 422 | Assignment references a position/branch outside the employee's company | — | organization.md BR-ORG-002 |
| `ORG_ASSIGNMENT_OVERLAP` | 409 | Assignment range collides with existing placement history | `{ conflictingAssignmentId }` | organization.md BR-ORG-002 |
| `ORG_PERIOD_LOCKED` | 409 | Assignment effective inside a locked attendance/payroll period | `{ periodId }` | organization.md BR-ORG-008 |

## 16. `EMP_` — employee (owner: `docs/06-modules/employee.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `EMP_STILL_ACTIVE` | 409 | Delete attempted on a non-terminal-status employee | — | employee.md BR-EMP-013 |
| `EMP_STATUS_TRANSITION_INVALID` | 409 | Status transition outside the machine, duplicate terminal schedule, or resignation retract after effectiveness | `{ currentStatus }` | employee.md BR-EMP-005/006/010 |
| `EMP_CONTRACT_OVERLAP` | 409 | Contract range collides with an existing contract row (exclusion constraint) | `{ conflictingContractId }` | employee.md BR-EMP-007 |
| `EMP_DATA_CHANGE_PENDING` | 409 | A pending data-change request already exists for the employee + fieldGroup | `{ pendingRequestId }` | employee.md BR-EMP-009 |
| `EMP_RESIGNATION_PENDING` | 409 | A pending resignation already exists for the employee | `{ pendingRequestId }` | employee.md BR-EMP-010 |

## 17. `SHF_` — shift (owner: `docs/06-modules/shift.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `SHF_SHIFT_WINDOW_OVERLAP` | 409 | A write would leave two punch windows overlapping for one employee — punch-to-shift matching must stay unambiguous | `{ employeeId?, date?, dayIndex?, conflictingShiftId }` | shift.md BR-SHF-006 |
| `SHF_ASSIGNMENT_OVERLAP` | 409 | Roster-assignment range collides with existing history, or a second company default would be live (exclusion constraint) | `{ conflictingAssignmentId }` | shift.md BR-SHF-007 |
| `SHF_IN_USE` | 409 | Shift or pattern archive blocked by live dependents | `{ blockers: [{ type, count }] }` | shift.md BR-SHF-011 |
| `SHF_PERIOD_LOCKED` | 409 | Roster or definition write touching a date inside a locked attendance/payroll period | — | shift.md BR-SHF-009 |

## 18. `ATT_` — attendance (owner: `docs/06-modules/attendance.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `ATT_OUTSIDE_GEOFENCE` | 422 | Online punch outside the branch radius while `attendance.geofence_policy = strict` — queued punches are quarantined instead, never refused | `{ distanceMeters, radiusMeters }` | attendance.md BR-ATT-005/006 |
| `ATT_SELFIE_REQUIRED` | 422 | Online punch without a committed `punch_selfie` while the policy requires one | — | attendance.md BR-ATT-008 |
| `ATT_QR_INVALID` | 422 | Missing, malformed, wrong-branch, or stale-key branch QR token | `{ branchId }` | attendance.md BR-ATT-007 |
| `ATT_NO_PLACEMENT` | 422 | Punch from an employee with no org placement as-of the date — no branch, no timezone, no fence to evaluate | — | attendance.md BR-ATT-006 |
| `ATT_PERIOD_LOCKED` | 409 | Write touching a date inside a locked attendance period | `{ periodId }` | attendance.md BR-ATT-014 |
| `ATT_PERIOD_OVERLAP` | 409 | Period range collides with an existing period for the company (exclusion constraint) | `{ conflictingPeriodId }` | attendance.md BR-ATT-014 |
| `ATT_PERIOD_IN_USE` | 409 | Unlock refused while payroll holds a non-draft run over the range | `{ blockers: [{ type, count }] }` | attendance.md BR-ATT-014 |
| `ATT_CORRECTION_PENDING` | 409 | A pending correction already exists for the employee and date | `{ pendingRequestId }` | attendance.md BR-ATT-016 |

`ATT_PERIOD_LOCKED` is the origin code of the lock family: `HOL_PERIOD_LOCKED` (§14), `ORG_PERIOD_LOCKED` (§15), and `SHF_PERIOD_LOCKED` (§17) are the same condition detected by consumers of `PeriodLockPort` (attendance.md §4.2). Each module keeps its own code so clients branch per surface.

## 19. `LVE_` — leave (owner: `docs/06-modules/leave.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `LVE_INSUFFICIENT_BALANCE` | 422 | `balance`-mode request exceeds the available balance (accrued + carried in + adjusted − used − expired − pending) | `{ availableDays, requestedDays }` | leave.md BR-LVE-002/006 |
| `LVE_QUOTA_EXCEEDED` | 422 | `per_request`-mode request over `max_days_per_request` or `max_occurrences_per_period` | `{ maxDays, requestedDays }` or `{ maxOccurrences }` | leave.md BR-LVE-002 |
| `LVE_OVERLAPPING_REQUEST` | 409 | Date range touches another pending/approved request for the employee (exclusion constraint) | `{ conflictingRequestId }` | leave.md BR-LVE-014 |
| `LVE_TYPE_NOT_ELIGIBLE` | 422 | Gender restriction or minimum-service rule refuses the type for this employee | `{ reason }` | leave.md BR-LVE-013 |
| `LVE_NOTICE_TOO_SHORT` | 422 | Start date outside the type's notice / backdate window | `{ minNoticeDays, maxBackdateDays }` | leave.md BR-LVE-013 |
| `LVE_ATTACHMENT_REQUIRED` | 422 | Type requires an attachment and none is committed | — | leave.md BR-LVE-013 |
| `LVE_NO_WORKING_DAYS` | 422 | Range resolves to zero counting dates — nothing to charge, and usually a roster gap | — | leave.md BR-LVE-003 |
| `LVE_PERIOD_LOCKED` | 409 | Request, cancellation, or balance adjustment touching a date inside a locked attendance period | `{ periodId, date }` | leave.md BR-LVE-015 |
| `LVE_CANCEL_WINDOW_CLOSED` | 409 | Requester cancelling an approved request on or after its start date | `{ startDate }` | leave.md BR-LVE-016 |
| `LVE_REQUEST_ALREADY_DECIDED` | 409 | Action on a request that is no longer `pending` — single or per-item inside a bulk batch | `{ status }` | leave.md BR-LVE-016, api-standards §10 |
| `LVE_TYPE_IN_USE` | 409 | Leave-type archive blocked by live balances or non-terminal requests | `{ blockers: [{ type, count }] }` | leave.md UC-LVE-012 |

`LVE_PERIOD_LOCKED` joins the lock family described in §18. `LVE_INSUFFICIENT_BALANCE` (ADR-0006, ADR-0007, naming §4/§10, coding-standards-nestjs §3) and `LVE_REQUEST_ALREADY_DECIDED` (api-standards §10) were used as illustrative examples across the handbook before any module owned them — both are now registered and the illustrations are real.

## 20. `OVT_` — overtime (owner: `docs/06-modules/overtime.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `OVT_NOT_ELIGIBLE` | 422 | Employee's job level is on the tenant's overtime-exempt list — no overtime pay entitlement | `{ jobLevelId }` | overtime.md BR-OVT-003 |
| `OVT_NO_BASELINE` | 422 | Date has no overtime baseline: covered by approved leave, unscheduled, unplaced, or the window starts inside the shift | `{ date, reason }` | overtime.md BR-OVT-005 |
| `OVT_CAP_EXCEEDED` | 422 | Daily or weekly statutory maximum breached by the request's working-day hours | `{ scope, limitHours, requestedHours, existingHours }` | overtime.md BR-OVT-006 |
| `OVT_OVERLAPPING_OCCURRENCE` | 409 | Planned window intersects another live occurrence for the employee (exclusion constraint) | `{ date, conflictingOccurrenceId }` | overtime.md BR-OVT-007 |
| `OVT_BACKDATE_WINDOW_CLOSED` | 422 | Overtime filed after the fact beyond `overtime.max_backdate_days` | `{ date, maxBackdateDays }` | overtime.md BR-OVT-001 |
| `OVT_PERIOD_LOCKED` | 409 | Request, approval, cancellation, or actualization touching a date inside a locked attendance period | `{ periodId, date }` | overtime.md BR-OVT-014 |
| `OVT_REQUEST_ALREADY_DECIDED` | 409 | Action on a request that is no longer actionable — single or per-item inside a bulk batch | `{ status }` | overtime.md BR-OVT-016 |
| `OVT_CANCEL_WINDOW_CLOSED` | 409 | Requester cancelling an occurrence at or after its planned start | `{ plannedStartAt }` | overtime.md BR-OVT-016 |
| `OVT_TOIL_NOT_ENABLED` | 422 | Time-off-in-lieu requested where `overtime.compensation_mode` or the seeded `TOIL` leave type does not permit it | — | overtime.md BR-OVT-011 |
| `OVT_RATE_RULES_MISSING` | 422 | No effective `overtime_rate_rules` row set for the occurrence date — pricing fails loudly rather than defaulting a factor | `{ date }` | overtime.md BR-OVT-009 |

`OVT_PERIOD_LOCKED` joins the lock family described in §18. `OVT_REQUEST_ALREADY_DECIDED` and `OVT_CANCEL_WINDOW_CLOSED` are deliberate twins of the `LVE_` codes above rather than shared codes: the two modules' cancel windows differ (leave splits at the start **date**, overtime at the planned **start instant**), and error-catalog §1 rule 3 binds one code to one violated rule in one module.

## 21. `PAY_` — payroll (owner: `docs/06-modules/payroll.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `PAY_NO_SALARY_PACKAGE` | 422 | No `salary_histories` record covers the run period for this employee — the row errors rather than borrowing a neighbouring interval | `{ employeeId, periodStart, periodEnd }` | payroll.md BR-PAY-005 |
| `PAY_PERIOD_NOT_LOCKED` | 409 | Calculation attempted while a covering attendance period is still open | `{ firstUnlockedDate, companyId }` | payroll.md BR-PAY-008 |
| `PAY_RUN_OVERLAPS` | 409 | A non-closed run already covers this company, type, and period | `{ existingRunId, status }` | payroll.md BR-PAY-006 |
| `PAY_RUN_NOT_IN_STATE` | 409 | Command illegal for the run's current status | `{ status, allowed }` | payroll.md §4.2 |
| `PAY_RUN_HAS_ERRORS` | 422 | Approval submission blocked while errored employee rows remain | `{ erroredCount }` | payroll.md BR-PAY-011 |
| `PAY_SALARY_OVERLAP` | 409 | Effective interval overlaps an existing package (exclusion constraint) | `{ employeeId, conflictingFrom, conflictingTo }` | payroll.md BR-PAY-005 |
| `PAY_COMPONENT_IN_USE` | 409 | Delete or reclassify refused — the component is referenced by salary or run lines | `{ componentId, referenceKind }` | payroll.md UC-PAY-001 |
| `PAY_PARAMETER_MISSING` | 422 | No effective-dated parameter version covers the run period; pricing fails at creation, not at employee 4,000 | `{ parameter, asOf }` | payroll.md BR-PAY-009 |
| `PAY_ALREADY_PAID` | 409 | Revoke or re-pay attempted on a run that is already paid | `{ paidAt }` | payroll.md BR-PAY-016 |
| `PAY_BANK_ACCOUNT_MISSING` | 422 | Bank-file row skipped — employee has no usable account | `{ employeeId }` | payroll.md UC-PAY-008 |
| `PAY_RETRO_WINDOW_CLOSED` | 422 | Retro flag older than `payroll.retro_window_months` | `{ periodEnd, windowMonths }` | payroll.md BR-PAY-019 |
| `PAY_SETTLEMENT_EXISTS` | 409 | A `final_settlement` run already covers this leaver | `{ employeeId, runId }` | payroll.md UC-PAY-012 |
| `PAY_MONTH_RUN_IN_FLIGHT` | 409 | Calculation refused while another run for the same company and payment month sits in `calculating` or `review` — the tax month's cumulative base is still moving | `{ otherRunId, status, paymentMonth }` | payroll.md BR-PAY-025, tax-pph21.md BR-TAX-007 |

`PAY_PERIOD_NOT_LOCKED` is the **inverse** of the lock family in §18–§20: those codes fire when a write touches an already-locked period, this one fires when a calculation touches a period that is *not yet* locked. Same boundary, opposite direction, so it is its own code rather than a reuse of `ATT_PERIOD_LOCKED`.

`PAY_MONTH_RUN_IN_FLIGHT` is a `PAY_` code although the rule exists for tax: the precondition is enforced by payroll on its own runs, and error codes belong to the module that raises them, not the module that motivated them.

## 22. `TAX_` — PPh 21 (owner: `docs/06-modules/tax-pph21.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `TAX_PTKP_UNRESOLVED` | 422 | Employee record carries no PTKP status when the tax year is pinned — the row errors rather than defaulting to TK/0 | `{ employeeId, taxYear }` | tax-pph21.md BR-TAX-005 |
| `TAX_PROFILE_YEAR_CLOSED` | 409 | Pinned-year edit attempted without a correction reason while a run in that year has closed | `{ taxYear, closedRunCount }` | tax-pph21.md BR-TAX-005 |
| `TAX_OPENING_YTD_LOCKED` | 409 | Opening YTD seed attempted after a run closed for that employee and year | `{ employeeId, taxYear, closedRunId }` | tax-pph21.md BR-TAX-015 |
| `TAX_PREVIOUS_EMPLOYER_INCOMPLETE` | 422 | Prior-employer figures are all-or-nothing; a partial set is refused | `{ missing }` | tax-pph21.md BR-TAX-014 |
| `TAX_FORM_NOT_ISSUABLE` | 422 | No ledger row for the employee-year, or no closed run for the year | `{ taxYear, reason }` | tax-pph21.md BR-TAX-018 |

Two conditions deliberately **not** given `TAX_` codes: an absent statutory parameter version reuses `PAY_PARAMETER_MISSING`, because payroll already raises it at run creation with the same `{ parameter, asOf }` shape and a second code would split the branch clients write; every unknown or out-of-scope identifier resolves to `SYS_NOT_FOUND` per §2.

## 23. `BPJS_` — social security contributions (owner: `docs/06-modules/bpjs.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `BPJS_REGISTRATION_OVERLAP` | 409 | A registration version would overlap an existing live interval for the company | `{ companyId, effectiveFrom, conflictingVersionId }` | bpjs.md BR-BPJS-003 |
| `BPJS_COVERAGE_OVERLAP` | 409 | An exclusion or dependent-count interval would overlap a live one for the employee | `{ employeeId, program, conflictingId }` | bpjs.md BR-BPJS-005, BR-BPJS-013 |
| `BPJS_RISK_CLASS_REQUIRED` | 422 | JKK enabled on a registration version carrying no risk class | `{ companyId, effectiveFrom }` | bpjs.md BR-BPJS-002 |

One code covers both employee-level tables. Exclusions and dependent counts are different rows with the same failure — an interval colliding with a live one — and a client that must branch between them can read `details.program`, which is present for the first and absent for the second.

Three conditions deliberately took **no code at all**: an unregistered company, an unconfigured wage floor, and an employee excluded from every program are **warnings** delivered through the run-creation preflight (bpjs.md BR-BPJS-004), not failures. Giving a warning a code invites a client to treat it as one. The absent-statutory-parameter case reuses `PAY_PARAMETER_MISSING` on the tax-pph21.md precedent.

## 24. `EXP_` — expense & reimbursement (owner: `docs/06-modules/expense-reimbursement.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `EXP_RECEIPT_REQUIRED` | 422 | Submitted line whose category requires a receipt at that amount and none is committed | `{ lineNo, categoryCode, threshold }` | expense-reimbursement.md BR-EXP-004 |
| `EXP_BACKDATE_WINDOW` | 422 | Line `incurred_date` in the future, or older than `expense.max_backdate_days` | `{ lineNo, incurredDate, earliestAllowed }` | expense-reimbursement.md BR-EXP-014 |
| `EXP_CLAIM_IN_RUN` | 409 | Cancel, edit, re-route, or hand-payment on a claim pinned to a payroll run | `{ payrollRunId, runStatus }` | expense-reimbursement.md BR-EXP-008 |
| `EXP_CLAIM_NOT_PAYABLE` | 409 | Mark-paid or bounce on a claim that is not approved, not finance-route, or already paid | `{ claimId, status, paymentState }` | expense-reimbursement.md BR-EXP-011 |
| `EXP_CLAIM_ALREADY_DECIDED` | 409 | Action on a claim no longer in the status that action requires — single or bulk | `{ claimId, status }` | expense-reimbursement.md BR-EXP-007 |

`EXP_CLAIM_IN_RUN` resembles the §18–§20 lock family in shape but not in cause: those fire on a write into a frozen **period**, this one on a write to a **row** a live payroll run has claimed. Releasing it is an act on the run, not on the claim.

Three conditions deliberately took **no code**. An over-policy line is a flag carried on the row, not a failure — giving it a code invites clients to branch on it as one, which reintroduces the blocking limit the module rejected. Archiving a category with live claims raises nothing, because every claim pins the policy it was filed under (BR-EXP-017), so the in-use guard `ORG_IN_USE` exists for has nothing to guard. Unknown or out-of-scope ids stay `SYS_NOT_FOUND` per §2.

## 25. `AST_` — asset (owner: `docs/06-modules/asset.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `AST_ALREADY_ASSIGNED` | 409 | Assign an asset that already has an open assignment | `{ assignmentId, employeeId, assignedAt }` | asset.md BR-AST-004 |
| `AST_NOT_ASSIGNABLE` | 409 | Assign an asset whose status is `in_repair`, `lost`, or `retired` | `{ assetId, status }` | asset.md BR-AST-005 |
| `AST_NOT_ASSIGNED` | 409 | Return an asset that has no open assignment | `{ assetId, status }` | asset.md BR-AST-004 |
| `AST_SERIAL_REQUIRED` | 422 | Create or import an asset in a category with `requires_serial` and no serial number | `{ categoryCode }` | asset.md BR-AST-003 |
| `AST_INCIDENT_ALREADY_RESOLVED` | 409 | Set a resolution on an incident that already carries one | `{ incidentId, resolution }` | asset.md BR-AST-009 |
| `AST_ITEM_IN_USE` | 409 | Soft-delete an asset with assignment history — retirement is the path | `{ assetId, assignmentCount }` | asset.md BR-AST-014 |

`AST_ALREADY_ASSIGNED` and `AST_NOT_ASSIGNABLE` share a status and are deliberately **not** merged: the first means "someone else holds it, get it back first", the second means "it is in the repair shop", and the next action differs. A merged code would force clients to re-derive the cause from a message string.

Four conditions deliberately took **no code**. A duplicate `asset_code` or serial number is `VAL_DUPLICATE` — §4's platform field-level uniqueness already covers it, and a module code would split a branch clients already write. Archiving a category with live assets raises nothing, because nothing about an existing asset breaks. A `condition_in` worse than `condition_out` on return is a **flag on the response**, not a failure: giving it a code invites clients to branch on it as one, which is how asset.md BR-AST-007's prompt would quietly become a refusal. Unknown or out-of-scope ids stay `SYS_NOT_FOUND` per §2.

Asset registers no lock-family code and its endpoints raise no `APRV_` code: custody is not a dated payroll fact, so nothing here writes into a locked period, and the module has no approval-engine interaction at all (asset.md BR-AST-013). Expense reached the first of those conclusions for a different reason — it is a request module whose claims route around locked periods rather than into them.

## 26. `REC_` — recruitment & candidate (owner: `docs/06-modules/recruitment-candidate.md`)

| Code | HTTP | Description | details | Source |
|---|---|---|---|---|
| `REC_REQUISITION_NOT_OPEN` | 409 | File an application against a requisition that is not `open` | `{ requisitionId, status }` | recruitment-candidate.md BR-REC-003 |
| `REC_REQUISITION_FILLED` | 409 | Convert when `filled_count` already equals `openings` | `{ requisitionId, openings, filledCount }` | recruitment-candidate.md BR-REC-002 |
| `REC_DUPLICATE_APPLICATION` | 409 | A second active application for the same candidate and requisition | `{ applicationId, stage, status }` | recruitment-candidate.md BR-REC-009 |
| `REC_STAGE_BACKWARD` | 409 | Move an application to an earlier stage | `{ applicationId, from, to }` | recruitment-candidate.md BR-REC-006 |
| `REC_APPLICATION_CLOSED` | 409 | Act on an application whose status is terminal | `{ applicationId, status }` | recruitment-candidate.md BR-REC-007 |
| `REC_CANDIDATE_ANONYMIZED` | 409 | Any write to a candidate anonymized past retention | `{ candidateId, anonymizedAt }` | recruitment-candidate.md BR-REC-017 |
| `REC_OFFER_ALREADY_LIVE` | 409 | Create an offer while one is `draft`, `pending_approval`, or `extended` | `{ offerId, status, revisionNumber }` | recruitment-candidate.md BR-REC-011 |
| `REC_OFFER_EXPIRED` | 409 | Record a response on an offer past `expires_on` | `{ offerId, expiresOn }` | recruitment-candidate.md BR-REC-014 |
| `REC_OFFER_NOT_ACCEPTED` | 409 | Convert without a live accepted offer | `{ applicationId, offerStatus }` | recruitment-candidate.md BR-REC-015 |
| `REC_NOT_A_PANELIST` | 403 | Submit or edit a scorecard seat belonging to another interviewer | `{ scorecardId }` | recruitment-candidate.md BR-REC-010 |
| `REC_SCORECARD_SUBMITTED` | 409 | Edit a scorecard that is already submitted | `{ scorecardId, submittedAt }` | recruitment-candidate.md BR-REC-010 |

`REC_NOT_A_PANELIST` is **403 rather than 404**, and it is the first deliberate exception to §2's existence-hiding default. The seat is listed on an interview the caller can already read, so a 404 would contradict a payload the same caller just received. The rule §2 states holds unchanged for everything the caller cannot see; existence hiding protects unseen rows, not rows already disclosed.

`REC_OFFER_EXPIRED` and `REC_OFFER_NOT_ACCEPTED` are deliberately **not merged** despite both blocking conversion-adjacent acts: the first says "this lapsed, issue a revision", the second says "nobody has said yes yet", and the recruiter's next click differs.

Four conditions deliberately took **no code**. A duplicate candidate email is `VAL_DUPLICATE` — §4's platform field-level uniqueness already covers it, and its `details` payload carries the existing `candidateId` so the client can offer the person instead of an error. A missing approval chain is `APRV_NO_CHAIN_CONFIGURED`, owned by the engine. Missing `employee.master.create` on the conversion endpoint is `AUTHZ_FORBIDDEN`, because the act is refused rather than the row hidden. Unknown or out-of-scope ids stay `SYS_NOT_FOUND` per §2.

Recruitment registers no lock-family code: nothing here is a dated payroll fact and no endpoint writes into a locked period. It is the first module to raise `APRV_` codes from **two** request types, both listed in §7 and neither shadowed by a module code.

## 27. `PRF_` — performance & goals (owner: `docs/06-modules/performance-goals.md`)

| Code | HTTP | Description | `details` | Source |
|---|---|---|---|---|
| `PRF_CYCLE_NOT_ACTIVE` | 409 | Write against a participant whose cycle is `draft` or `closed` | `{ cycleId, cycleStatus }` | performance-goals.md BR-PRF-001 |
| `PRF_PARTICIPANT_WITHDRAWN` | 409 | Write against a withdrawn participant | `{ participantId, withdrawnAt }` | performance-goals.md BR-PRF-002 |
| `PRF_GOALS_LOCKED` | 409 | Structural goal edit after agreement, or unlock once a review is submitted | `{ participantId, goalsAgreedAt, kind?, submittedAt? }` | performance-goals.md BR-PRF-007 |
| `PRF_NO_GOALS` | 409 | Submit a goal set containing no goals | `{ participantId }` | performance-goals.md BR-PRF-008 |
| `PRF_WEIGHT_NOT_BALANCED` | 409 | Top-level goals, or a parent's children, do not sum to 100.00 | `{ scope, parentGoalId?, total }` | performance-goals.md BR-PRF-006 |
| `PRF_NO_REVIEWER` | 409 | Agree a goal set or advance to `manager_review` with no reviewer pinned | `{ participantId }` | performance-goals.md BR-PRF-003 |
| `PRF_REVIEW_SUBMITTED` | 409 | Write a review that already carries `submitted_at` | `{ reviewId, kind, submittedAt }` | performance-goals.md BR-PRF-009 |
| `PRF_NOT_THE_REVIEWER` | 403 | Write or submit a review seat belonging to someone else | `{ reviewId, kind }` | performance-goals.md BR-PRF-009 |
| `PRF_RESULT_NOT_SHARED` | 409 | Acknowledge before the cohort release | `{ participantId, status }` | performance-goals.md BR-PRF-016 |
| `PRF_SCALE_IN_USE` | 409 | Edit or delete a rating scale referenced by a cycle past `draft` | `{ scaleId, cycleIds }` | performance-goals.md BR-PRF-013 |

`PRF_NOT_THE_REVIEWER` is **403 rather than 404** — the **second** deliberate exception to §2's existence-hiding default, after `REC_NOT_A_PANELIST`, and for the identical reason: the seat is listed on a participant the caller can already read, so a 404 would contradict a payload the same caller just received. Two instances now share one shape, and it is worth stating as a rule rather than leaving as a coincidence: **a seat on a row the caller can see is a row the caller can see.** Existence hiding protects rows the caller cannot reach; it never licenses lying about rows already disclosed. Any further module that seats a named individual against a visible parent row follows this shape rather than inventing a third answer.

`PRF_CYCLE_NOT_ACTIVE` covers **both** ends deliberately — a `draft` cycle and a `closed` one — with `details.cycleStatus` distinguishing them. One rule ("writes happen inside an active cycle") takes one code per §1 rule 3; splitting it would give clients two branches answering the same question. `PRF_GOALS_LOCKED` likewise covers the structural edit and the refused unlock, which are the same rule seen from either side.

Six conditions deliberately took **no code**. A weight outside 0–100 on one row is `VAL_OUT_OF_RANGE` — the *set-level* balance is what earns a code, not the field. A missing `overrideReason`, an unrated goal at submission, a band gap in a scale, and a parent carrying a target are all `VAL_VALIDATION_FAILED` naming the offending field or level. A duplicate participant at launch is **skipped and counted rather than raised**, which is what makes re-running the launch the supported way to add late joiners. Unknown or out-of-scope ids stay `SYS_NOT_FOUND` per §2.

Performance registers **no `APRV_` code and no lock-family code**: it configures no approval chain at all (performance-goals.md BR-PRF-019) and writes no dated payroll fact. It is the second module after asset to reach `done` with employee-facing transactional records and zero engine interaction.

## 28. `TRN_` — training (owner: `docs/06-modules/training.md`)

| Code | HTTP | Description | `details` | Source |
|---|---|---|---|---|
| `TRN_SESSION_FULL` | 409 | Seat allocation against a session at capacity, or a capacity lowered below the enrolled count | `{ sessionId, capacity, enrolledCount, requested? }` | training.md BR-TRN-004 |
| `TRN_SESSION_NOT_OPEN` | 409 | Enrollment or attendance write against a session that is not `scheduled`, past its enrollment close date, or with self-enrollment disabled | `{ sessionId, status, reason, enrollmentClosesAt? }` | training.md BR-TRN-002, BR-TRN-018 |
| `TRN_ALREADY_ENROLLED` | 409 | A second live enrollment for the same employee and session | `{ enrollmentId, status }` | training.md BR-TRN-005 |
| `TRN_ATTENDANCE_INCOMPLETE` | 409 | Close a session while an `enrolled` seat carries no attendance verdict | `{ sessionId, unmarkedCount }` | training.md BR-TRN-008 |
| `TRN_CERTIFICATE_NOT_AVAILABLE` | 409 | Mint a completion certificate before the session is `completed`, or for a seat that is not `attended` | `{ enrollmentId, sessionStatus, enrollmentStatus }` | training.md BR-TRN-014 |
| `TRN_ENROLLMENT_LOCKED` | 409 | Self-cancel an enrollment from the session's `start_date` onward | `{ enrollmentId, startDate }` | training.md BR-TRN-015 |

`TRN_SESSION_NOT_OPEN` covers **three** conditions deliberately — the wrong status, a passed enrollment close date, and self-enrollment disabled — with `details.reason` (`status` / `closed` / `self_enrollment_disabled`) distinguishing them. One rule ("this session is not open to you for enrollment right now") takes one code per §1 rule 3, the same shape `PRF_CYCLE_NOT_ACTIVE` uses for a draft and a closed cycle. `TRN_SESSION_FULL` likewise covers both the seat allocation and the refused capacity reduction, because both are the same invariant approached from either end.

`TRN_CERTIFICATE_NOT_AVAILABLE` is one code and not two. "The session has not closed yet" and "you did not attend" have different remedies, but the mint action is absent in both cases, so the code is a backstop against a direct API call rather than a branch a client renders; `details` carries both statuses for the message.

**Training raises no 403 exception**, and that is worth stating because the last two modules both did. `REC_NOT_A_PANELIST` and `PRF_NOT_THE_REVIEWER` exist because a named individual is seated against a parent row the caller can already read. Nothing here seats anyone that way: acting on an approval the caller does not hold is the engine's `APRV_NOT_AN_ASSIGNEE`, and everything else out of scope stays `SYS_NOT_FOUND` per §2. The rule those two established — *a seat on a row the caller can see is a row the caller can see* — is not triggered, and manufacturing a third instance to match the pattern would be the pattern using the module.

Five conditions deliberately took **no code**. A duplicate category or course code is `VAL_DUPLICATE` (§4). Archiving a category or a course with live rows behind it **raises nothing at all** — the dependent rows keep their FK and the archived row stops being offered, the same rule expense and asset settled. A development item belonging to another employee is `VAL_VALIDATION_FAILED`, since the picker already prevents it. A missing approval chain is `APRV_NO_CHAIN_CONFIGURED`, owned by the engine. Unknown or out-of-scope ids stay `SYS_NOT_FOUND` per §2.

Training registers **no lock-family code**: nothing here is a dated payroll fact and no endpoint writes into a locked period — the position asset, recruitment, and performance also took.

## 29. `ANN_` — announcement (owner: `docs/06-modules/announcement.md`)

| Code | HTTP | Description | `details` | Source |
|---|---|---|---|---|
| `ANN_EMPTY_AUDIENCE` | 422 | Publish — immediate or scheduled — whose target rules resolve to zero eligible employees | `{ announcementId, rules }` | announcement.md BR-ANN-006 |
| `ANN_CONTENT_LOCKED` | 409 | Edit of a frozen field on a `published` or `retracted` post | `{ announcementId, status, frozenFields }` | announcement.md BR-ANN-005 |

The pairing of HTTP statuses here is deliberate and it is the cleanest illustration of §1's rule in the catalog. `ANN_EMPTY_AUDIENCE` is **422**: nothing about the post's state is wrong, the rules simply describe nobody, and the fix is in the payload the caller controls. `ANN_CONTENT_LOCKED` is **409** for the mirror-image reason: the payload is fine and the state refuses it.

`ANN_EMPTY_AUDIENCE` exists at all because the failure it catches is otherwise **silent**. A post published to zero people is indistinguishable from one still being delivered — both show an empty recipient list — and a mistyped target is exactly how it happens. It fires on the scheduler's path as well as the endpoint's, so a scheduled post whose department was archived last week lands in the failed-jobs view rather than going out to nobody.

Six conditions deliberately took **no code**. Publishing something already published, retracting something never published, and deleting a post that is not a draft are all `VAL_VALIDATION_FAILED` — one state machine, one refusal, on training's `publish` precedent. A company, branch, department, position, or job level outside the caller's scope is `SYS_NOT_FOUND` per §2, and creating a tenant-wide post without tenant data scope is `AUTHZ_FORBIDDEN` before any row is read. Acknowledging is inbox's endpoint, so its refusals stay inbox's: `INB_NOT_ACKNOWLEDGEABLE` and `INB_ITEM_CLOSED`. HTML in the body is `VAL_INVALID_FORMAT`, a field error. And a failed fan-out raises nothing to anyone — it is a job, its failure lands in the failed set, and the null `recipient_count` is what the UI reads.

**Announcement raises no 403 exception**, the second module in a row to state it. A non-recipient cannot see the post at all, so existence hiding applies cleanly and `SYS_NOT_FOUND` is the whole answer — the `REC_NOT_A_PANELIST` / `PRF_NOT_THE_REVIEWER` rule in §27 needs a caller who can already read the parent row, and there is no such caller here. Two consecutive modules declining it is the rule working: it was promoted to stop a third instance being manufactured, and it has now stopped two.

Announcement registers **no lock-family code and no `APRV_` code** — nothing here is a dated payroll fact, and the module has no approval-engine interaction at all (announcement.md §13), which puts it with asset in the small set of modules that touch neither.

## 30. `RPT_` — reports (owner: `docs/06-modules/reports.md`)

| Code | HTTP | Description | `details` | Source |
|---|---|---|---|---|
| `RPT_RESULT_TOO_LARGE` | 422 | Inline report result exceeds the row cap or the statement-duration bound | `{ bound: 'rows' \| 'duration', rowCount?, limitRows?, limitMs? }` | reports.md BR-RPT-010 |
| `RPT_SCOPE_INSUFFICIENT` | 403 | Caller's data scope is narrower than the definition's `minimumScope` | `{ requiredScope, callerScope }` | reports.md BR-RPT-005 |

`RPT_RESULT_TOO_LARGE` covers **both bounds deliberately**, with `details.bound` distinguishing them. A row cap and a duration cap are one rule seen twice — "the inline surface is bounded" — and §1 rule 3 gives one rule one code; splitting them would hand clients two branches that end in the same action, which is downloading the file instead. `PRF_CYCLE_NOT_ACTIVE`'s precedent, applied to a bound rather than a state.

`RPT_SCOPE_INSUFFICIENT` is **403 rather than 404** — the **third** deliberate exception to §2's existence-hiding default, after `REC_NOT_A_PANELIST` and `PRF_NOT_THE_REVIEWER`, and the first to arrive under the rule §27 promoted rather than as a coincidence needing one. The catalog endpoint disclosed this report to this caller one request ago (reports.md BR-RPT-014), so a 404 would contradict a payload the same caller just received — exactly the shape §27 describes.

It also earns a code rather than reusing `AUTHZ_FORBIDDEN` on a stronger ground than convention: `AUTHZ_FORBIDDEN` would be **factually wrong here**. The caller holds the permission — that is why the report is in their catalog — and what they lack is data scope, the *other* axis of ADR-0005's two-axis model. Telling a manager they are forbidden sends them to request a key they already hold; telling them the report needs company scope is the actionable truth. This is the first code in the catalog to distinguish the two axes in its message, and any later module refusing on scope rather than permission follows this shape.

Reports registers **no other code**, and the reasons are all deference rather than omission. An unknown or unpermitted report key is `SYS_NOT_FOUND` per §2, because the catalog already hid it. Missing or malformed parameters are `VAL_VALIDATION_FAILED` with per-field entries, validated against the same `ParamSpec` machinery import-export uses. A depth request past `page × pageSize ≤ 10 000` is `VAL_OUT_OF_RANGE` (api-standards §5.2). A timeout on the **file** path is a `SYS`-class `failureCode` on the export job, import-export's existing shape — the inline code exists because the inline caller has an alternative to be pointed at, and the file caller does not.

Reports raises **no `IMP_` code**, though every file it produces is an import-export job: the definition-resolved `report.result` fails on the same `IMP_` conditions as any other export and shadows none of them. **No `APRV_` code and no lock-family code** either — nothing here is requested, decided, or written, which makes it the fourth module after asset, performance-goals, and announcement to reach `done` with no approval-engine interaction, and the first whose reason is that it performs no write at all.

## 31. `ADM_` — system administration (owner: `docs/06-modules/system-administration.md`)

| Code | HTTP | Description | `details` | Source |
|---|---|---|---|---|
| `ADM_TOTP_INVALID` | 401 | Submitted TOTP code is wrong or outside the ±1 step window, at platform login or at first-login enrolment | `{ attemptsRemaining }` | system-administration.md BR-ADM-002 |
| `ADM_IMPERSONATION_ACTIVE` | 409 | The platform operator already holds a live impersonation session | `{ tenantId, tenantName, targetUserId, expiresAt }` | system-administration.md BR-ADM-015 |
| `ADM_IMPERSONATION_ENDED` | 401 | The impersonation token's session is expired, exited, or revoked | `{ endReason }` | system-administration.md UC-ADM-008 |
| `ADM_JOB_NOT_RETRYABLE` | 409 | The job is no longer in the queue's failed set — retried by someone else, or archived past ADR-0010's 7-day horizon | `{ queue, jobId }` | system-administration.md BR-ADM-021 |

Three of the four exist because the client's **next action** differs, which is §1's whole test. `ADM_TOTP_INVALID` keeps the challenge alive and re-prompts for six digits, where `AUTH_INVALID_CREDENTIALS` restarts the flow from the password. `ADM_IMPERSONATION_ENDED` sends the console back **into the same tenant**, where a bare 401 would send an operator to the login page mid-incident. `ADM_IMPERSONATION_ACTIVE` carries the held session so the UI can offer "exit and switch" — `AUTHZ_FORBIDDEN` would be factually wrong, since the caller holds the key and merely holds it once already.

`ADM_JOB_NOT_RETRYABLE` is **409 rather than 404**, the **fourth** deliberate exception to §2's existence-hiding default and the second to arrive under the rule §27 promoted (after `RPT_SCOPE_INSUFFICIENT`). The reasoning is identical: the failed-jobs list disclosed this job to this caller one request ago, so a 404 would contradict a payload they are still holding on screen.

The absences carry more weight than the four codes. **Wrong platform password and platform lockout reuse `AUTH_INVALID_CREDENTIALS` and `AUTH_ACCOUNT_LOCKED`** — the condition, the anti-enumeration requirement (BR-AUTH-002's uniform timing and dummy verify), and the client behaviour are identical, and a parallel code meaning "the password was wrong on a different login form" is precisely the duplication §1's registration protocol exists to prevent. This is the first cross-module *reuse* of an `AUTH_` code by a non-authentication module, and it is deliberate: one condition, one code, wherever it is raised. Unenrolled TOTP is a **200 with an enrolment challenge**, not an error, on authentication.md's tenant-picker precedent. Duplicate tenant slugs and company codes are `VAL_DUPLICATE`; unknown feature-flag keys are `VAL_INVALID_ENUM` on settings BR-SET-001's precedent verbatim; short reasons are `VAL_TOO_SHORT`; a missing impersonation target is `SYS_NOT_FOUND`; a KMS outage during provisioning is `SYS_UNAVAILABLE`; and `sysadmin.*` attempted from inside an impersonation session is plain `AUTHZ_FORBIDDEN`, because the impersonation token carries no platform key and the ordinary guard refuses it without knowing why. **Invalid tenant status transitions raise nothing at all** — BR-ADM-008 makes every transition valid in every direction, so the condition does not exist.

**`TEN_` is owned with zero codes.** system-administration.md owns both prefixes naming §4 assigns it, and the second earns no entries: every tenant-lifecycle refusal already has a code somewhere else. `AUTH_TENANT_SUSPENDED` is what the runtime returns, minted by authentication and raised by `TenantStatusGuard`, which system-administration does not own; a `TEN_SUSPENDED` synonym would have no code path able to reach it. `TEN_` therefore joins `AUD_` and `DSH_` as a prefix owned with zero codes.

## 32. Deprecated

None.

## 33. Namespace ledger

Seeded here: `SYS_` (6), `VAL_` (11), `AUTH_` (13), `AUTHZ_` (4), `SYNC_` (2), `APRV_` (7), `SET_` (4), `NTF_` (1), `INB_` (2), `DOC_` (5), `IMP_` (5), `HOL_` (2), `ORG_` (5), `EMP_` (5), `SHF_` (4), `ATT_` (8), `LVE_` (11), `OVT_` (10), `PAY_` (13), `TAX_` (5), `BPJS_` (3), `EXP_` (5), `AST_` (6), `REC_` (11), `PRF_` (10), `TRN_` (6), `ANN_` (2), `RPT_` (2), `ADM_` (4) — **29 owned prefixes, 172 codes**. The two platform blocks now carry explicit counts: they had drifted three codes ahead of the stated total (grill cluster C's `SYS_NOT_FOUND` among them) because only module prefixes were being tallied on arrival.

**`VAL_` corrected from 10 to 11 on 2026-08-03** (performance-goals.md session), which also moves the total. The §4 field-level table has one row holding **two** codes — `` `VAL_TOO_SHORT` / `VAL_TOO_LONG` `` — and every tally since the seed counted that row once. This is the counting hazard worth naming, because the instruction below invites it: **a count here is codes, not table rows, and one row in this file carries two codes.** A verification that counts rows lands one short and looks correct. `AUD_` is **owned with zero codes** (`docs/05-platform/audit-log.md` §11 — read-only surface; platform codes cover its failures), **`DSH_` joined it 2026-08-04** (`docs/06-modules/dashboard-analytics.md` §11 — scope insufficiency and permission failure are *absence* there rather than errors, and a failed widget's client behaviour is "retry" whatever the cause, so §2's mint-when-clients-branch rule is never met), and **`TEN_` joined the same day** (§31 — every tenant-lifecycle refusal already has a code raised by a guard its owner does not own). A prefix owned with zero codes is a recorded decision, not an unwritten file — the distinction the `AUD_` note exists to preserve. Three now stand that way: `AUD`, `DSH`, `TEN`.

**The reserved-empty list is closed.** It ran `AST, REC, PRF, TRN, ANN, RPT` until 2026-08-03, `DSH` until 2026-08-04, and `TEN, ADM` until this session — **zero remain**. Every prefix in naming §4 now belongs to a written document and carries either codes or a stated reason for having none, which is the property the Phase 4 audit was going to check. A future module registers its prefix in naming §4 and its section here in the same session, per §1; there is no longer a standing list of prefixes awaiting an owner.
