# HRIS Engineering Handbook — Generation Specification

**Version:** 1.0 · **Status:** Active · **Executor:** Claude Code
**Companion files:** `CLAUDE.md` (persistent rules, auto-loaded), `MANIFEST.md` + `PROGRESS.md` (created in Phase 0)

This document is the complete specification for generating the HRIS Engineering Handbook. It replaces word-count targets with explicit depth criteria, defines a phased file-by-file workflow, and separates **decided constraints** (§5), **proposed defaults awaiting confirmation** (§6), and **delegated decisions** (§ Decision hierarchy in `CLAUDE.md`).

---

## 1. Mission

Produce a production-grade Engineering Handbook for **HRIS**, an enterprise multi-tenant HRIS SaaS. The handbook must be detailed enough that an experienced developer — or an AI coding assistant — can implement the entire product without inventing architectural decisions. Quality benchmark: internal engineering documentation at Workday, Rippling, Gusto, HiBob, BambooHR, Mekari Talenta.

The handbook is generated file by file into this repository under `docs/`, tracked by `MANIFEST.md` and `PROGRESS.md`, and kept consistent through the anchor-document protocol in `CLAUDE.md`.

## 2. Quality bar (replaces any word-count target)

Do not pad, and do not summarize away required content. A file is deep enough when, and only when:

1. Every API endpoint is fully specified: method, path, auth requirement, required permission, request schema, response schema, error codes, pagination/idempotency behavior.
2. Every entity has a Drizzle schema definition with types, constraints, indexes, and relations.
3. Every entity with a lifecycle (payroll run, leave request, candidate, approval, sync operation, etc.) has a Mermaid `stateDiagram-v2`.
4. Every module has a permission matrix (action × role) and numbered, testable business rules (`BR-<MODULE>-001` …).
5. Every non-obvious flow has a sequence diagram or flowchart.
6. Every rule is written so a test case can be derived from it directly.

Corollary: no marketing prose, no restated boilerplate, no "as mentioned above" filler. Modules reference the global standards documents and specify **deviations only**.

## 3. Product definition

### 3.1 Product

- **Name:** HRIS
- **Type:** Enterprise HRIS SaaS, multi-tenant
- **Workflow inspiration:** Mekari Talenta (business workflows), modern architecture and stack (engineering)

### 3.2 Functional scope (V1 unless marked otherwise)

Employee Self Service, HR Administration, Attendance, Leave, Overtime, Payroll, Organization, Recruitment, Performance, Asset, Expense, Document Management, Company Announcement, Reports, Dashboard, Analytics, Approval Workflow. Full module inventory with per-module coverage requirements: §10.

### 3.3 Target users (roles)

Employee, Manager, HR Staff, HR Admin, Payroll Admin, Recruiter, Finance, Company Administrator, System Administrator, Super Admin (platform level).

### 3.4 Client applications

| App | Stack | Purpose |
|---|---|---|
| Employee App | Flutter (Android + iOS) | Employee Self Service, Manager Self Service (approvals, team visibility) |
| Admin App | Next.js, desktop-first responsive web | HR administration, payroll, reports, configuration, organization, recruitment, analytics, employee management |

Explicitly excluded from V1: Flutter Web, desktop application, shared-device kiosk (kiosk mode is planned post-GA).

## 4. Locale and regulatory scope — Indonesia

The product targets the **Indonesian market**. This is a first-class architectural input, not an afterthought. Requirements:

1. **Currency:** IDR everywhere money appears. **Timezones:** Indonesia spans WIB, WITA, WIT — store timestamps in UTC, resolve display and attendance/shift logic against the **branch** timezone.
2. **i18n:** Bahasa Indonesia (default) and English for both client apps. Handbook itself is written in English (see `CLAUDE.md` Writing standards).
3. **Payroll & tax documents must cover** (name the concepts, structure the calculation engine around them):
   - PPh 21 including the monthly TER scheme and the annual/December recalculation, PTKP categories, treatment of employees without NPWP (NIK-as-NPWP era), Form 1721-A1 output.
   - BPJS Kesehatan and BPJS Ketenagakerjaan (JHT, JP, JKK, JKM): employer vs employee portions, wage caps, risk-class variation for JKK.
   - THR (religious holiday allowance): eligibility, proration, payment deadline, dedicated payroll run type.
   - Overtime pay per government formula (1/173 monthly-wage basis, weekday vs holiday multipliers).
   - Statutory leave per UU Ketenagakerjaan and amendments (annual leave, sick leave, maternity/paternity, marriage, bereavement, cuti bersama and its configurable deduction policy).
   - Wage components relevant to PKWT/PKWTT employment types, prorated joins/exits, and final settlement on termination.
   - Referenced legislation includes (non-exhaustive): UU 13/2003 jo. UU Cipta Kerja and its implementing PPs, PP 58/2023 + PMK 168/2023 (TER), UU KIA (maternity provisions), UU PDP 27/2022 (personal data protection).
4. **Verify-marker rule:** regulation numbers change. The handbook must define the calculation **structure, sequence, and configurability** precisely, but every concrete rate, cap, or threshold carries:
   `> ⚠️ VERIFY: confirm against current Indonesian regulation before implementation.`
   Rates/caps must be modeled as **effective-dated configuration data**, never hardcoded.
5. **Data protection:** employee data handling must reference UU PDP obligations (consent, purpose limitation, retention, breach handling) in the security and audit documents.

## 5. Decided architecture (binding — do not revisit without a superseding ADR)

### 5.1 Mobile — Flutter

Clean Architecture, feature-first structure, repository pattern, use cases, dependency injection, Result pattern, offline-first. State management: `flutter_bloc` — **Cubit is the default for every feature.** Use Bloc only when a workflow genuinely needs event-driven mechanics: event transformation (debounce/throttle, e.g. search), concurrent-event handling, or complex multi-step flows such as the offline sync engine or the clock-in flow (GPS + selfie + queue). Choosing Bloc over Cubit must be briefly justified in the module documentation. **Riverpod is prohibited.** Local database: **Drift** for all business data. **Hive is prohibited.** SharedPreferences only for trivial app settings (theme, locale, onboarding flags).

Offline-first requirements to be documented in `docs/02-architecture/offline-sync.md` and per module: sync queue, background sync, retry with backoff, conflict resolution policy per entity type, local cache with expiration, queue recovery after crash, network monitoring, pending-operations UI. **Pending (unsynced) data must never be deleted** by cache eviction or retention cleanup.

### 5.2 Admin web — Next.js

TypeScript, App Router, feature-based architecture, React Query for server state, React Hook Form + Zod for forms/validation, Tailwind + shadcn/ui, TanStack Table for data grids, Axios client with interceptors. Server Actions only where they are genuinely appropriate; the primary contract is the REST API. Desktop-first responsive.

### 5.3 Backend — NestJS

Modular monolith with module boundaries clean enough to extract microservices later without rewriting business logic. Clean Architecture, DDD-inspired (entities, value objects, domain services where they earn their keep), repository pattern, dependency injection, Drizzle ORM, Swagger/OpenAPI generated from code, JWT + refresh token. CQRS only if a specific module justifies it via ADR.

### 5.4 Data and infrastructure

PostgreSQL (single shared database), Drizzle ORM (schema in TypeScript, migrations via drizzle-kit; **Prisma is prohibited**), Redis (cache, rate limiting, session/device bookkeeping), BullMQ (background jobs: payroll runs, exports, notifications, sync fan-out), Firebase Storage (files), Firebase Cloud Messaging (push).

### 5.5 Multi-tenancy

Shared PostgreSQL, isolation via `tenant_id` on every tenant-owned table. Repositories must scope every query by tenant automatically (no query can "forget" the tenant filter by construction). Cross-tenant access is prohibited and must be structurally impossible from application code. The design must allow future migration to dedicated databases per tenant without changing business logic (tenant resolution behind an abstraction). Defense-in-depth via PostgreSQL RLS: see §6.

### 5.6 Employment model

V1: one employee ↔ one active employment ↔ one company. Concurrent employment unsupported. Schema and code must allow introducing a first-class `Employment` entity later without major refactoring — document the migration path in the Employee module and the relevant ADR.

### 5.7 Attendance V1 scope

Personal device only. GPS + geofence validation, offline attendance with Drift-backed queue and background sync. QR attendance optional (config per tenant). Shared-device kiosk excluded from V1 (planned post-GA — architecture must not preclude it). Local attendance history retention: 90 days; older history fetched from server on demand. Pending sync records are exempt from any retention cleanup.

### 5.8 Authentication

JWT access + refresh token with rotation, biometric login, PIN login, remember-device, secure storage (Keychain/Keystore via `flutter_secure_storage`), session management, device registration and revocation (admin- and self-service).

### 5.9 Authorization

RBAC with permission-based checks (permissions are the unit of enforcement; roles are permission bundles). Role templates + custom roles. Scoping: tenant-scoped and company-scoped roles. Every endpoint declares its required permission(s) in the API spec.

### 5.10 Error handling

Result pattern everywhere for business rules — on backend, admin web, and mobile. Exceptions are reserved for unexpected infrastructure failures. Frontend and backend share one error philosophy and one error-code catalog (`docs/03-standards/error-catalog.md`). Error codes are stable, namespaced (`AUTH_...`, `ATT_...`, `PAY_...`), and every module registers its codes in the catalog.

### 5.11 API standards

REST, URI versioning (`/api/v1/...`), Swagger, standard response envelope, standard error shape (code, message, details, correlation id), pagination (cursor for feeds, offset for admin tables — decide per resource in the API standards doc), filtering, sorting, searching conventions, idempotency keys for mutation endpoints that clients may retry (attendance punch, payment-affecting operations).

### 5.12 UI and design system

Mobile: modern, minimal — inspired by Mekari Talenta, Linear, Notion, Material 3. Admin: modern, professional, desktop-first — inspired by Mekari Talenta, Stripe Dashboard, Linear, Notion, Vercel Dashboard. Design system doc covers typography, spacing, elevation, iconography, dark + light mode, accessibility (WCAG 2.1 AA target), responsive rules, component library conventions (shadcn/ui on web; a documented Flutter component kit on mobile). The design-system document (`docs/03-standards/design-system.md`, Phase 2) is authored with the installed design skills in the loop — `ui-ux-pro-max` for the Flutter app, `frontend-design` for the Next.js admin — reconciling their recommendations against the inspiration set above. **STOP for user approval of `design-system.md` before any module UI Flow section is written.** Once approved, the document (not the skills) is the binding reference: skill output that conflicts with it or with §5 is rejected.

### 5.13 Security

OWASP ASVS-aligned: rate limiting, audit log, encryption in transit and at rest (field-level encryption for the most sensitive payroll/identity fields — ADR), password policy, token rotation, CSRF, XSS, SQL-injection prevention (Drizzle parameterized queries + input validation), security headers, CSP.

### 5.14 Performance

Caching strategy (Redis + HTTP caching where safe), lazy loading, pagination everywhere lists exist, virtual scrolling for large admin tables, image optimization, deliberate database indexes including composite indexes that always lead with `tenant_id`, query optimization guidance, connection pooling sized for the runtime model.

### 5.15 Testing

Flutter: unit, widget, integration, golden. Next.js: unit, integration, E2E (Playwright). NestJS: unit, integration, API tests. The testing strategy doc defines the pyramid, coverage expectations per layer, and how test scenarios trace back to `BR-*` / `UC-*` identifiers in module docs.

### 5.16 DevOps

Docker, Docker Compose for local dev, GitHub Actions CI/CD, environment strategy (local / staging / production), structured logging, monitoring, health checks (liveness + readiness), backup/restore procedures, secrets management. Concrete tooling defaults: §6.

## 6. Proposed defaults — confirm or override in Phase 0

Present this table to the user in Phase 0 for confirmation. Once confirmed, entries become binding (record the outcome in `ASSUMPTIONS.md` and, where architectural, as Accepted ADRs).

| # | Area | Proposed default |
|---|---|---|
| D1 | Scale targets | Design for 500 tenants; typical tenant ≤ 2,000 employees; design ceiling 10,000 employees/tenant. Attendance spike: 30% of a tenant's workforce clocks in within a 15-minute window. Payroll run for 10,000 employees completes < 30 minutes as background jobs. |
| D2 | Latency SLOs | API p95 < 300 ms reads, < 800 ms writes (excluding batch jobs). |
| D3 | Availability & DR | 99.9% monthly; PostgreSQL PITR with RPO ≤ 15 min; RTO ≤ 4 h. |
| D4 | Data retention | Payroll and tax records ≥ 10 years; audit log 2 years hot + cold archive; soft-deleted records purged per policy defined in database conventions. `> ⚠️ VERIFY` statutory retention periods. |
| D5 | Deployment | Containers everywhere. Dev: Docker Compose. Production: managed Kubernetes (GKE as reference — Firebase already implies Google ecosystem), cloud-portable manifests. Managed PostgreSQL and Redis. |
| D6 | Observability | Pino structured JSON logs; OpenTelemetry tracing; Prometheus + Grafana metrics; Sentry for error tracking (backend + web + Flutter). |
| D7 | Email | Provider-agnostic `MailService` interface; reference implementation Resend (**Amazon SES is prohibited**); templating via react-email or MJML. |
| D8 | Payslip/PDF | Server-side HTML→PDF (Puppeteer) behind a `PdfService` interface; confirm vs. pdfmake in an ADR. |
| D9 | Excel import/export | In scope for V1 (bulk employee import with row-level validation report; payroll, attendance, and report exports). Backend `exceljs` with streaming for large exports; import runs as BullMQ jobs with progress + downloadable error report. |
| D10 | Attendance anti-fraud | Selfie at clock-in/out (configurable per tenant), Android mock-location detection, basic device-integrity signals; Play Integrity / App Attest hardening is post-GA. Document detection limits honestly. |
| D11 | Tenant isolation depth | Repository-level scoping **and** PostgreSQL Row Level Security as defense-in-depth (session variable `app.tenant_id` set per request transaction via Drizzle's transaction API). Dedicated ADR. |
| D12 | i18n | id + en; id default; translation keys from day one; no hardcoded user-facing strings. |
| D13 | SaaS billing | **Out of V1.** Tenants provisioned manually by Super Admin. Schema/architecture must not preclude subscription billing later (tenant plan/limits fields reserved). |
| D14 | Handbook language | English, with Indonesian regulatory terms kept in Indonesian. |

## 7. Execution plan (phased, file by file)

> Hard rule: one large file — or up to three small files — per task. Between major files, prefer a fresh context (`/clear`); rely on the repository, not the conversation.

### Phase 0 — Planning (STOP for approval at the end)

Deliverables, in this order:

1. Read `CLAUDE.md` and this spec in full.
2. `ASSUMPTIONS.md` — initial assumptions log (seeded with anything you already had to assume).
3. **Confirmation review of §6** — present the D1–D14 table with your recommendation to keep or change each default.
4. **Blocking questions** — one batched list, only for items that genuinely cannot be defaulted (business/commercial/legal choices). Do not ask about anything §5/§6 already covers.
5. `MANIFEST.md` — every file the handbook will contain: path, one-line scope, dependencies (which files must exist first), phase, status. Order Phase 3 modules by dependency (§10 gives the required order).
6. `PROGRESS.md` — status tracker seeded from the manifest (see §9.3).

Then **stop and wait for user approval**. Do not generate any `docs/` file in Phase 0. *(Recommended checkpoint: the user runs a `/grill-with-docs` session on the Phase 0 plan — manifest, assumptions, D1–D14 — before approving.)*

### Phase 1 — Anchor documents

Order: `docs/00-overview/product-overview.md` → `CONTEXT.md` (root glossary / domain language, seed) → `docs/03-standards/naming-conventions.md` → `docs/04-database/database-conventions.md` (audit fields, soft-delete strategy, naming, migration strategy, effective-dating pattern) → core ADRs → `docs/04-database/core-schema.md` (tenant, user, role/permission, company, employee core) → `docs/03-standards/error-catalog.md` (seed).

Core ADRs (one file each, template §9.2), minimum set:

ADR-0001 modular monolith and module boundaries · ADR-0002 multi-tenancy model + RLS defense-in-depth · ADR-0003 offline-first sync and conflict resolution · ADR-0004 authentication, sessions, and device management · ADR-0005 RBAC and permission model · ADR-0006 Result-pattern error handling across all stacks · ADR-0007 API versioning and response envelope · ADR-0008 approval workflow engine design · ADR-0009 file storage strategy (Firebase Storage, signed URLs, virus-scan posture) · ADR-0010 background jobs and event conventions (BullMQ) · ADR-0011 observability stack · ADR-0012 payroll calculation engine design (effective-dated config, run lifecycle, recalculation) · ADR-0013 database conventions and Drizzle usage patterns (soft delete, audit fields, effective dating, migration workflow with drizzle-kit) · ADR-0014 PDF generation · ADR-0015 import/export framework.

### Phase 2 — Cross-cutting architecture and platform modules

`docs/02-architecture/`: system-overview (C4-style context + container via Mermaid), backend-nestjs, mobile-flutter, admin-nextjs, offline-sync (the deep dive), multi-tenancy.
`docs/03-standards/`: api-standards, security-standards, design-system (see §5.12 — STOP for user approval), coding-standards per stack.
`docs/05-platform/` (module template §9.1 applies): authentication, authorization-rbac, approval-engine, notification (FCM + email + in-app), inbox, document-storage, audit-log, settings, import-export.

### Phase 3 — Business modules (dependency order)

**First file: `docs/06-modules/holiday.md` as the reference implementation.** Holiday is deliberately chosen: small, nearly standalone, yet touches tenancy, company/branch scoping, effective dating, admin CRUD, and mobile read/offline. Generate it, run the Definition of Done, then **STOP for user approval**. *(Recommended checkpoint for a `/grill-with-docs` session.)* Once approved, it is locked as the structural template every subsequent module must match (listed as an anchor in `CLAUDE.md`).

Then, in order: organization (company → branch → department → position) → employee → shift → attendance → leave → overtime → payroll → tax-pph21 → bpjs → expense-reimbursement → asset → recruitment-candidate → performance-goals → training → announcement → reports → dashboard-analytics → system-administration. Per-module required coverage: §10.

### Phase 4 — Operations, AI guide, closure

`docs/07-operations/`: testing-strategy, ci-cd, environments, observability runbook, backup-restore, performance.
`docs/08-ai-guide/`: ai-development-guide (see §14) and `implementation-claude-md-template.md` — the CLAUDE.md that the future **implementation** repositories will use, distilled from this handbook.
`docs/00-overview/implementation-roadmap.md`: build order, milestones, V1 cut, post-GA items (kiosk, billing, integrity hardening).
Final task: consistency audit pass — verify cross-references, glossary completeness, error-catalog completeness, manifest vs. actual files; log findings and fix.

## 8. Repository layout

```
/
├── CLAUDE.md                  # persistent rules (exists)
├── HANDBOOK_SPEC.md           # this file
├── CONTEXT.md                 # glossary / domain language (grill-with-docs convention)
├── ASSUMPTIONS.md             # Phase 0+
├── MANIFEST.md                # Phase 0
├── PROGRESS.md                # Phase 0
├── .claude/skills/next/SKILL.md   # optional /next command
└── docs/
    ├── 00-overview/           # product-overview, implementation-roadmap
    ├── adr/                   # ADR-0001-... (kebab-case titles; unnumbered dir name
    │                          # so grilling tools discover it)
    ├── 02-architecture/       # system-overview, backend-nestjs, mobile-flutter,
    │                          # admin-nextjs, offline-sync, multi-tenancy
    ├── 03-standards/          # naming-conventions, api-standards, security-standards,
    │                          # design-system, error-catalog,
    │                          # coding-standards-{flutter,nextjs,nestjs}
    ├── 04-database/           # database-conventions, core-schema, erd-overview
    ├── 05-platform/           # authentication, authorization-rbac, approval-engine,
    │                          # notification, inbox, document-storage, audit-log,
    │                          # settings, import-export
    ├── 06-modules/            # holiday (reference), organization, employee, shift,
    │                          # attendance, leave, overtime, payroll, tax-pph21, bpjs,
    │                          # expense-reimbursement, asset, recruitment-candidate,
    │                          # performance-goals, training, announcement, reports,
    │                          # dashboard-analytics, system-administration
    ├── 07-operations/         # testing-strategy, ci-cd, environments, observability,
    │                          # backup-restore, performance
    └── 08-ai-guide/           # ai-development-guide, implementation-claude-md-template
```

Phase 0's `MANIFEST.md` finalizes the exact file list; it may split or merge files with justification, but the structure above is the baseline.

## 9. Templates

### 9.1 Module document template (Phase 2 platform + Phase 3 business modules)

Every section below must be present, or explicitly `N/A — <reason>`.

```markdown
# Module: <Name>
Status · Related ADRs · Depends on (modules/docs)

## 1. Purpose & Scope        # what it does; explicit V1 exclusions
## 2. Actors & Permissions   # permission matrix: action × role; permission keys
## 3. Business Rules         # numbered BR-<MOD>-001…, each independently testable
## 4. Domain Model           # entities + Drizzle schema; stateDiagram-v2 for each
                             # lifecycle entity; invariants
## 5. Use Cases              # UC-<MOD>-001…: actor, precondition, main flow,
                             # alternate/exception flows, postcondition
## 6. UI Flow                # mobile and/or admin: screen inventory, navigation
                             # flowchart, empty/loading/error states
## 7. API                    # endpoint table, then full spec per endpoint per §2
## 8. Validation Rules       # field-level table (rule, message key, error code)
## 9. Edge Cases & Failure Modes
## 10. Offline Behavior      # mobile modules: deviations from the global sync
                             # standard only; otherwise N/A — admin-web only
## 11. Module Error Codes    # registered in the error catalog the same session
## 12. Background Jobs & Events  # BullMQ jobs; domain events emitted/consumed
## 13. Approval, Notification & Report Touchpoints
## 14. Test Scenarios        # key cases mapped to BR-*/UC-* ids
## 15. Future Improvements
```

### 9.2 ADR template

```markdown
# ADR-XXXX: <Title>
Status: Proposed | Accepted | Superseded by ADR-YYYY · Date · Deciders

## Context            ## Decision            ## Alternatives considered
## Tradeoffs          ## Consequences        ## Future considerations
```

Rationale/alternatives/tradeoffs live **here**, once — other documents link to ADRs instead of restating them.

### 9.3 PROGRESS.md format

A table: file path · phase · status (`pending / in-progress / done / approved`) · last updated · notes (decisions logged, items needing review). Update it at the end of every task, no exceptions.

## 10. Module inventory and required coverage

Everything from the original scope maps to a file. Platform modules (Phase 2) carry cross-cutting machinery; business modules (Phase 3) consume it.

**Platform (docs/05-platform/):**
- **authentication** — login (password, PIN, biometric unlock), JWT + rotating refresh, device registration/revocation, remember-device, session list, secure storage on mobile.
- **authorization-rbac** — permission catalog, role templates, custom roles, tenant/company scoping, permission checks middleware/guard design.
- **approval-engine** — generic engine used by leave, overtime, attendance correction, expense, resignation, data-change requests: multi-level chains, sequential/parallel steps, role- or position-based resolvers, delegation, escalation/SLA, audit trail.
- **notification** — FCM push, email, in-app; template registry, per-user preferences, delivery tracking, batching.
- **inbox** — unified task list (approvals, announcements requiring acknowledgment), read state, deep links.
- **document-storage** — Firebase Storage integration, signed URLs, file metadata table, per-module folders, size/type policies, employee document categories with expiry reminders (KTP, contracts, certifications).
- **audit-log** — who/what/when/before/after, tenant-scoped, tamper-evident append pattern, retention per D4.
- **settings** — hierarchical config (platform → tenant → company → branch), effective-dated where regulatory (tax/BPJS parameters).
- **import-export** — Excel framework per D9: validation pipeline, dry-run, error report, job progress.

**Business (docs/06-modules/), in generation order:**
1. **holiday** *(reference implementation)* — national holiday + cuti bersama calendars, per-company/branch overrides, yearly import, effect on attendance/leave/overtime.
2. **organization** — company, branch (timezone!), department hierarchy, position/job level; org chart data; effective-dated moves.
3. **employee** — master data incl. NIK, NPWP, PTKP status, BPJS numbers, bank account; PKWT/PKWTT status and contract end reminders; self-service edits via approval; documents; status lifecycle (active, on-leave, resigned, terminated); migration path to a future `Employment` entity (§5.6).
4. **shift** — shift definitions, patterns/rosters, assignment (individual/department), tolerance windows, breaks, cross-midnight shifts, schedule vs. holiday interplay.
5. **attendance** — clock in/out with GPS+geofence+selfie (D10), offline queue and sync per §5.7, attendance status derivation (late, early-leave, absent, incomplete), correction requests via approval engine, period locking for payroll.
6. **leave** — statutory + custom leave types (§4, item 3), balances, accrual/proration, carry-over policy, cuti bersama deduction policy, half-day rules, approval chains, calendar view, balance-affecting cancellations.
7. **overtime** — request → approval → actualization, government formula per §4, item 3 with `⚠️ VERIFY` markers, caps, conversion to pay or time-off (policy), feed into payroll.
8. **payroll** — component model (earnings/deductions, taxable/non-taxable, fixed/variable), effective-dated salary history, run lifecycle state machine (draft → calculating → review → approved → paid → closed), proration, THR run, final settlement, payslip PDF (D8), bank transfer file export, retro adjustments, period locks.
9. **tax-pph21** — TER monthly + December annual recalculation, PTKP, non-NPWP treatment, 1721-A1, integration points with payroll runs. Structure exact; rates as effective-dated config with verify markers.
10. **bpjs** — Kesehatan + Ketenagakerjaan (JHT/JP/JKK/JKM), employer/employee split, caps, JKK risk classes, registration data, monthly report exports. Same config/verify discipline.
11. **expense-reimbursement** — expense categories, limits/policies, receipt upload, approval, payroll or finance disbursement path.
12. **asset** — asset registry, assignment/return, condition, handover documents, loss/damage flow.
13. **recruitment-candidate** — job requisition + approval, publishing metadata, candidate pipeline (stage state machine), interviews/scorecards, offer + approval, hire → employee conversion.
14. **performance-goals** — review cycles, goal/OKR-or-KPI model, self/manager review, calibration hooks, rating scale config, outcomes feeding development records.
15. **training** — training catalog, sessions, enrollment/approval, attendance, certificates (document-storage), cost tracking.
16. **announcement** — targeting (tenant/company/branch/department), scheduling, acknowledgment tracking via inbox, push fan-out.
17. **reports** — report registry per module, parameterized generation as jobs, export formats, permission-scoped data access.
18. **dashboard-analytics** — role-based dashboards (HR, payroll, manager, executive), headcount/turnover/attendance/leave/payroll-cost widgets, caching strategy for aggregates.
19. **system-administration** — Super Admin: tenant provisioning (D13), plan/limit fields (reserved), feature flags, platform health, impersonation with audit safeguards.

## 11. Consistency protocol

1. Before writing a file: read its `MANIFEST.md` dependencies and the relevant anchors (`CLAUDE.md` list). For modules, always re-read the approved `holiday.md`.
2. While writing: any new term, error code, or assumption goes into its registry **in the same session**.
3. After writing: run §12, update `PROGRESS.md`, report decisions logged and anything needing user review.
4. Conflicts: anchors win. To change an anchor decision, supersede the ADR first (status change + new ADR), then update dependents — never silently diverge.

## 12. Definition of Done (per file)

1. All template sections present or explicitly `N/A — <reason>`.
2. Depth criteria of §2 satisfied for everything the file introduces.
3. No `TBD`/`TODO` without a corresponding `ASSUMPTIONS.md` entry.
4. Every regulation-dependent value carries the `⚠️ VERIFY` marker; none are presented as hardcoded constants.
5. All Mermaid blocks are syntactically valid (see §13 pitfalls).
6. All cross-references point to real files or `MANIFEST.md` entries.
7. New terms/error codes/assumptions registered in the same session.
8. No contradiction with anchors or Accepted ADRs.
9. `PROGRESS.md` updated.

## 13. Diagram standards

Mermaid only. `erDiagram` for data models (plus per-module Drizzle schema as the precise source of truth), `sequenceDiagram` for interactions (auth flows, sync, approval routing, payroll run), `stateDiagram-v2` for lifecycles, `flowchart TD` for processes and C4-style context/container views. Keep diagrams ≤ ~40 nodes; split rather than cram. Pitfalls: avoid parentheses and unescaped special characters in node labels; quote labels containing spaces/punctuation.

## 14. AI Development Guide — required content (Phase 4)

`docs/08-ai-guide/ai-development-guide.md` must give future AI assistants implementation rules for: Flutter, Next.js, NestJS, Drizzle, SQL, naming, testing, architecture, folder structure, and documentation. Every rule is imperative, with one compliant example and one violation example. It must also define: how an AI should traverse the handbook before coding a feature (which anchors, which module doc, which ADRs), how to propose deviations (new Proposed ADR, never silent divergence), and it must ship `implementation-claude-md-template.md` — the ready-to-use CLAUDE.md for the implementation repositories, distilled from this handbook and carrying over the `CONTEXT.md` + `docs/adr/` conventions (grilling) and the design-skill split — `ui-ux-pro-max` for the Flutter app, `frontend-design` for the admin web — so the same tooling works in the implementation repositories.

---

## Appendix A — Kickoff

Paste into Claude Code to start:

```
Read CLAUDE.md and HANDBOOK_SPEC.md in full, then execute Phase 0 exactly as
specified in HANDBOOK_SPEC.md §7. Stop after Phase 0 and wait for my approval.
Do not generate any docs/ files yet.
```

After approving Phase 0 (and the D1–D14 defaults), proceed with `/next` (if the optional skill is installed) or: "Generate the next pending file per MANIFEST.md, following HANDBOOK_SPEC.md."
