# Naming Conventions

Status: Active (Phase 1 anchor) · Related: `CONTEXT.md` (domain terms), `docs/04-database/database-conventions.md` (semantics of audit/soft-delete/effective-dating columns), `docs/03-standards/error-catalog.md` (code registry), `docs/adr/ADR-0007-api-versioning-response-envelope.md`

Binding for all three stacks and the database. Every identifier an engineer or AI assistant creates must match a rule here; if an artifact type is missing, add the rule here first, then use it. Domain words come from `CONTEXT.md` — never invent synonyms (one concept, one name: an approval `step` is never a "stage"; a `punch` is never a "log").

## 1. Casing cheat sheet

| Artifact | Convention | Example |
|---|---|---|
| PostgreSQL table | `snake_case`, plural | `leave_requests` |
| PostgreSQL column | `snake_case` | `effective_from` |
| PostgreSQL enum type / values | `snake_case`, singular type | `employee_status` / `on_leave` |
| Index / constraint | prefixed `snake_case` (§2.4) | `idx_leave_requests_tenant_id_status` |
| Drizzle TS export | `camelCase` plural | `leaveRequests` |
| API path segment | `kebab-case`, resources plural | `/api/v1/leave-requests` |
| Path parameter | `camelCase` | `{leaveRequestId}` |
| Query parameter | `camelCase` | `pageSize` |
| JSON field (request/response) | `camelCase` | `effectiveFrom` |
| HTTP header | `Train-Case` | `X-Request-Id`, `Idempotency-Key` |
| Error code | `PREFIX_UPPER_SNAKE` (§4) | `ATT_OUTSIDE_GEOFENCE` |
| Permission key | dot-path, lowercase (§5) | `leave.request.approve` |
| Domain event | dot-path, past tense (§6) | `leave.request.approved` |
| BullMQ queue / job | queue `kebab-case`; job dot-path (§7) | `payroll` / `run.calculate` |
| Redis key | colon-path (§8) | `hris:attendance:{tenantId}:geofence:{branchId}` |
| Settings key | dot-path, `snake_case` leaf (§9) | `attendance.geofence_radius_m` |
| i18n key | dot-path, `camelCase` leaf (§10) | `leave.requestForm.title` |
| TS/Dart class | `PascalCase` | `SubmitLeaveRequestUseCase` |
| TS/Dart variable, function | `camelCase` | `remainingBalance` |
| TS/JS file (web, backend) | `kebab-case` + type suffix | `leave-request.controller.ts` |
| Dart file | `snake_case.dart` | `submit_leave_request.dart` |
| Env variable | `UPPER_SNAKE` | `DATABASE_URL` |
| Git branch / commit | §12 | `feat/123-leave-carry-over` |

## 2. Database (PostgreSQL via Drizzle; Drift mirrors it)

### 2.1 Tables

- `snake_case`, **plural**: `employees`, `payroll_runs`, `attendance_punches`.
- Junction tables: owner-first, both plural-final: `role_permissions`, `employee_documents`.
- No prefixes (`tbl_`), no tenant/company embedded in names — scoping is a column, not a name.
- Drizzle export mirrors the table in `camelCase`: `export const <camelName> = pgTable('<table_name>', …)` — so `attendance_punches` is exported as `attendancePunches`.

  **The example is deliberately unparseable** *(2026-08-05, MANIFEST row 70; it previously carried a concrete exported declaration of `payroll_runs`, which is not restated here — spelling it out in the correction would re-create it)*. A concrete `pgTable(` declaration in a document that owns no tables is a second definition of whatever it names: this file sorts ahead of `payroll.md`, so any tool resolving ownership by scanning for `pgTable` reads the example first and attributes the table here — which is exactly what corrupted `erd-overview.md` §3's census to 20/68/27. Substituting a *fictitious* table name does not fix it; the fictitious table then gets counted as real. Placeholders in angle brackets teach the same mapping and match no parser. `scripts/erd-check.mjs` checks `C1` and `C9` catch both failure modes.

### 2.2 Columns

- `snake_case`. PK is always `id` (UUID). FK is `<referenced_singular>_id`: `employee_id`, `approved_by` (FK to `users` when the column is an actor, see database-conventions audit fields).
- Booleans: `is_` / `has_` prefix (`is_active`, `has_npwp`).
- Timestamps: `_at` suffix, `timestamptz` (`approved_at`); dates without time: `_date` or domain word (`effective_from`, `punch_date`).
- Money: `_amount` suffix, integer minor units or numeric per database-conventions; never `float`.
- Reserved cross-cutting names (semantics in `docs/04-database/database-conventions.md`): `tenant_id`, `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `effective_from`, `effective_to`.
- Quantity columns carry the unit: `geofence_radius_m`, `duration_minutes`, `retention_days`.

### 2.3 Enums

- Type name: `snake_case` singular, suffixed by kind: `employee_status`, `payroll_run_status`, `leave_unit_type`.
- Values: lowercase `snake_case`: `on_leave`, `early_leave`. Never renumber/rename released values — add and deprecate.

### 2.4 Indexes and constraints

| Kind | Pattern | Example |
|---|---|---|
| Index | `idx_<table>_<cols>` | `idx_attendance_punches_tenant_id_employee_id_punch_date` |
| Unique | `uq_<table>_<cols>` | `uq_employees_tenant_id_nik` |
| Foreign key | `fk_<table>_<ref_table>` | `fk_leave_requests_employees` |
| Check | `ck_<table>_<rule>` | `ck_shifts_times_differ` |

Composite indexes on tenant-owned tables lead with `tenant_id` (spec §5.14); the name lists columns in index order.

### 2.5 Migrations (drizzle-kit)

`NNNN_<verb>_<object>` snake, sequential: `0001_create_tenants`, `0014_add_leave_balances_carry_over`. Always regenerate the auto-name to a meaningful one via `--name`. One concern per migration.

### 2.6 Drift (mobile local DB)

Local tables/columns mirror server names exactly (`leave_requests`, `effective_from`) so sync mapping is mechanical; Dart-side naming mechanics in `docs/03-standards/coding-standards-flutter.md`. Mobile-only tables (queue, cache bookkeeping) use the same conventions with a `local_` prefix: `local_sync_queue`, `local_cache_meta`.

## 3. API

- Base: `/api/v1/…` (URI versioning, ADR-0007). Resources plural `kebab-case`: `/api/v1/leave-requests`, `/api/v1/payroll-runs`.
- Nesting: max one level, only for true ownership: `/api/v1/employees/{employeeId}/documents`. Otherwise filter on the collection: `/api/v1/leave-requests?employeeId=…`.
- Non-CRUD actions: `POST /<collection>/{id}/<verb>` with a kebab verb from the approved set: `approve`, `reject`, `cancel`, `submit`, `execute`, `lock`, `unlock`, `publish`, `acknowledge`, `revoke`, `restore`, `close`, `terminate` (added 2026-08-02, employee.md), `assign` (added 2026-08-02, shift.md — used by the `bulk-assign` shapes of api-standards §10), `return` (added 2026-08-02, leave.md — ADR-0008's return-for-revision approver action; every request-owning module needs the same route), `export` (**registered retroactively 2026-08-03**, recruitment-candidate.md session — it was already in live use by payroll's `POST /me/payslips/{id}/export`, tax's `POST /tax/forms/{employeeId}/{taxYear}/export`, and asset's `POST /asset-assignments/{id}/export` without ever being added here, which is the exact drift this list exists to prevent; it means *mint a document artifact for this one row*, not the import-export framework's bulk definitions, which have their own endpoints), `retract` (added 2026-08-03, announcement.md — withdrawing something already published or committed to publish; registered rather than folded into the reserved `revoke` because inbox.md had already written `closed_reason = 'retracted'` into its schema, its business rules, and its error catalog before the module existed, and one act spelled two ways across a module boundary is the drift this list exists to catch). New verbs are added here first.
- Reserved query parameters (semantics in `docs/03-standards/api-standards.md`): `page`, `pageSize` (offset); `cursor`, `limit` (cursor); `sortBy`; `q` (search); `includeDeleted` (admin only).
- Reserved headers: `Authorization`, `Idempotency-Key`, `X-Request-Id`, `Accept-Language`.
- JSON bodies `camelCase` both directions; the API layer maps to DB `snake_case`. No abbreviations not present in `CONTEXT.md` (write `employeeId`, not `empId`).

## 4. Error codes

Grammar: `<PREFIX>_<CONDITION>` — prefix from the module registry below; condition `UPPER_SNAKE`, states the violated fact, not the HTTP status: `LVE_INSUFFICIENT_BALANCE`, not `LVE_BAD_REQUEST`.

Codes are stable forever once registered in `docs/03-standards/error-catalog.md` (registration protocol there). i18n message key for every code: `errors.<CODE>` (§10).

### Module prefix registry

| Prefix | Namespace (`ns`) | Module |
|---|---|---|
| `AUTH` | `auth` | authentication |
| `AUTHZ` | `authz` | authorization-rbac |
| `TEN` | `tenant` | tenancy core |
| `APRV` | `approval` | approval-engine |
| `NTF` | `notification` | notification |
| `INB` | `inbox` | inbox |
| `DOC` | `document` | document-storage |
| `AUD` | `audit` | audit-log |
| `SET` | `settings` | settings |
| `IMP` | `import-export` | import-export |
| `SYNC` | `sync` | offline sync engine |
| `HOL` | `holiday` | holiday |
| `ORG` | `organization` | organization |
| `EMP` | `employee` | employee |
| `SHF` | `shift` | shift |
| `ATT` | `attendance` | attendance |
| `LVE` | `leave` | leave |
| `OVT` | `overtime` | overtime |
| `PAY` | `payroll` | payroll |
| `TAX` | `tax` | tax-pph21 |
| `BPJS` | `bpjs` | bpjs |
| `EXP` | `expense` | expense-reimbursement |
| `AST` | `asset` | asset |
| `REC` | `recruitment` | recruitment-candidate |
| `PRF` | `performance` | performance-goals |
| `TRN` | `training` | training |
| `ANN` | `announcement` | announcement |
| `RPT` | `report` | reports |
| `DSH` | `dashboard` | dashboard-analytics |
| `ADM` | `sysadmin` | system-administration |
| `VAL` | — | cross-module input validation |
| `SYS` | — | infrastructure / unexpected failures |

The `ns` column is the segment used by permission keys, events, jobs, settings, and i18n keys. One module, one prefix, one namespace — new modules register both here before writing any code or doc.

## 5. Permission keys

Grammar: `<ns>.<resource>.<action>` — all lowercase; `resource` singular; `action` from the reserved verb set:

`create · read · update · delete · approve · reject · assign · export · import · execute · lock · configure`

- New actions register here first (same protocol as §3 verbs and §4 prefixes) — modules never mint action words ad hoc (grilled 2026-08-02).
- `read` covers list + detail; separate keys only when the module genuinely splits them (document the deviation in the module doc).
- Scope (tenant vs company) is a property of the **role assignment**, never encoded in the key.
- Examples: `leave.request.approve`, `payroll.run.execute`, `employee.master.update`, `settings.tax_parameter.configure`.
- No wildcards in enforcement code; role templates enumerate keys explicitly (`docs/adr/ADR-0005-rbac-permission-model.md`).
- Full catalog lives in `docs/05-platform/authorization-rbac.md`; every endpoint spec names its key(s).

## 6. Domain events

Grammar: `<ns>.<entity>.<event>` — past tense, lowercase: `leave.request.approved`, `attendance.punch.synced`, `payroll.run.completed`, `employee.contract.expiring` (state-transition events past tense; scheduled/predictive events present participle).

TS event class: `PascalCase` of the key: `LeaveRequestApproved`. Payload conventions in `docs/adr/ADR-0010-background-jobs-events.md`.

## 7. Background jobs and queues (BullMQ)

- Queue per domain, `kebab-case`, few and stable: `payroll`, `notifications`, `imports`, `exports`, `reports`, `sync`, `events`, `maintenance` (registry table in `docs/adr/ADR-0010-background-jobs-events.md`).
- Job name inside a queue: dot-path verb phrase, lowercase: queue `payroll` → `run.calculate`, `payslip.generate`, `bank-file.export`.
- Job ID (for idempotent/unique jobs): `<job-name>:<natural-key>` — `run.calculate:tenantId:runId`.
- Repeatable jobs carry a `cron.` prefix: `cron.contract-reminder.scan`.
- Event-handler jobs carry an `on.` prefix + the event name: `on.leave.request.approved` (dispatched by the outbox relay, ADR-0010).
- Retry/backoff policy per queue in `docs/adr/ADR-0010-background-jobs-events.md`.

## 8. Redis keys

Grammar: `hris:<ns>:<tenantId>:<qualifier…>` colon-delimited, tenant segment mandatory for tenant-owned data, `-` for platform-level: `hris:auth:-:jwks`, `hris:attendance:{tenantId}:geofence:{branchId}`, `hris:ratelimit:{tenantId}:{userId}:{route}`.

TTL is mandatory for every key except explicitly documented durable structures (BullMQ's own keys are exempt — managed by the library).

## 9. Settings keys

Grammar: `<ns>.<setting_snake_case>`, numeric leaves carry units: `attendance.geofence_radius_m`, `leave.carry_over_expiry_months`, `payroll.cutoff_day`, `tax.ter_table_version`.

Hierarchy level (platform/tenant/company/branch) and effective dating are attributes of the setting definition, not the key (`docs/05-platform/settings.md`).

## 10. i18n translation keys

- Grammar: `<ns>.<screen_or_context>.<element>` — dot-path, `camelCase` segments after the namespace: `leave.requestForm.title`, `attendance.clockIn.outsideGeofence`.
- Error messages: `errors.<ERROR_CODE>` — one entry per catalog code: `errors.LVE_INSUFFICIENT_BALANCE`.
- Shared vocabulary: `common.<element>` (`common.save`, `common.cancel`).
- Both apps ship `id` (default) + `en` from day one; a key merged without both locales fails CI (D12).

## 11. Files and folders

Repository layout note: the handbook assumes three implementation repositories — backend, admin web, mobile (A-006 in `ASSUMPTIONS.md`). Paths below are app-root-relative.

### 11.1 Backend (NestJS)

```
src/
├── modules/<ns>/            # one folder per module namespace, kebab-case
│   ├── domain/              # entities, value objects, repository interfaces
│   ├── application/         # use cases, DTOs, ports
│   ├── infrastructure/      # drizzle repositories, external adapters
│   └── presentation/        # controllers, guards, request mappers
├── shared/                  # result, envelope, base classes — no business logic
└── database/                # drizzle schema per module, migrations
```

File = `kebab-case` + type suffix: `.module.ts`, `.controller.ts`, `.use-case.ts`, `.repository.ts` (interface) / `.drizzle-repository.ts` (impl), `.entity.ts`, `.dto.ts`, `.schema.ts` (Drizzle), `.guard.ts`, `.spec.ts`, `.e2e-spec.ts`.
Class = `PascalCase` mirroring the file: `create-leave-request.use-case.ts` → `CreateLeaveRequestUseCase`; DTOs: `CreateLeaveRequestDto`, `LeaveRequestResponseDto`.

### 11.2 Admin web (Next.js App Router)

```
src/
├── app/                     # routes only; route groups in (parens): (admin), (platform)
├── features/<ns>/           # feature-based: components/ hooks/ api/ schemas/ types/
├── components/ui/           # shadcn/ui primitives (generated names untouched)
├── lib/                     # axios client, query client, utilities
└── i18n/
```

All files `kebab-case`: components `leave-request-table.tsx` (export `LeaveRequestTable`), hooks `use-leave-requests.ts` (export `useLeaveRequests`), Zod `leave-request.schema.ts`. App Router reserved files (`page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`, `error.tsx`) as framework demands.

### 11.3 Mobile (Flutter)

```
lib/
├── features/<ns>/           # feature-first, snake_case folder
│   ├── domain/              # entities, repository contracts, use cases
│   ├── data/                # drift daos, remote sources, repository impls
│   └── presentation/        # cubits/blocs, pages, widgets
├── core/                    # result, di, network, sync engine, theme
└── l10n/
```

Files `snake_case.dart` with type suffixes: `leave_request_cubit.dart`, `leave_request_state.dart`, `leave_repository.dart` / `leave_repository_impl.dart`, use case files named as the verb phrase: `submit_leave_request.dart` (class `SubmitLeaveRequest`), pages `leave_request_page.dart`, tests `*_test.dart` mirroring the source path.

### 11.4 Firebase Storage paths

`tenants/{tenantId}/{ns}/{entityId}/{fileId}_{sanitizedOriginalName}` — detail and policies in `docs/05-platform/document-storage.md`.

## 12. Git

- Branches: `<type>/<issue>-<kebab-slug>` — `feat/123-leave-carry-over`, `fix/207-punch-timezone`. Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.
- Commits: Conventional Commits, module namespace as scope: `feat(leave): implement carry-over expiry`. Issue reference in the body (`Refs #123`), not the subject.
- **Under squash merge the pull-request title is what must satisfy that format** (`docs/07-operations/ci-cd.md` §13, gate C9) — individual commit messages cease to exist at merge, so they are unlinted, and the squashed title becomes both the history entry and the generated release-note line.
- Env vars: `UPPER_SNAKE`; Next.js browser-exposed vars must use `NEXT_PUBLIC_`; secrets never in `NEXT_PUBLIC_` or Flutter `--dart-define` for release builds (see `docs/03-standards/security-standards.md`).

## 13. Enforcement

Naming violations are review blockers, equal to failing tests. Linters/CI encode what is automatable (ESLint naming rules, `dart analyze`, drizzle schema lint, i18n key completeness); the rest is enforced by the module Definition of Done and code review. The AI development guide (`docs/08-ai-guide/ai-development-guide.md`) restates these rules imperatively with compliant/violation pairs.
