# ERD Overview

Status: Active (Phase 4) · Applies: `docs/04-database/database-conventions.md` (classes, standard columns, `ON DELETE` policy), `docs/04-database/core-schema.md` (the tables every domain hangs off) · Related ADRs: 0001 (module boundaries, table ownership, cross-module FK policy), 0002 (RLS), 0013 (Drizzle conventions), 0023 (table growth)

## 1. What this document owns

**Module docs own column-level truth; this document owns the map.** A column appears here only when it is an *edge* — a foreign key, or a pointer that deliberately is not one. Types, constraints, indexes, defaults, and business meaning stay in the owning module doc and are not repeated.

That seam has a direction. Where this document and a module doc disagree about a **column** — its type, its nullability, its name — the module doc wins and this file is stale. Where they disagree about whether an **edge exists at all**, this file is the one computed from all 115 tables at once, and the disagreement is a defect to be logged, not a preference to be reconciled. §11 lists the four defects the first such pass found.

This is the only document in the handbook drawn from the whole schema simultaneously, so it answers the three questions no single module doc can:

1. **What is the complete table census, and what class is each table?** (§3, §4)
2. **Which foreign keys cross a module boundary?** ADR-0001 §5 allows them and requires each to be inventoried as extraction cost. Every module doc lists its own outbound FKs; nobody had the total until now. (§6)
3. **Which relations are deliberately *not* foreign keys, and why?** (§7)

§9.1's module template does not apply — this is a `docs/04-database/` reference document and follows the structure `core-schema.md` set. Sections that a module reader might look for and will not find here: Actors & Permissions, Business Rules, API, UI Flow, Jobs & Events, Approval touchpoints — **N/A: this file introduces no behaviour, only the map of structure that other files introduced.**

## 2. Notation

```
tenants ||--o{ users : has          one-to-many, real FK, NOT NULL on the child
companies |o--o{ counters : scopes  one-to-many, real FK, nullable on the child
a }o..o| b : "col, no FK"           logical pointer with NO database constraint (§7)
```

Crow's foot reads parent-to-child. Diagrams carry **no attributes** — attribute lists here would be a second, drifting copy of each module's Drizzle block, which `CLAUDE.md` forbids. Where a parent is reached by more than one column, the label names the column.

Anchor tables (`companies`, `employees`, `users`, `files`, `branches`, `approval_instances`) appear in several domain diagrams. They are drawn once as owners in their home domain and repeated elsewhere only as endpoints; a repeated node is the same table, never a copy.

## 3. Census

115 tables. Class is `database-conventions.md` §2 — it dictates the tenant column and whether RLS applies, and it is **not** inferable from the presence of a `tenant_id` column: four tables carry `tenant_id` as an ordinary FK while sitting in the platform class (§5).

| Class | Count | `tenant_id` | RLS |
|---|---|---|---|
| Platform | 19 | absent, or present as a plain FK to `tenants` | no |
| Tenant-owned | 68 | `NOT NULL` | yes |
| Company-scoped | 28 | `NOT NULL` + `company_id NOT NULL` | yes |

Nineteen platform tables is higher than `core-schema.md` alone suggests, because **nine of them are statutory parameter tables** — the five `tax_*` and three `bpjs_*` sets in §4.7, plus `overtime_rate_rules` in §4.6. Regulation is identical for every tenant, so it is code-seeded platform data, not tenant configuration.

By owning module (ADR-0001 §5 — exactly one owner per table, only the owner's repositories write it):

| Owner | Tables | Owner | Tables |
|---|---|---|---|
| `core-schema.md` | 14 | `organization.md` | 5 |
| `payroll.md` | 8 | `shift.md` | 5 |
| `performance-goals.md` | 8 | `training.md` | 5 |
| `recruitment-candidate.md` | 7 | `asset.md` | 4 |
| `approval-engine.md` | 6 | `attendance.md` | 4 |
| `bpjs.md` | 6 | `leave.md` | 4 |
| `employee.md` | 6 | `overtime.md` | 4 |
| `tax-pph21.md` | 6 | `system-administration.md` | 4 |
| `announcement.md` | 3 | `audit-log.md` | 2 |
| `expense-reimbursement.md` | 3 | `import-export.md` | 2 |
| `notification.md` | 3 | `settings.md` | 2 |
| `authentication.md` | 1 | `document-storage.md` | 1 |
| `holiday.md` | 1 | `inbox.md` | 1 |

**`payroll_runs` is owned by `payroll.md`.** It also appears as a worked example in `naming-conventions.md` §2; that occurrence is illustrative and is not a second definition (§11, finding 3).

## 4. Domain diagrams

The ten domains below partition all 115 tables — every table appears in exactly one domain, none twice, none omitted. The partition is a **presentation choice for legibility only** (spec §13 caps a diagram at ~40 nodes); it carries no architectural meaning and is not a module boundary. Module boundaries are ADR-0001's, and §6 is the document that respects them (A-171).

### 4.1 D1 — Platform, tenancy & configuration

11 tables. The only domain whose tables mostly sit *outside* RLS: `tenants`, `platform_users`, `platform_sessions`, `impersonation_sessions`, `tenant_keys`, `tenant_feature_flags`, `setting_definitions`, `domain_events`, `processed_events` are platform class; only `setting_values` and `counters` are tenant-owned.

```mermaid
erDiagram
  tenants ||--o{ tenant_keys : "one wrapped DEK per tenant"
  tenants ||--o{ tenant_feature_flags : holds
  tenants ||--o{ impersonation_sessions : "entered by"
  platform_users ||--o{ platform_sessions : opens
  platform_users ||--o{ impersonation_sessions : performs
  platform_sessions ||--o{ impersonation_sessions : "carries"
  impersonation_sessions }o--|| users : "target_user_id, the identity assumed"
  tenants ||--o{ counters : numbers
  companies |o--o{ counters : "company_id NULL = tenant-level counter"
  setting_definitions ||--o{ setting_values : "code-owned key, tenant-set value"
  companies |o--o{ setting_values : scopes
  branches |o--o{ setting_values : scopes
  tenants |o--o{ domain_events : "tenant_id NULL = platform event"
  domain_events }o..o| processed_events : "event_id, consumer idempotency, no FK"
```

`setting_definitions` is the code-owned registry and `setting_values` the tenant data: a tenant may hold a value for a key, never invent one. The `branch` / `company` / tenant / platform-default chain is `settings.md`'s most-specific-wins resolution, not four separate tables.

`impersonation_sessions` is the one table that touches both identity planes — a `platform_users` actor, a `users` target, inside a named tenant. It is platform class, so no RLS policy shields it; ADR-0017 governs access.

### 4.2 D2 — Identity & access

8 tables, all tenant-owned. Unchanged from `core-schema.md` §2 apart from `auth_tokens`, which `authentication.md` adds.

```mermaid
erDiagram
  tenants ||--o{ users : has
  users ||--o{ sessions : opens
  users ||--o{ devices : registers
  devices |o--o{ sessions : "device_id NULL = web session"
  users ||--o{ auth_tokens : "reset and verification"
  users ||--o{ user_roles : holds
  roles ||--o{ user_roles : grants
  companies |o--o{ user_roles : "company_id NULL = tenant-wide"
  roles ||--o{ role_permissions : bundles
  permissions ||--o{ role_permissions : in
  users |o--o| employees : "identity, at most one each way"
```

`permissions` is a platform catalog seeded from code — the only platform-class table an RLS-protected table points at, which is safe precisely because it holds no tenant data. `role_permissions` is a pure junction: no audit columns, cascade from `roles`, hard-deleted on role edit.

### 4.3 D3 — Organization

6 tables. Two self-references live here, and both are hierarchies rather than links.

```mermaid
erDiagram
  tenants ||--o{ companies : has
  companies ||--o{ branches : "owns the operational timezone"
  companies ||--o{ departments : has
  companies ||--o{ positions : has
  departments |o--o{ departments : "parent_department_id"
  departments ||--o{ positions : "department_id"
  job_levels ||--o{ positions : "job_level_id"
  positions |o--o{ positions : "reports_to_position_id"
  employees ||--o{ org_assignments : "placed by"
  positions ||--o{ org_assignments : "position_id"
  branches ||--o{ org_assignments : "branch_id"
```

`employees` carries no `branch_id` — placement is `org_assignments`, effective-dated, at most one live row per employee per date, superseded rather than edited. Every consumer that needs "which branch was this employee in on date D" reads that table as-of, and `attendance_punches.branch_id` is the pinned answer at punch time, not a duplicate of it.

`job_levels` is tenant-owned while `positions`, `departments`, and `branches` are company-scoped — a level is a tenant-wide grading vocabulary, a position is a company's org chart.

### 4.4 D4 — Employee master & records

7 tables. All hang off `employees`; none hangs off `users`.

```mermaid
erDiagram
  companies ||--o{ employees : employs
  employees ||--o{ employee_contracts : "PKWT and PKWTT terms"
  employees ||--o{ employee_documents : holds
  employees ||--o{ employee_family_members : "PTKP and BPJS dependents"
  employees ||--o{ employee_status_history : "state machine trail"
  employees ||--o{ employee_resignations : files
  employees ||--o{ employee_data_change_requests : requests
  employee_resignations }o--|| employee_status_history : "status_history_id"
  employee_contracts }o--o| files : "file_id, signed scan"
  employee_documents }o--|| files : "file_id, NOT NULL"
  employee_data_change_requests }o--o| approval_instances : "approval_instance_id"
  employee_resignations }o--o| approval_instances : "approval_instance_id"
  employee_status_history }o..o| employee_status_history : "source_id, polymorphic, no FK"
```

`employee_status_history.source_id` points at whatever caused the transition — a resignation, a data-change request, a payroll event, or nothing for a direct HR act. It is polymorphic and constraint-free (§7).

ADR-0016's encrypted set (NIK, NPWP, BPJS numbers, bank account) lives on `employees` as columns, not as a separate vault table — encryption is a column property, so it creates no edge and appears nowhere in this document.

### 4.5 D5 — Shift, roster & attendance

10 tables, and the system's volume centre: `attendance_punches` at roughly 500M rows/year and `attendance_days` at 250M at D1's design point (ADR-0023).

```mermaid
erDiagram
  companies ||--o{ shifts : defines
  companies ||--o{ shift_patterns : defines
  shift_patterns ||--o{ shift_pattern_days : "cycle days"
  shifts |o--o{ shift_pattern_days : "shift_id NULL = rest day"
  employees ||--o{ roster_assignments : "pattern, effective-dated"
  shift_patterns ||--o{ roster_assignments : assigns
  employees ||--o{ roster_days : "materialized day"
  shifts |o--o{ roster_days : "shift_id"
  employees ||--o{ attendance_punches : records
  branches |o--o{ attendance_punches : "branch_id, pinned at punch time"
  devices |o--o{ attendance_punches : "device_id"
  files |o--o{ attendance_punches : "selfie_file_id"
  employees ||--o{ attendance_days : "derived day row"
  attendance_punches |o--o{ attendance_days : "first and last punch"
  shifts |o--o{ attendance_days : "shift_id, FK added by shift migration"
  leave_requests |o--o{ attendance_days : "leave_request_id, FK added by leave migration"
  employees ||--o{ attendance_corrections : files
  attendance_corrections |o--o{ attendance_punches : "correction_id and voided_by_correction_id"
  attendance_corrections }o--o| approval_instances : "approval_instance_id NULL = HR direct"
  attendance_corrections }o--o| files : "attachment_file_id"
  companies ||--o{ attendance_periods : locks
  companies ||--o{ holidays : observes
  branches |o--o{ holidays : "branch_id NULL = all branches"
```

`attendance_punches` is append-only and carries no `version` — corrections never mutate a punch, they void it and write a new one, which is why the table takes two separate correction columns. It cannot be range-partitioned by date: its `op_id` unique index carries no date column, so purging is always a batched `DELETE` (ADR-0023, `database-conventions.md` §4.4).

`attendance_days.leave_request_id` is what makes a leave day and an attendance day one fact rather than two — the derived row points at the approved request rather than re-deriving absence.

### 4.6 D6 — Leave & overtime

8 tables. `overtime_rate_rules` is the only platform-class table here — statutory multipliers are regulation, not tenant configuration.

```mermaid
erDiagram
  companies |o--o{ leave_types : "company_id NULL = tenant-wide"
  employees ||--o{ leave_balances : holds
  leave_types ||--o{ leave_balances : "per type"
  employees ||--o{ leave_ledger_entries : "every accrual and deduction"
  leave_types ||--o{ leave_ledger_entries : "per type"
  leave_requests |o--o{ leave_ledger_entries : "leave_request_id"
  employees ||--o{ leave_requests : files
  leave_types ||--o{ leave_requests : "of type"
  leave_requests }o--o| approval_instances : "approval_instance_id"
  leave_requests }o--o| files : "attachment_file_id"
  employees ||--o{ overtime_requests : files
  overtime_requests }o--o| approval_instances : "approval_instance_id"
  overtime_requests ||--o{ overtime_occurrences : "planned then actualized"
  employees ||--o{ overtime_occurrences : worked
  job_levels ||--o{ overtime_exempt_job_levels : exempts
  overtime_occurrences }o..o| leave_ledger_entries : "toil_ledger_entry_id, no FK"
```

**The balance is never a stored truth that the ledger explains.** `leave_balances` is a materialized projection of `leave_ledger_entries`; the ledger is the record, and any disagreement is resolved by replaying the ledger.

`overtime_occurrences.toil_ledger_entry_id` is the single deliberate module-to-module pointer in the system with no constraint behind it — time-off-in-lieu credits an overtime occurrence into the leave ledger. `overtime.md` §schema justifies the missing FK on a reading of ADR-0001 that ADR-0001 does not support (§11, finding 1). The pointer itself is correct either way; only the stated reason is wrong.

### 4.7 D7 — Payroll, tax & BPJS

20 tables, and the largest concentration of **platform-class regulatory tables** in the handbook: `tax_parameters`, `tax_brackets`, `tax_ptkp_amounts`, `tax_ter_rates`, `tax_severance_brackets`, `bpjs_parameters`, `bpjs_program_rates`, `bpjs_jkk_risk_rates` — eight tables holding statutory values that are effective-dated, code-seeded, and identical for every tenant.

```mermaid
erDiagram
  companies ||--o{ payroll_components : "earning and deduction catalog"
  employees ||--o{ salary_histories : "effective-dated"
  salary_histories ||--o{ salary_history_lines : "per component"
  payroll_components ||--o{ salary_history_lines : "component_id"
  companies ||--o{ payroll_runs : executes
  payroll_runs }o--o| approval_instances : "approval_instance_id"
  payroll_runs ||--o{ payroll_run_employees : "one row per employee"
  employees ||--o{ payroll_run_employees : "snapshot frozen at run"
  payroll_run_employees ||--o{ payroll_run_lines : "payslip lines"
  payroll_runs ||--o{ payroll_run_lines : "run_id"
  payroll_components ||--o{ payroll_run_lines : "component_id, code denormalized"
  employees ||--o{ payroll_ytd_ledger : "per tax year"
  payroll_runs |o--o{ payroll_ytd_ledger : "last_run_id"
  employees ||--o{ payroll_retro_flags : "raised against a closed run"
  payroll_runs ||--o{ payroll_retro_flags : "closed_run_id and resolved_in_run_id"
  employees ||--o{ employee_tax_profiles : "PTKP status and NPWP"
  files |o--o{ employee_tax_profiles : "form_document_id, 1721-A1"
  companies ||--o{ company_bpjs_registrations : registers
  employees ||--o{ employee_bpjs_dependents : covers
  employees ||--o{ employee_bpjs_exclusions : excludes
  tax_parameters ||--o{ tax_brackets : "effective-dated set"
  tax_parameters ||--o{ tax_ptkp_amounts : "effective-dated set"
  tax_parameters ||--o{ tax_ter_rates : "effective-dated set"
  tax_parameters ||--o{ tax_severance_brackets : "effective-dated set"
  bpjs_parameters ||--o{ bpjs_program_rates : "effective-dated set"
  bpjs_parameters ||--o{ bpjs_jkk_risk_rates : "risk class rates"
```

**A payslip does not join to live configuration.** `payroll_run_employees.snapshot` freezes every pulled input as `jsonb` and `payroll_run_lines.component_code` denormalizes the catalog code — the catalog moves, a closed payslip does not. This is why the payroll tables carry so few outbound FKs relative to their size: the run *copies* rather than *references*, deliberately.

The eight statutory tables and their values carry the regulation marker in their owning module docs (`tax-pph21.md`, `bpjs.md`). **This document states no rate, cap, bracket, or multiplier**, so no marker is repeated here — the edges are structural facts, not regulatory ones.

`payroll_runs` is the only table in the system that both `expense-reimbursement.md` and `payroll.md` write against the same column (`expense_claims.payroll_run_id`, the pin) — see §6.

### 4.8 D8 — Approval, documents & platform services

15 tables. The domain every other domain points into.

```mermaid
erDiagram
  companies ||--o{ approval_chains : configures
  companies ||--o{ approval_instances : scopes
  employees ||--o{ approval_instances : "subject of the request"
  approval_instances ||--o{ approval_steps : "ordered, cascade"
  approval_steps ||--o{ approval_assignees : "candidate approvers, cascade"
  approval_instances ||--o{ approval_actions : "decision trail"
  approval_steps ||--o{ approval_actions : "step_id"
  users ||--o{ approval_actions : "actor"
  users ||--o{ approval_delegations : "delegator and delegate"
  approval_instances }o..o| request_target : "request_id, polymorphic, no FK"
  users ||--o{ files : uploads
  files }o..o| file_owner : "entity_type and entity_id, polymorphic, no FK"
  users ||--o{ import_jobs : runs
  files |o--o{ import_jobs : "file_id and error_report_file_id"
  files |o--o{ export_jobs : "file_id, the output"
  users ||--o{ notifications : addressed
  notifications ||--o{ notification_deliveries : "per channel, cascade"
  users ||--o{ notification_preferences : sets
  users ||--o{ inbox_items : "actionable work"
  users |o--o{ audit_logs : "actor_user_id NULL = system row"
  domain_events |o--o{ audit_logs : "event_id, channel-2 dedup"
  audit_logs }o..o| audit_target : "entity_type and entity_id, polymorphic, no FK"
  platform_users |o..o{ audit_logs : "impersonator_id, no FK, platform class"
  audit_anchors }|..|| audit_logs : "daily tamper-evidence anchor, no FK"
```

`request_target`, `file_owner`, and `audit_target` are **not tables** — they are the polymorphic endpoints named in §7, drawn so the shape of the coupling is visible rather than invisible.

`audit_logs` is append-only and never soft-deleted; `audit_anchors` computes a daily anchor over it rather than chaining every row, because per-row hash chaining would serialize concurrent writers on the chain head.

### 4.9 D9 — Talent: recruitment, performance & training

20 tables, three lifecycles, and the one place a candidate becomes an employee.

```mermaid
erDiagram
  companies ||--o{ job_requisitions : opens
  positions ||--o{ job_requisitions : "position_id"
  branches ||--o{ job_requisitions : "branch_id"
  employees ||--o{ job_requisitions : "hiring_manager_employee_id"
  job_requisitions ||--o{ requisition_publications : publishes
  companies ||--o{ candidates : "talent pool"
  files |o--o{ candidates : "cv_file_id"
  candidates ||--o{ job_applications : applies
  job_requisitions ||--o{ job_applications : receives
  job_applications |o--o| employees : "employee_id, set on hire conversion"
  job_applications ||--o{ interviews : schedules
  interviews ||--o{ interview_scorecards : scores
  employees ||--o{ interview_scorecards : "interviewer_employee_id"
  job_applications ||--o{ job_offers : extends
  files |o--o{ job_offers : "signed_offer_file_id"
  companies ||--o{ rating_scales : defines
  rating_scales ||--o{ rating_scale_levels : "ordered levels"
  companies ||--o{ review_cycles : runs
  rating_scales ||--o{ review_cycles : "scale pinned per cycle"
  review_cycles ||--o{ cycle_participants : enrolls
  employees ||--o{ cycle_participants : "participates"
  rating_scale_levels |o--o{ cycle_participants : "calibrated_rating_level_id"
  cycle_participants ||--o{ performance_goals : "goals and OKRs"
  performance_goals |o--o{ performance_goals : "parent goal"
  cycle_participants ||--o{ performance_reviews : "self and manager"
  employees ||--o{ performance_reviews : "reviewer_employee_id"
  performance_reviews ||--o{ review_goal_ratings : rates
  performance_goals ||--o{ review_goal_ratings : "goal_id"
  rating_scale_levels |o--o{ review_goal_ratings : "level_id"
  cycle_participants |o--o{ development_items : "arising from a review"
  employees ||--o{ development_items : "owned by"
  companies ||--o{ training_categories : groups
  training_categories ||--o{ training_courses : catalogs
  companies ||--o{ training_sessions : schedules
  training_courses ||--o{ training_sessions : "of course"
  branches |o--o{ training_sessions : "branch_id"
  employees |o--o{ training_sessions : "instructor"
  training_sessions ||--o{ training_enrollments : enrolls
  employees ||--o{ training_enrollments : attends
  development_items |o--o{ training_enrollments : "development_item_id"
  training_enrollments |o--o{ training_certifications : awards
  employees ||--o{ training_certifications : holds
  files |o--o{ training_certifications : "file_id, the scan"
```

**`job_applications.employee_id` is the hire conversion**, and it is nullable by necessity: it is `NULL` for every application that never becomes a hire, which is nearly all of them. A candidate is company-scoped and an employee is company-scoped, but they are separate identities — conversion links, it does not merge.

`training_enrollments.development_item_id` closes the loop from performance to training: a development item raised in a review can be discharged by an enrolment, which is the only edge between those two module groups.

### 4.10 D10 — Asset, expense & announcement

10 tables.

```mermaid
erDiagram
  companies ||--o{ asset_categories : groups
  companies ||--o{ assets : owns
  asset_categories ||--o{ assets : classifies
  branches ||--o{ assets : "branch_id, where it sits"
  assets ||--o{ asset_assignments : "custody"
  employees ||--o{ asset_assignments : holds
  users ||--o{ asset_assignments : "handed over by"
  files |o--o{ asset_assignments : "signed_handover_file_id and signed_return_file_id"
  assets ||--o{ asset_incidents : "loss or damage"
  asset_assignments |o--o{ asset_incidents : "during which custody"
  employees ||--o{ asset_incidents : "reported against"
  companies ||--o{ expense_categories : defines
  companies ||--o{ expense_claims : receives
  employees ||--o{ expense_claims : files
  expense_claims ||--o{ expense_claim_lines : "cascade"
  expense_categories ||--o{ expense_claim_lines : "category_id"
  files |o--o{ expense_claim_lines : "receipt_file_id"
  expense_claims }o--o| approval_instances : "approval_instance_id"
  expense_claims }o--o| payroll_runs : "payroll_run_id, the pin"
  companies ||--o{ announcements : publishes
  announcements ||--o{ announcement_targets : "audience rules"
  branches |o--o{ announcement_targets : "branch_id"
  departments |o--o{ announcement_targets : "department_id"
  positions |o--o{ announcement_targets : "position_id"
  job_levels |o--o{ announcement_targets : "job_level_id"
  announcements ||--o{ announcement_recipients : "resolved fan-out"
  employees ||--o{ announcement_recipients : receives
  users ||--o{ announcement_recipients : "acknowledged by"
```

`announcement_targets` is the only table in the system with **four mutually-nullable FKs into one module** — each row is one targeting rule against one organizational axis, and the four columns are alternatives, not a composite key.

`expense_claims.payroll_run_id` is the pin that guarantees a claim is paid once (BR-EXP-008): the query port stamps it, and the partial index `idx_expense_claims_payable` filters on `payroll_run_id IS NULL` so a pinned claim can never be returned to a second run.

## 5. Class is not inferable from the columns

Four tables carry a `tenant_id` column that is an ordinary foreign key rather than the RLS discriminator, and two more carry tenant payloads with no policy at all:

| Table | Has `tenant_id` | Class | Why |
|---|---|---|---|
| `tenant_keys` | yes, FK | platform | ADR-0016's wrapped per-tenant DEK. RLS here would let a tenant context reach its own key material. |
| `tenant_feature_flags` | yes, FK | platform | Super Admin writes it; a tenant reads its effect, never the row. |
| `impersonation_sessions` | yes, FK | platform | The actor is a `platform_users` row; no tenant context exists when it is created. |
| `domain_events` | yes, nullable | platform infra | `NULL` = platform event. The relay reads cross-tenant by design. |
| `processed_events` | no | platform infra | Consumer idempotency guard, keyed by consumer + event. |
| `permissions` | no | platform | Code-seeded catalog, no tenant data. |

`core-schema.md` §9 is the authority for this list. **Anything that derives RLS class by testing for a `tenant_id` column will get these six wrong** — including any generated migration tooling, any schema linter, and any reviewer working from the Drizzle block alone.

## 6. Cross-module foreign key inventory

ADR-0001 §5: cross-module FKs are **allowed** — the shared database keeps referential integrity per `database-conventions.md` §1.7 — but each is part of the extraction cost inventory, and module docs list their outbound FKs. This is the total.

**215 foreign keys. 142 cross a module boundary. Of those, 105 point at `core-schema.md`** — `employees` 38, `companies` 37, `users` 23, `tenants` 3, `platform_users` 2, `devices` 1, `domain_events` 1 — which is not extraction cost at all: core is the shared kernel every module is entitled to reference, and no extraction plan proposes moving it.

**The real inventory is the remaining 37: foreign keys from one module's table into another module's table.**

| Source module | Source table | Column | → Target | Target module | Null |
|---|---|---|---|---|---|
| announcement | `announcement_targets` | `branch_id` | `branches` | organization | nullable |
| announcement | `announcement_targets` | `department_id` | `departments` | organization | nullable |
| announcement | `announcement_targets` | `position_id` | `positions` | organization | nullable |
| announcement | `announcement_targets` | `job_level_id` | `job_levels` | organization | nullable |
| asset | `assets` | `branch_id` | `branches` | organization | NOT NULL |
| asset | `asset_assignments` | `signed_handover_file_id` | `files` | document-storage | nullable |
| asset | `asset_assignments` | `signed_return_file_id` | `files` | document-storage | nullable |
| attendance | `attendance_punches` | `branch_id` | `branches` | organization | nullable |
| attendance | `attendance_punches` | `selfie_file_id` | `files` | document-storage | nullable |
| attendance | `attendance_days` | `branch_id` | `branches` | organization | nullable |
| attendance | `attendance_days` | `shift_id` | `shifts` | shift | nullable ‡ |
| attendance | `attendance_days` | `leave_request_id` | `leave_requests` | leave | nullable ‡ |
| attendance | `attendance_corrections` | `attachment_file_id` | `files` | document-storage | nullable |
| attendance | `attendance_corrections` | `approval_instance_id` | `approval_instances` | approval-engine | nullable ‡ |
| employee | `employee_contracts` | `file_id` | `files` | document-storage | nullable |
| employee | `employee_documents` | `file_id` | `files` | document-storage | NOT NULL |
| employee | `employee_data_change_requests` | `approval_instance_id` | `approval_instances` | approval-engine | nullable ‡ |
| employee | `employee_resignations` | `approval_instance_id` | `approval_instances` | approval-engine | nullable ‡ |
| expense-reimbursement | `expense_claim_lines` | `receipt_file_id` | `files` | document-storage | nullable |
| expense-reimbursement | `expense_claims` | `approval_instance_id` | `approval_instances` | approval-engine | nullable ‡ |
| expense-reimbursement | `expense_claims` | `payroll_run_id` | `payroll_runs` | payroll | nullable ‡ |
| holiday | `holidays` | `branch_id` | `branches` | organization | nullable ‡ |
| import-export | `import_jobs` | `file_id` | `files` | document-storage | NOT NULL ‡ |
| import-export | `import_jobs` | `error_report_file_id` | `files` | document-storage | nullable ‡ |
| import-export | `export_jobs` | `file_id` | `files` | document-storage | nullable ‡ |
| leave | `leave_requests` | `attachment_file_id` | `files` | document-storage | nullable |
| leave | `leave_requests` | `approval_instance_id` | `approval_instances` | approval-engine | nullable ‡ |
| overtime | `overtime_exempt_job_levels` | `job_level_id` | `job_levels` | organization | NOT NULL |
| overtime | `overtime_requests` | `approval_instance_id` | `approval_instances` | approval-engine | nullable ‡ |
| payroll | `payroll_runs` | `approval_instance_id` | `approval_instances` | approval-engine | nullable ‡ |
| recruitment-candidate | `candidates` | `cv_file_id` | `files` | document-storage | nullable |
| recruitment-candidate | `job_offers` | `signed_offer_file_id` | `files` | document-storage | nullable |
| recruitment-candidate | `job_requisitions` | `position_id` | `positions` | organization | NOT NULL |
| recruitment-candidate | `job_requisitions` | `branch_id` | `branches` | organization | NOT NULL |
| settings | `setting_values` | `branch_id` | `branches` | organization | nullable ‡ |
| tax-pph21 | `employee_tax_profiles` | `form_document_id` | `files` | document-storage | nullable ‡ |
| training | `training_certifications` | `file_id` | `files` | document-storage | nullable |
| training | `training_sessions` | `branch_id` | `branches` | organization | nullable |

‡ = **deferred FK** (§8): the constraint exists but is added by a later migration, so the Drizzle column carries no `.references()`.

### 6.1 What the inventory says

**Three tables absorb 28 of the 37.** `files` takes 13, `branches` 8, `approval_instances` 7.

That is a far better result than 37 scattered edges, and it means the extraction cost is not distributed — it is concentrated in three seams that were designed as seams:

- **`files` (13)** — every module that stores a document points at one table. Extracting document-storage converts 13 FKs into 13 id-only references plus a URL-minting port. The edges are all leaf attachments; none carries business logic.
- **`branches` (8)** — organization is the module nobody extracts. Six of the eight are nullable scoping columns, and `assets.branch_id` / `job_requisitions.branch_id` are the two that are not.
- **`approval_instances` (7)** — every approvable module points at the engine, and **all seven are nullable**, because every one of those modules supports a direct administrative act with no chain. The engine can be extracted without a single NOT NULL violation.

The remaining nine are ordinary organizational references (`positions`, `departments`, `job_levels`) plus exactly **three genuine business couplings between business modules**:

| Edge | Meaning |
|---|---|
| `attendance_days.shift_id → shifts` | the day is scored against the rostered shift |
| `attendance_days.leave_request_id → leave_requests` | an approved leave day *is* the attendance day |
| `expense_claims.payroll_run_id → payroll_runs` | the pin that pays a claim exactly once |

Everything else in the business layer talks through ports and events. **Three constraints is the whole of the module-to-module coupling that the database enforces** — which is the strongest available evidence that ADR-0001's boundaries are real rather than aspirational.

## 7. Relations that are deliberately not foreign keys

| Source | Column | Points at | Why no constraint |
|---|---|---|---|
| `approval_instances` | `request_id` | `leave_requests` \| `overtime_requests` \| `expense_claims` \| `employee_data_change_requests` \| `attendance_corrections` | Polymorphic. The engine must not know its subject types; a FK would invert the dependency and make every new approvable module a schema change to the engine. |
| `files` | `entity_type` + `entity_id` | any owning entity | Polymorphic. One attachment table serving every module is the reason document-storage owns exactly one table. |
| `audit_logs` | `entity_type` + `entity_id` | any audited entity | Polymorphic, and additionally must survive its target: BR-AUD-006 keeps ids after the source row is erased under UU PDP. A FK would make the audit trail deletable by the erasure it is supposed to record. |
| `audit_logs` | `impersonator_id` | `platform_users` | Class crossing — a tenant-owned, RLS-protected table may not constrain against a platform table holding no tenant data. |
| `domain_events` | `aggregate_id` | any aggregate | Polymorphic outbox; rows purge at 30 days independently of their subject. |
| `processed_events` | `event_id` | `domain_events` | Both purge on independent schedules; a FK would make the consumer guard block the outbox purge. |
| `employee_status_history` | `source_id` | resignation \| data-change \| direct HR act | Polymorphic, and `NULL` for a direct act. |
| `overtime_occurrences` | `toil_ledger_entry_id` | `leave_ledger_entries` | The one module-to-module pointer left unconstrained on purpose. See §11 finding 1 — the pointer is right, the stated justification cites ADR-0001 for a rule ADR-0001 does not contain. |

**Every one of these is a documented decision, not an omission.** The distinction matters at review time: an unconstrained `*_id` column that appears in neither §6 nor this table is a bug.

## 8. Deferred foreign keys

Sixteen of the 37 cross-module FKs are declared out of band. The column is plain `uuid` in the owning module's Drizzle block, carrying a comment like *"FK added by organization.md migration"* or *"FK added after leave_requests exists"*, and the constraint arrives in a later migration.

This is **module load order, not laxity**: `holidays.branch_id` cannot carry `.references(() => branches.id)` when `holiday.md`'s schema file is imported before `organization.md`'s, and `attendance_days.leave_request_id` predates `leave.md` entirely.

Binding rules, so the pattern stays a pattern rather than a leak:

1. A deferred FK is still a foreign key. It appears in §6, it is counted as extraction cost, and it is created with the same `ON DELETE` policy it would have had inline.
2. The comment on the column names **which migration adds it**. A deferred FK with no named owner is indistinguishable from a forgotten one.
3. The constraint ships in the same release as the column. Deferral is within a migration sequence, never across a release boundary.
4. `drizzle-kit check` cannot see these — they are `-- manual:` SQL per `database-conventions.md` §10.4. **The CI drift gate does not cover them**, so §6 of this document is the only place the full set is enumerated.

## 9. Cascades and delete order

`database-conventions.md` §8 sets the default: `ON DELETE RESTRICT`, with `CASCADE` only for true composition and `SET NULL` only for optional actor columns. Purge jobs therefore delete children explicitly, in order.

Only **five** cascades are declared as code in the handbook:

| Child | Parent | Composition |
|---|---|---|
| `role_permissions` | `roles` | a permission grant is meaningless without its role |
| `approval_steps` | `approval_instances` | a step is meaningless without its instance |
| `approval_assignees` | `approval_steps` | a candidate approver is meaningless without its step |
| `notification_deliveries` | `notifications` | a channel attempt is meaningless without its notification |
| `expense_claim_lines` | `expense_claims` | a line is meaningless without its claim |

Three further compositions that `database-conventions.md` §8 names by example — *"payslip lines → payslip"* — are declared in `payroll.md` as `// FK cascade` **comments rather than as `onDelete: 'cascade'` code**: `payroll_run_employees → payroll_runs`, `payroll_run_lines → payroll_run_employees`, `salary_history_lines → salary_histories` (§11, finding 2).

Purge order for the deepest aggregate, payroll, is therefore: `payroll_run_lines` → `payroll_run_employees` → `payroll_retro_flags` and `payroll_ytd_ledger` references cleared → `payroll_runs`. **In practice this order is not exercised:** payroll and tax rows are exempt from every purge path and stay in the live database for the full ten-year window (`database-conventions.md` §4.4).

## 10. Fan-in

| Table | Inbound FKs | Reading |
|---|---|---|
| `companies` | 40 | The company is the payroll, tax, and legal boundary; company-scoped is the largest class for a reason. |
| `employees` | 38 | Nearly every business fact is about a person. |
| `users` | 27 | Actor columns beyond `created_by`/`updated_by` — approvers, uploaders, acknowledgers. |
| `files` | 13 | §6.1. |
| `approval_instances` | 9 | 7 cross-module, 2 internal. |
| `branches` | 9 | 8 cross-module, 1 internal. |
| `payroll_runs` | 5 | 4 internal, 1 from expense. |

`companies` and `employees` together take 78 of 215 edges — **36% of the entire foreign key graph points at two tables.** Both are `core-schema.md`'s, both are company-scoped, and neither is extractable. Any index, lock, or migration touching either is a whole-system event; `performance.md` §9.1's DDL cost table is the operative guidance.

Three self-references, all hierarchies: `departments.parent_department_id`, `positions.reports_to_position_id`, `performance_goals` parent goal. None is a linked list or an ordering trick.

## 11. Findings

Drawing the whole graph at once surfaced four defects. **None is fixed here** — this document has no authority over another module's file, and `CLAUDE.md` allows one file per task. All four are logged into the final consistency audit (MANIFEST #72).

1. **`overtime.md` §schema misstates ADR-0001.** It reads *"`toil_ledger_entry_id` carries no foreign key — it points into leave.md's aggregate, and ADR-0001 forbids the constraint even though the shared database would permit it."* ADR-0001 §5 says the opposite: *"Cross-module FKs are **allowed** … but each one is part of the extraction cost inventory."* ADR-0001 is Accepted and outranks a module doc (`CLAUDE.md` authority order). The **decision** — leaving this pointer unconstrained — is sound and is what §7 records; only the citation is wrong. Fix is a one-sentence rewrite in `overtime.md`, not an ADR supersession.
2. **Three composition cascades exist only as comments.** `payroll.md` declares `payroll_run_employees → payroll_runs`, `payroll_run_lines → payroll_run_employees`, and `salary_history_lines → salary_histories` with `// FK cascade` comments and no `onDelete: 'cascade'`. `database-conventions.md` §8 names the payslip-lines case as its own example of when `CASCADE` is correct. As written, an implementer generating from the Drizzle block gets `RESTRICT`.
3. **`payroll.md` declares no `.references()` at all** — zero across its eight tables, where every other module doc uses them. The FKs are in comments. This is why the payroll subgraph cannot be derived mechanically from the handbook and had to be reconstructed by hand for §4.7. Low severity, but it makes payroll the one module whose schema a generator will get structurally wrong.
4. **`naming-conventions.md` contains a full `pgTable('payroll_runs', …)` example.** Harmless to a human, but it is a second definition of a real table name in a document that is not its owner, and it defeats any tool that resolves table ownership by scanning for `pgTable`. Renaming the example to a fictitious table removes the ambiguity.

## 12. Maintenance

This document is derived, not authored: every count in it is a fact about the schema at a point in time, and every one of them goes stale the moment a module adds a table.

**Rule: any task that adds, removes, or re-points a table updates §3, §4, and — if the edge crosses a module boundary — §6, in the same session.** That is the existing registry discipline in `CLAUDE.md`, applied to this file.

The counts as of 2026-08-04: **115 tables, 215 foreign keys, 142 crossing a module boundary, 37 module-to-module, 8 documented non-FK pointers, 16 deferred FKs, 5 declared cascades.** A future reader who recounts and gets different numbers has found either a change nobody logged here or a defect — both worth the two minutes it takes to re-derive.
