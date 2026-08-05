# Product Overview

Status: Active (Phase 1 anchor) · Source: `HANDBOOK_SPEC.md` §3–§6, §10 · File inventory: `MANIFEST.md` · Defaults outcome: `ASSUMPTIONS.md`

This document defines what HRIS is, who uses it, what V1 contains, and how the functional scope maps to handbook modules. Architecture decisions live in `docs/adr/`; this file states scope, not rationale.

## 1. Product definition

**HRIS** is a multi-tenant enterprise HRIS SaaS for the **Indonesian market**. Business workflows are modeled on Mekari Talenta; the engineering stack is modern and owned end to end (Flutter, Next.js, NestJS, PostgreSQL — binding constraints in `CLAUDE.md`).

One platform deployment serves many **tenants** (customer organizations). Tenants share one PostgreSQL database with `tenant_id` isolation and PostgreSQL RLS as defense-in-depth (`docs/adr/ADR-0002-multi-tenancy-rls.md`). Tenants are provisioned manually by the Super Admin in V1; subscription billing is out of scope but must not be architecturally precluded (D13).

## 2. Functional scope (V1)

Employee Self Service · Manager Self Service (approvals, team visibility) · HR Administration · Attendance · Leave · Overtime · Payroll (including PPh 21 and BPJS) · Organization · Recruitment · Performance · Asset · Expense/Reimbursement · Document Management · Company Announcement · Reports · Dashboard & Analytics · Approval Workflow.

Every capability maps to exactly one handbook module file — see §8. Explicit V1 exclusions — see §9.

## 3. Tenancy and organizational hierarchy

```
Platform (Super Admin)
└── Tenant (customer organization)
    └── Company (legal entity; payroll and tax boundary)
        └── Branch (physical location; owns the timezone)
            └── Department (hierarchy)
                └── Position / job level
```

- **Tenant** is the isolation boundary: every tenant-owned row carries `tenant_id`.
- **Company** is the legal/payroll boundary: PPh 21, BPJS registration, THR, and payslips are per company.
- **Branch** owns the operational timezone (WIB / WITA / WIT). Attendance, shift, and display logic resolve against the branch timezone; storage is always UTC.
- **Employee** belongs to one company and has exactly one active employment in V1 (`HANDBOOK_SPEC.md` §5.6). The schema must allow a first-class `Employment` entity later; the migration path is documented in `docs/06-modules/employee.md`.

## 4. Roles

RBAC with permissions as the unit of enforcement; roles are permission bundles (templates + tenant-defined custom roles), scoped to tenant or company (`docs/adr/ADR-0005-rbac-permission-model.md`, `docs/05-platform/authorization-rbac.md`). The ten role templates:

| Role | Scope | Primary surface | Summary |
|---|---|---|---|
| Employee | Company | Mobile | Self service: attendance, leave, overtime, payslip, profile, documents, expense claims |
| Manager | Company (team) | Mobile | Everything Employee has, plus team approvals and team visibility |
| HR Staff | Company | Admin web | Day-to-day HR operations: employee records, attendance corrections, leave administration |
| HR Admin | Company | Admin web | Full HR configuration: policies, leave types, shifts, approval chains, org structure |
| Payroll Admin | Company | Admin web | Payroll runs, salary components, PPh 21, BPJS, THR, bank files, payslips |
| Recruiter | Company | Admin web | Requisitions, candidate pipeline, interviews, offers, hire conversion |
| Finance | Company | Admin web | Expense disbursement, payroll cost reports, reimbursement settlement |
| Company Administrator | Company | Admin web | Company settings, user accounts, role assignment within the company |
| System Administrator | Tenant | Admin web | Tenant-level technical administration: tenant settings, device revocation, audit access, integrations |
| Super Admin | Platform | Admin web | Tenant provisioning, feature flags, platform health, impersonation with audit safeguards |

Managers may additionally be granted admin-web access through permissions; the mobile app is their guaranteed surface. Role templates are starting points — the permission catalog in `docs/05-platform/authorization-rbac.md` is authoritative.

## 5. Client applications and platform components

| Component | Stack | Purpose |
|---|---|---|
| Employee App | Flutter (Android + iOS), offline-first | Employee Self Service + Manager Self Service |
| Admin App | Next.js App Router, desktop-first responsive web | HR administration, payroll, recruitment, reports, analytics, configuration, platform console |
| API | NestJS modular monolith, REST `/api/v1/...` | Single backend for both apps |
| Data & infra | PostgreSQL (shared, RLS), Redis, BullMQ, Firebase Storage, FCM | Persistence, cache/rate limiting, background jobs, files, push |

Architecture detail: `docs/02-architecture/` (system-overview, backend-nestjs, mobile-flutter, admin-nextjs, offline-sync, multi-tenancy).

## 6. Locale and regulatory scope — Indonesia

First-class architectural input, not localization garnish.

- **Currency:** IDR everywhere money appears.
- **Time:** store UTC; resolve display and attendance/shift logic against branch timezone (WIB/WITA/WIT).
- **i18n:** Bahasa Indonesia (default) + English on both apps; translation keys from day one; no hardcoded user-facing strings (D12).
- **Data protection:** UU PDP 27/2022 obligations (consent, purpose limitation, retention, breach handling) are addressed in `docs/03-standards/security-standards.md` and `docs/05-platform/audit-log.md`. Reference production region is GCP `asia-southeast2` (Jakarta) for data residency (A-003).

Payroll and statutory concepts V1 must cover:

| Concept | Scope in V1 | Module |
|---|---|---|
| PPh 21 | Monthly TER scheme, annual/December recalculation, PTKP categories, employees without NPWP (NIK-as-NPWP era), Form 1721-A1 output | `docs/06-modules/tax-pph21.md` |
| BPJS Kesehatan | Employer/employee portions, wage cap | `docs/06-modules/bpjs.md` |
| BPJS Ketenagakerjaan | JHT, JP, JKK, JKM; employer/employee splits; caps; JKK risk classes | `docs/06-modules/bpjs.md` |
| THR | Eligibility, proration, payment deadline, dedicated payroll run type | `docs/06-modules/payroll.md` |
| Overtime pay | Government formula on the 1/173 monthly-wage basis; weekday vs holiday multipliers | `docs/06-modules/overtime.md` |
| Statutory leave | Annual, sick, maternity/paternity (UU KIA), marriage, bereavement, cuti bersama with configurable deduction policy | `docs/06-modules/leave.md` |
| Employment types | PKWT / PKWTT, contract-end reminders, prorated joins/exits, final settlement on termination | `docs/06-modules/employee.md`, `docs/06-modules/payroll.md` |

Referenced legislation (non-exhaustive): UU 13/2003 jo. UU Cipta Kerja and implementing PPs, PP 58/2023 + PMK 168/2023 (TER), UU KIA, UU PDP 27/2022.

> ⚠️ VERIFY: confirm against current Indonesian regulation before implementation.

Binding handbook rule (`HANDBOOK_SPEC.md` §4.4): every concrete rate, cap, or threshold carries the VERIFY marker, and all such values are modeled as **effective-dated configuration data** (`docs/05-platform/settings.md`) — never hardcoded.

## 7. Non-functional targets

Confirmed in Phase 0 (D1–D14, `ASSUMPTIONS.md`); binding.

| Area | Target |
|---|---|
| Scale (D1) | 500 tenants; typical tenant ≤ 2,000 employees; design ceiling 10,000. Attendance spike: 30% of a tenant's workforce clocks in within 15 minutes. Payroll run for 10,000 employees < 30 minutes as background jobs |
| Latency (D2) | API p95 < 300 ms reads, < 800 ms writes (excluding batch jobs) |
| Availability & DR (D3) | 99.9% monthly; PITR with RPO ≤ 15 min; RTO ≤ 4 h |
| Retention (D4) | Payroll and tax records ≥ 10 years; audit log 2 years hot + cold archive. > ⚠️ VERIFY: confirm against current Indonesian regulation before implementation. |
| Deployment (D5) | Docker Compose local; managed Kubernetes production (GKE reference, Jakarta region per A-003), cloud-portable |

## 8. Module map

Platform modules carry cross-cutting machinery; business modules consume it and document deviations only. Generation order and dependencies: `MANIFEST.md`.

**Platform (`docs/05-platform/`):** authentication · authorization-rbac · approval-engine · notification · inbox · document-storage · audit-log · settings · import-export.

**Business (`docs/06-modules/`):**

| Module | One-line scope |
|---|---|
| holiday | National holiday + cuti bersama calendars, company/branch overrides, yearly import. **Reference module — structural template for all others** |
| organization | Company, branch (timezone), department hierarchy, position/job level, effective-dated moves |
| employee | Master data (NIK, NPWP, PTKP status, BPJS numbers, bank account), PKWT/PKWTT, status lifecycle, documents |
| shift | Shift definitions, patterns/rosters, assignment, tolerance windows, cross-midnight shifts |
| attendance | GPS + geofence + selfie clock in/out, offline queue and sync, status derivation, corrections, period locking |
| leave | Statutory + custom types, balances, accrual/proration, carry-over, cuti bersama deduction, approvals |
| overtime | Request → approval → actualization, statutory formula, caps, pay-or-time-off conversion |
| payroll | Component model, salary history, run lifecycle, proration, THR run, final settlement, payslip PDF, bank file |
| tax-pph21 | TER monthly + December recalculation, PTKP, non-NPWP, 1721-A1 |
| bpjs | Kesehatan + Ketenagakerjaan contributions, caps, risk classes, monthly exports |
| expense-reimbursement | Categories, limits, receipts, approval, disbursement path |
| asset | Registry, assignment/return, condition, handover documents, loss/damage |
| recruitment-candidate | Requisition + approval, pipeline state machine, interviews, offer, hire → employee conversion |
| performance-goals | Review cycles, goals/OKR-KPI, self/manager review, calibration, rating config |
| training | Catalog, sessions, enrollment/approval, certificates, cost tracking |
| announcement | Targeting, scheduling, acknowledgment via inbox, push fan-out |
| reports | Report registry, parameterized job generation, export formats, permission-scoped access |
| dashboard-analytics | Role-based dashboards, headcount/turnover/attendance/leave/payroll-cost widgets |
| system-administration | Tenant provisioning, plan/limit reserved fields, feature flags, platform health, impersonation |

Cross-cutting standards every module inherits: `docs/03-standards/` (naming, API, security, design system, error catalog, per-stack coding standards) and `docs/04-database/` (conventions, core schema).

## 9. V1 exclusions

| Excluded | Status | Where the boundary is documented |
|---|---|---|
| Shared-device kiosk attendance | Post-GA; architecture must not preclude it | `docs/06-modules/attendance.md` |
| SaaS subscription billing | Post-V1; tenant plan/limit fields reserved (D13) | `docs/06-modules/system-administration.md` |
| Play Integrity / App Attest hardening | Post-GA; V1 ships selfie, mock-location detection, basic device-integrity signals (D10) | `docs/06-modules/attendance.md` |
| Concurrent employment (multi-company employee) | Future; `Employment` entity migration path documented | `docs/06-modules/employee.md` |
| Per-tenant dedicated databases | Future path; tenant resolution stays behind an abstraction | `docs/adr/ADR-0002-multi-tenancy-rls.md` |
| Flutter Web | Not planned | — |
| Desktop application | Not in V1 | — |

QR-code attendance is **in** V1 as a per-tenant configuration option, not an exclusion (`HANDBOOK_SPEC.md` §5.7).
