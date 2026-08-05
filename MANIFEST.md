# MANIFEST.md — Handbook File Inventory

Authoritative file list for the HRIS Engineering Handbook, per `HANDBOOK_SPEC.md` §7–§8 and §10. Row order within a phase = generation order. Statuses live in `PROGRESS.md`; this file records scope and dependencies only.

Conventions: **Depends on** names files that must exist first (transitive deps not repeated; every file also depends on its phase's anchors per `CLAUDE.md`). **STOP** rows are user-approval checkpoints. Deviations from the §8 baseline: `erd-overview.md` moved to Phase 4 (A-002 in `ASSUMPTIONS.md`).

## Phase 0 — Planning (control files)

| Path | Scope |
|---|---|
| `ASSUMPTIONS.md` | Assumption log + §6 defaults outcome |
| `MANIFEST.md` | This inventory |
| `PROGRESS.md` | Status tracker seeded from this manifest |

**STOP — user approval of Phase 0 (manifest, assumptions, D1–D14) before any `docs/` file is generated.**

## Phase 1 — Anchor documents

| # | Path | Scope | Depends on |
|---|---|---|---|
| 1 | `docs/00-overview/product-overview.md` | Product definition, functional scope, roles, client apps, locale/regulatory scope, module map, V1 exclusions | — |
| 2 | `CONTEXT.md` | Root glossary / domain language seed: tenancy, organization, employment, attendance, leave, payroll, approval terms (grows every phase) | product-overview |
| 3 | `docs/03-standards/naming-conventions.md` | Naming for DB objects, API paths, error codes, permission keys, events, jobs, files/folders across all three stacks | CONTEXT.md |
| 4 | `docs/04-database/database-conventions.md` | Audit fields, soft-delete strategy, effective-dating pattern, tenant column rules, index rules, drizzle-kit migration workflow, RLS session variable | naming-conventions |
| 5 | `docs/adr/ADR-0001-modular-monolith-module-boundaries.md` | Modular monolith, module boundary rules, microservice-readiness criteria | — |
| 6 | `docs/adr/ADR-0002-multi-tenancy-rls.md` | Shared DB + `tenant_id`, repository auto-scoping, PostgreSQL RLS defense-in-depth (D11), future per-tenant DB path | ADR-0001 |
| 7 | `docs/adr/ADR-0003-offline-sync-conflict-resolution.md` | Offline-first sync model, queue, retry/backoff, per-entity conflict policy, pending-data protection | — |
| 8 | `docs/adr/ADR-0004-auth-sessions-device-management.md` | JWT + rotating refresh, biometric/PIN unlock, remember-device, device registry/revocation | — |
| 9 | `docs/adr/ADR-0005-rbac-permission-model.md` | Permissions as enforcement unit, role templates + custom roles, tenant/company scoping | ADR-0002 |
| 10 | `docs/adr/ADR-0006-result-pattern-error-handling.md` | Result pattern across NestJS/Next.js/Flutter, exceptions for infra only, error-code philosophy | — |
| 11 | `docs/adr/ADR-0007-api-versioning-response-envelope.md` | URI versioning, response envelope, error shape, pagination/filtering/idempotency conventions | ADR-0006 |
| 12 | `docs/adr/ADR-0008-approval-workflow-engine.md` | Generic approval engine: chains, sequential/parallel steps, resolvers, delegation, escalation | ADR-0005 |
| 13 | `docs/adr/ADR-0009-file-storage-strategy.md` | Firebase Storage, signed URLs, metadata table, virus-scan posture | — |
| 14 | `docs/adr/ADR-0010-background-jobs-events.md` | BullMQ queues, job naming, retry policy, domain-event conventions | — |
| 15 | `docs/adr/ADR-0011-observability-stack.md` | Pino, OpenTelemetry, Prometheus/Grafana, Sentry (D6) | — |
| 16 | `docs/adr/ADR-0012-payroll-calculation-engine.md` | Effective-dated config, component model, run lifecycle, recalculation strategy | ADR-0010 |
| 17 | `docs/adr/ADR-0013-database-conventions-drizzle.md` | Drizzle usage patterns: soft delete, audit fields, effective dating, migration workflow | database-conventions |
| 18 | `docs/adr/ADR-0014-pdf-generation.md` | Puppeteer HTML→PDF behind `PdfService` vs pdfmake (D8) | — |
| 19 | `docs/adr/ADR-0015-import-export-framework.md` | exceljs streaming, BullMQ import jobs, dry-run, error reports (D9) | ADR-0010 |
| 20 | `docs/04-database/core-schema.md` | Drizzle schema: tenant, user, session/device, role/permission, company, employee core; relations, indexes, RLS notes | database-conventions, ADR-0002, ADR-0005, ADR-0013 |
| 21 | `docs/03-standards/error-catalog.md` | Seed: namespacing rules, envelope error shape, registration protocol, initial `AUTH_`/`VAL_`/`SYS_` codes (grows every module) | ADR-0006, ADR-0007, naming-conventions |

## Phase 2 — Cross-cutting architecture and platform modules

| # | Path | Scope | Depends on |
|---|---|---|---|
| 22 | `docs/02-architecture/system-overview.md` | C4-style context + container diagrams (Mermaid), runtime topology, request/data flow | product-overview, ADR-0001 |
| 23 | `docs/02-architecture/backend-nestjs.md` | Module layout, Clean Architecture layers, repository/DI/Result wiring, Drizzle integration, Swagger | system-overview, ADR-0001, ADR-0006 |
| 24 | `docs/02-architecture/mobile-flutter.md` | Feature-first structure, Cubit-default rule, Drift setup, repository/use-case/DI wiring, secure storage | system-overview, ADR-0003, ADR-0004 |
| 25 | `docs/02-architecture/admin-nextjs.md` | App Router feature structure, React Query/RHF+Zod/shadcn conventions, Axios interceptors, Server Actions policy | system-overview, ADR-0007 |
| 26 | `docs/02-architecture/offline-sync.md` | Deep dive: sync queue schema, background sync, retry/backoff, conflict resolution per entity, crash recovery, pending-ops UI | mobile-flutter, ADR-0003 |
| 27 | `docs/02-architecture/multi-tenancy.md` | Tenant resolution, repository scoping mechanics, RLS setup, per-tenant-DB migration path | ADR-0002, core-schema |
| 28 | `docs/03-standards/api-standards.md` | REST conventions, envelope, pagination (cursor vs offset per resource), filtering/sorting/search, idempotency keys, Swagger rules | ADR-0007, error-catalog |
| 29 | `docs/03-standards/security-standards.md` | OWASP ASVS mapping, rate limiting, encryption (incl. field-level), headers/CSP, UU PDP obligations | ADR-0002, ADR-0004, ADR-0005 |
| — | `docs/adr/ADR-0017-platform-identity-impersonation.md` | Platform identity ADR surfaced in Phase 3 (added 2026-08-04, system-administration.md grilling): `platform_sessions` as a second identity class, mandatory TOTP for platform users only, the 30-minute non-renewable impersonation token, no action deny-list, platform-user administration off the API | ADR-0002, ADR-0004, ADR-0005, core-schema |
| — | `docs/adr/ADR-0016-field-level-encryption.md` | Field-level encryption ADR mandated by spec §5.13 (added Phase 2): AEAD + blind indexes, per-tenant DEK envelope keys, crypto-shredding | ADR-0002, security-standards |
| — | `docs/adr/ADR-0018-statutory-calculation-test-strategy.md` | Statutory calculation test ADR surfaced in Phase 4 (added 2026-08-04, testing-strategy.md grilling): golden vectors as a defined artifact, structural vectors on a deliberately fictional rate set vs statutory vectors quarantined behind `⚠️ VERIFY`, never edit a vector to make a test pass, no money amount asserted outside a vector, pending verification blocks release not merge | ADR-0012, testing-strategy, payroll, tax-pph21, bpjs, overtime |
| — | `docs/adr/ADR-0019-release-and-promotion-model.md` | Release model ADR surfaced in Phase 4 (added 2026-08-04, ci-cd.md grilling): trunk-based with no release branch, the digest as release identity and the semver tag as a human label, automatic staging + human-promoted production, per-repo independent promotion with compatibility from the contract rather than co-testing, guaranteed rollback depth of exactly one release, contract steps as a one-way door | ADR-0007, ADR-0013, ci-cd, testing-strategy, system-overview |
| — | `docs/adr/ADR-0020-environment-isolation-and-production-data-boundary.md` | Environment isolation ADR surfaced in Phase 4 (added 2026-08-04, environments.md grilling): three environments with a closed `APP_ENV` set, two GCP projects with IAM as the enforced boundary rather than namespaces, production data never leaving the production project, **no anonymization path built at all** — refused because `ADR-0016`'s per-tenant DEKs make a scrubber useless or catastrophic and a column allowlist fails open — with forensic PITR inside the boundary as the replacement, and staging synthetic by construction | ADR-0002, ADR-0009, ADR-0016, environments, testing-strategy, ci-cd |
| — | `docs/adr/ADR-0021-availability-slo-service-window.md` | Availability ADR surfaced in Phase 4 (added 2026-08-04, observability.md grilling): D3's 99.9% monthly is 43 minutes and A-102's organization has no on-call rotation, so an unattended overnight outage spends a year of budget in one night — the SLO is scoped to a service window (08:00–20:00 WIB, Mon–Sat) and best-effort outside it, both windowed and unqualified availability are computed so the gap stays visible, detection is unaffected at every hour, and the trigger to revisit is commercial: the first contractual uptime SLA | ADR-0011, ADR-0019, environments, observability |
| — | `docs/adr/ADR-0022-tenant-scoped-recovery.md` | Recovery ADR surfaced in Phase 4 (added 2026-08-04, backup-restore.md grilling): `ADR-0002` puts 500 tenants in one database, so instance-wide PITR repairs one tenant's mistake by discarding every other tenant's writes — it is therefore reserved for damage that is genuinely instance-wide, and single-tenant loss is routed to a manual extraction through a clone inside the production project, made feasible by uniform `tenant_id`, stable `uuidv7` ids, `ADR-0016`'s ciphertext version prefix, and re-insertion as a new audited fact rather than a rewrite; explicitly not a product feature, and drilled semi-annually because it is manual | ADR-0002, ADR-0016, ADR-0020, backup-restore, environments |
| — | `docs/adr/ADR-0023-table-growth-and-partitioning.md` | Growth ADR surfaced in Phase 4 (added 2026-08-04, performance.md grilling): discharges the declarative-partitioning question `ADR-0002` and `ADR-0013` both deferred to the performance document by name — **no partitioning in V1** with a numeric trigger, against the first row-volume projection anyone has made (`attendance_punches` ~500M rows/yr at the D1 design point, two families exceeding the audit log, the only table already partitioned); records that on `attendance_punches` **hash by `tenant_id` is the only key still available**, because the `op_id` unique carries no date column and cannot, so the key that would make retention a `DROP PARTITION` is foreclosed by the constraint that makes offline dedup correct; and names attendance retention as an open regulatory question rather than inventing a horizon | ADR-0002, ADR-0003, ADR-0013, database-conventions, performance |
| — | `docs/adr/ADR-0024-tenant-onboarding-as-a-v1-capability.md` | Onboarding ADR surfaced in Phase 4 (added 2026-08-04, implementation-roadmap.md grilling): nine modules each refuse a bulk import for individually correct reasons, and together they leave a tenant at the D1 typical size unonboardable — `employee.master` carries no salary column and payroll writes **"No import."**, so two thousand multi-line effective-dated pay packages are typed by hand and until they are there is no payroll run; resolved without reversing a word of payroll's reasoning, because that reasoning is an argument against **supersede** and an onboarding package supersedes nothing, so `create_only` carries the property the excluded dry-run existed to buy — `payroll.salary_opening` ships in V1, bulk salary **revision** stays deferred behind the dry-run, and the general rule is stated so the next module to hit the wall does not rediscover it | ADR-0015, payroll, import-export, implementation-roadmap |
| 30 | `docs/03-standards/design-system.md` | Typography, spacing, color, dark/light, iconography, WCAG 2.1 AA, shadcn/ui + Flutter kit conventions (design skills in the loop, §5.12) | product-overview |
| — | **STOP — user approval of design-system.md before any module UI Flow section** | | |
| 31 | `docs/03-standards/coding-standards-flutter.md` | Dart/Flutter style, bloc/cubit rules, Drift patterns, test conventions | mobile-flutter |
| 32 | `docs/03-standards/coding-standards-nextjs.md` | TS/React style, feature folders, React Query patterns, form/validation conventions | admin-nextjs |
| 33 | `docs/03-standards/coding-standards-nestjs.md` | TS/NestJS style, layer rules, repository/Drizzle patterns, test conventions | backend-nestjs |
| 34 | `docs/05-platform/authentication.md` | Login (password/PIN/biometric), token lifecycle, device registration/revocation, session list, secure storage | ADR-0004, core-schema, api-standards |
| 35 | `docs/05-platform/authorization-rbac.md` | Permission catalog, role templates, custom roles, scoping, guard/middleware design | ADR-0005, core-schema, api-standards |
| 36 | `docs/05-platform/approval-engine.md` | Chain config, step types, resolvers, delegation, escalation/SLA, audit trail | ADR-0008, authorization-rbac |
| 37 | `docs/05-platform/notification.md` | FCM + email + in-app, template registry, preferences, delivery tracking, batching | ADR-0010, settings |
| 38 | `docs/05-platform/inbox.md` | Unified task list, read state, deep links, acknowledgment items | notification, approval-engine |
| 39 | `docs/05-platform/document-storage.md` | Firebase Storage integration, signed URLs, metadata, folders, size/type policies, expiry reminders | ADR-0009, core-schema |
| 40 | `docs/05-platform/audit-log.md` | Who/what/when/before/after, tenant scoping, tamper-evident append, retention (D4), UU PDP hooks | database-conventions, security-standards |
| 41 | `docs/05-platform/settings.md` | Hierarchical config (platform→tenant→company→branch), effective-dated regulatory parameters | database-conventions, core-schema |
| 42 | `docs/05-platform/import-export.md` | Excel framework: validation pipeline, dry-run, error report, job progress (D9) | ADR-0015, notification |

Note: `settings.md` is generated before `notification.md`'s dependency is strictly satisfied in row order (37 depends on 41); generation order for rows 34–42 follows §10 listing, but 41 may be pulled earlier if needed — record any reorder in `PROGRESS.md`.

## Phase 3 — Business modules (dependency order, §10)

| # | Path | Scope | Depends on |
|---|---|---|---|
| 43 | `docs/06-modules/holiday.md` | **Reference implementation.** National holiday + cuti bersama calendars, company/branch overrides, yearly import, effects on attendance/leave/overtime | core-schema, settings, import-export |
| — | **STOP — user approval of holiday.md; once approved it is the locked structural template** | | |
| 44 | `docs/06-modules/organization.md` | Company, branch (timezone), department hierarchy, position/job level, org chart, effective-dated moves | holiday (template), core-schema |
| 45 | `docs/06-modules/employee.md` | Master data (NIK, NPWP, PTKP, BPJS, bank), PKWT/PKWTT + contract reminders, self-service edits via approval, documents, status lifecycle, Employment-entity migration path | organization, document-storage, approval-engine |
| 46 | `docs/06-modules/shift.md` | Shift definitions, patterns/rosters, assignment, tolerance windows, breaks, cross-midnight, holiday interplay | organization, holiday |
| 47 | `docs/06-modules/attendance.md` | Clock in/out (GPS+geofence+selfie), offline queue/sync, status derivation, correction requests, period locking | shift, holiday, offline-sync, approval-engine |
| 48 | `docs/06-modules/leave.md` | Statutory + custom types, balances, accrual/proration, carry-over, cuti bersama deduction, half-days, approval, cancellations | holiday, employee, approval-engine |
| 49 | `docs/06-modules/overtime.md` | Request→approval→actualization, 1/173 formula (VERIFY), caps, pay-or-time-off conversion, payroll feed | attendance, shift, approval-engine |
| 50 | `docs/06-modules/payroll.md` | Component model, salary history, run lifecycle state machine, proration, THR run, final settlement, payslip PDF, bank file, retro, locks | employee, attendance, leave, overtime, settings, ADR-0012 |
| 51 | `docs/06-modules/tax-pph21.md` | TER monthly + December recalculation, PTKP, non-NPWP treatment, 1721-A1, payroll integration (rates as effective-dated config, VERIFY) | payroll |
| 52 | `docs/06-modules/bpjs.md` | Kesehatan + Ketenagakerjaan (JHT/JP/JKK/JKM), splits, caps, JKK risk classes, registration data, monthly exports (VERIFY) | payroll |
| 53 | `docs/06-modules/expense-reimbursement.md` | Categories, limits/policies, receipt upload, approval, payroll/finance disbursement path | approval-engine, document-storage, payroll |
| 54 | `docs/06-modules/asset.md` | Registry, assignment/return, condition, handover documents, loss/damage flow | employee, document-storage |
| 55 | `docs/06-modules/recruitment-candidate.md` | Requisition + approval, publishing metadata, pipeline state machine, interviews/scorecards, offer, hire→employee conversion | organization, employee, approval-engine |
| 56 | `docs/06-modules/performance-goals.md` | Review cycles, goal/OKR-KPI model, self/manager review, calibration, rating config | employee, organization |
| 57 | `docs/06-modules/training.md` | Catalog, sessions, enrollment/approval, attendance, certificates, cost tracking | employee, document-storage |
| 58 | `docs/06-modules/announcement.md` | Targeting, scheduling, acknowledgment via inbox, push fan-out | inbox, notification, organization |
| 59 | `docs/06-modules/reports.md` | Report registry per module, parameterized job generation, export formats, permission-scoped access | import-export, all prior modules (registry) |
| 60 | `docs/06-modules/dashboard-analytics.md` | Role-based dashboards, headcount/turnover/attendance/leave/payroll-cost widgets, aggregate caching | reports |
| 61 | `docs/06-modules/system-administration.md` | Super Admin: tenant provisioning (D13), plan/limit reserved fields, feature flags, platform health, impersonation with audit safeguards | core-schema, settings, audit-log |

## Phase 4 — Operations, AI guide, closure

| # | Path | Scope | Depends on |
|---|---|---|---|
| 62 | `docs/07-operations/testing-strategy.md` | Pyramid per stack, coverage expectations, BR-*/UC-* traceability | coding-standards (all three) |
| 63 | `docs/07-operations/ci-cd.md` | GitHub Actions pipelines per app, quality gates, migration handling | testing-strategy |
| 64 | `docs/07-operations/environments.md` | Local/staging/production, Docker Compose, GKE reference (D5, A-003), secrets management | system-overview |
| 65 | `docs/07-operations/observability.md` | Runbook: logs, traces, metrics, alerts, Sentry triage (D6) | ADR-0011 |
| 66 | `docs/07-operations/backup-restore.md` | PITR (D3), restore procedures, DR drills, retention (D4) | environments |
| 67 | `docs/07-operations/performance.md` | Caching strategy, index guidance, pooling, virtual scrolling, load-test targets (D1/D2) | api-standards, database-conventions |
| 68 | `docs/04-database/erd-overview.md` | Full-system ERD (Mermaid, split per domain), cross-module relations (A-002) | all Phase 3 modules |
| 69 | `docs/00-overview/implementation-roadmap.md` | Build order, milestones, V1 cut, post-GA (kiosk, billing, integrity hardening) | all modules |
| 70 | *(task)* schema-declaration sweep | Discharge `erd-overview.md` §10.1: 16 comment-only cross-module FKs → `.references()`; `payroll.md`'s eight tables gain real `.references()` + three `onDelete: 'cascade'`; `leave.md` audit-column override removed; `database-conventions.md` §8 `SET NULL` clause; `overtime.md` ADR-0001 miscite + solid non-FK notation; `naming-conventions.md` `pgTable('payroll_runs')` example renamed. **Exit condition: `node scripts/erd-check.mjs` exits 0.** Inserted 2026-08-04 (erd-overview regrilling). *Ordering relaxed 2026-08-05: row 71 shipped first. The stated reason — that the guide teaches Drizzle conventions by example — did not survive checking. The guide's pairs derive from ADR alternatives and coding-standards bans, and this sweep touches neither; its targets are 16 module documents' Drizzle blocks, which the guide never quotes. The one leak, `database-conventions.md` §8's `SET NULL` clause, was corrected in row 71's session. This row is unchanged in scope and still blocks nothing else.* | erd-overview |
| — | `docs/adr/ADR-0025-handbook-distribution-and-deviation-path.md` | Distribution ADR surfaced in Phase 4 (added 2026-08-05, ai-development-guide.md grilling): `HANDBOOK_SPEC.md` §14's traversal and deviation protocols are unwritable until three undecided things are settled — **how an implementation repository reaches the handbook** (a pinned git submodule at `docs/handbook/`, retiring ci-cd C8 and amending ADR-0018 decision 7, because vendor-plus-hash is a hand-built substitute for what a pin guarantees), **where a deviation is recorded when the handbook is read-only** (one ADR namespace, an ADR written inside the submodule clone, a PR on `hris-handbook`, implement-without-waiting under a grep-able marker), and **which side is wrong when code and handbook disagree** (authoritative for contracts, silent on implementation — without which either every refactor owes an upstream PR or the handbook rots while the traversal protocol still tells agents to trust it) | ADR-0006, ADR-0018, ci-cd, ai-development-guide |
| 71 | `docs/08-ai-guide/ai-development-guide.md` | Imperative rules per stack with compliant/violation examples, handbook traversal protocol, deviation protocol (§14) | all standards + modules, ~~schema-declaration sweep~~ | 
| 72 | `docs/08-ai-guide/implementation-claude-md-template.md` | Ready-to-use CLAUDE.md for implementation repos (CONTEXT.md + docs/adr conventions, design-skill split) | ai-development-guide |
| 73 | *(task)* final consistency audit | Cross-references, glossary completeness, error-catalog completeness, manifest vs actual files; log + fix | everything |
