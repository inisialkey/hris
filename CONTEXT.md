# CONTEXT.md — Domain Glossary

Status: Active (Phase 1 anchor, grows every phase) · Seeded from: `docs/00-overview/product-overview.md` · Registry rule: `CLAUDE.md` (new domain term → this file, same session)

Single source of domain language for the handbook, the implementation repositories, and `/grill-with-docs` sessions. Definitions are binding: documents may refine a term only by editing it here first.

Conventions: official Indonesian regulatory terms stay in Indonesian with an English gloss. Terms are grouped by domain, alphabetical within a group. Concrete statutory rates/caps never appear here — they are effective-dated configuration (`docs/05-platform/settings.md`).

## 1. Tenancy & platform

| Term | Definition |
|---|---|
| Feature flag | Platform-level switch enabling or disabling a capability per tenant; managed by Super Admin (`docs/06-modules/system-administration.md`). The switches themselves exist only in code — a tenant can hold a value for a flag, never invent one. No flag is defined in V1; the mechanism ships ahead of its first use. |
| Impersonation | Super Admin acting **as a named tenant user** for support, always with a stated reason, a hard time limit, an audit trail, and a notice to the tenant. Never "entering a tenant" in general: the person entered as is chosen, because their permissions — not the Super Admin's — are what applies inside. |
| Platform | The single HRIS deployment serving all tenants; the scope of Super Admin. |
| Setting definition | Code-owned registry entry for one configuration key: type, allowed hierarchy levels, platform default, validation, effective-dating and client-visibility flags. Tenants set values; keys exist only in code (`docs/05-platform/settings.md`). |
| Setting resolution | Most-specific-wins lookup of a setting value along branch → company → tenant → platform default, optionally as-of a date — payroll/tax/attendance always read as-of the period being processed. |
| Tenant | One customer organization; the isolation boundary. Every tenant-owned row carries `tenant_id`; cross-tenant access is structurally impossible (`docs/adr/ADR-0002-multi-tenancy-rls.md`). |
| Tenant provisioning | Manual creation of a tenant by Super Admin in V1 (no self-signup, no billing — D13). A tenant is created whole: it always arrives with one company, one branch, its role templates, its settings, and one administrator who has been invited. There is no partly-created tenant. |

## 2. Organization

| Term | Definition |
|---|---|
| Branch | Physical location under a company; **owns the operational timezone** (WIB/WITA/WIT) used for attendance, shift, and display logic. |
| Company | Legal entity under a tenant; the payroll and tax boundary (PPh 21, BPJS registration, THR, payslips are per company). |
| Department | Organizational unit under a branch/company; forms a hierarchy (parent–child). |
| Effective dating | Pattern giving a record validity periods (`effective_from`/`effective_to`) so history is queryable as-of any date; used for org moves, salary, regulatory parameters. |
| Job level | Seniority grade attached to a position (e.g., staff, supervisor, manager band). |
| Org assignment | Effective-dated placement row pairing an employee with a position and a branch; at most one live per employee per date; moves supersede, never edit (`docs/06-modules/organization.md`). |
| Org chart | Reporting-line view derived from positions and their holders. |
| Position | A seat in the org structure (department + job level + title); an employee occupies a position, effective-dated. |
| Reporting line | Position-based manager chain: an employee's managers are the live holders of the position their position reports to; `direct_manager(n)` walks n reports-to edges up, excluding the subject (`docs/06-modules/organization.md`). |

## 3. Employment & employee

| Term | Definition |
|---|---|
| Contract-end reminder | Scheduled notification ahead of a PKWT end date. |
| Data-change request | Employee self-service edit of master data that must pass an approval chain before taking effect. |
| Employee | A person employed by one company within a tenant; V1: exactly one active employment (`HANDBOOK_SPEC.md` §5.6). |
| Employee status | Lifecycle state of an employee: `active`, `on-leave`, `resigned`, `terminated` (state machine in `docs/06-modules/employee.md`). |
| Employment | The relationship employee↔company. Not a first-class entity in V1; schema must allow extracting it later without refactoring (migration path in `docs/06-modules/employee.md`). |
| Field group | Data-change request grouping — `identity` \| `contact` \| `bank` \| `family` — fixing both the editable-field whitelist and the approval-chain selection dimension (`docs/06-modules/employee.md`). |
| Final settlement | Terminal payroll calculation on exit: prorated salary, remaining leave compensation, deductions, statutory components. |
| NIK | Nomor Induk Kependudukan — national identity number; also serves as tax identity for employees without NPWP (NIK-as-NPWP era). |
| NPWP | Nomor Pokok Wajib Pajak — taxpayer identification number. |
| PKWT | Perjanjian Kerja Waktu Tertentu — fixed-term employment contract; has an end date and contract-end reminders. |
| PKWTT | Perjanjian Kerja Waktu Tidak Tertentu — permanent employment. |
| PTKP status | Penghasilan Tidak Kena Pajak category (e.g., TK/0, K/1) determining the non-taxable income threshold for PPh 21. Categories are configuration data. |
| Rehire | New employee row for a person whose previous employment in the tenant ended; terminal rows are never reactivated — one live employment per person, episodes share a NIK until the Employment entity exists (`docs/06-modules/employee.md`). |

## 4. Time, shift, attendance & overtime

| Term | Definition |
|---|---|
| Actualization | Settling an approved overtime occurrence against attendance evidence: payable minutes are `min(approved, actual)`, tiers are resolved and pinned, and the result becomes payroll's input. Zero actual is a valid outcome — the order was not retroactively wrong, nobody worked (`docs/06-modules/overtime.md`). |
| Attendance anomaly | Flag raised on an attendance day that a human must look at — punch outside the geofence, mock location, orphan punch, missing clock-out, quarantined punch, clock drift, late arrival. Anomalies never block derivation; they queue the day for HR review. |
| Attendance correction | Request to fix a missing or wrong punch for one date; on approval it **writes correction-sourced punches** and voids what they supersede — never edits or deletes the original fact — and the day is recomputed through the normal derivation path. Routed through the approval engine when an employee files it, written directly by HR, audit-logged either way. |
| Attendance day | Derived, stored verdict for one employee on one date: status, measured minutes, and a pinned copy of the schedule it was judged against. Recomputed freely while its period is open, immutable once locked — this row, not a re-resolution of the roster, is what payroll reads (`docs/06-modules/attendance.md`). |
| Attendance period | Company-scoped date range that can be locked to freeze attendance derivation for payroll. Ranges never overlap; a date no period covers is open. Attendance owns the lock; every other module checks it through `PeriodLockPort`. |
| Attendance status | Verdict on an attendance day: `present`, `incomplete`, `absent`, `on_leave`, `off`, `off_worked`. Lateness is **measured, not classified** — `late_minutes` and `early_leave_minutes` are stored raw beside the shift's tolerances, so a day can be both late and early-leave and "late" means minutes above tolerance. |
| Clock in / clock out (punch) | Append-only attendance fact from the employee's personal device: device event time plus server arrival time, GPS and geofence evaluation, optional branch QR token, configurable selfie, and best-effort integrity signals. Works offline via the sync queue; once recorded, a punch is never edited or deleted. |
| Cross-midnight shift | Shift whose end time falls on the next calendar day; its working day — and therefore every punch inside its window — is the date it **starts** (`docs/06-modules/shift.md`). |
| Cuti bersama | Government-declared collective leave days (joint leave); tenant policy decides whether they deduct annual leave balance (deduction policy). The deduction is a ledger entry posted per employee per date, not a leave request — and because the date is non-working, a leave request spanning it is not charged for it, so the day costs exactly one day. |
| Day class | Which multiplier table an overtime occurrence is priced against: `work_day` when the roster schedules work that date, `rest_day` when it does not — weekly rest, rostered day off, or holiday alike. Pinned at approval, so a later calendar or roster change never re-prices ordered work. |
| Day off | Non-working day arising from the roster (a pattern's OFF entry or an explicit roster day without a shift) — distinct from a holiday, which is calendar-wide and scope-resolved. |
| Geofence | Allowed radius around a branch's coordinates. Policy per scope: `flag` (default) records the punch with its distance and a typed reason and queues the day for review; `strict` refuses the punch **online** and quarantines it when it arrives from the offline queue. A punch that already happened is never discarded. |
| Holiday calendar | Per-year set of national holidays + cuti bersama, with company/branch-level overrides; affects attendance, leave, and overtime multipliers (`docs/06-modules/holiday.md`). |
| Holiday negation | Narrower-scope holiday row with `observed = false` marking an inherited non-working day as a working day there (company works a national holiday; branch works a company day); resolution is most-specific-wins per date and kind. |
| Mock-location detection | Android signal that GPS is faked; recorded with the punch per D10 (best-effort, limits documented). |
| Multiplier-hour | An hour of overtime already weighted by its statutory factor — the unit that crosses from overtime to payroll. Payroll turns it into money by multiplying by the hourly wage basis; overtime never sees a rate. Two hours of rest-day work at 2× is four multiplier-hours. |
| Ordered overtime | Overtime a manager or HR files on an employee's behalf rather than the employee requesting it. Created approved with no approval chain, and it does not actualize until the employee acknowledges it — the acknowledgment is the worker-consent artifact a self-submitted request already carries. |
| Overtime (lembur) | Work beyond the scheduled shift, or any work on a non-working day. Exists **only** as an approved request: measured minutes with no order behind them are never payable, only reported. Lifecycle is request → approval → actualization → payroll feed; compensation is pay or time off per policy (`docs/06-modules/overtime.md`). |
| Overtime exemption | Job level whose holders have no overtime-pay entitlement, per the statutory job-category exclusion. Tenant-configured, empty by default, resolved as-of the occurrence date and pinned at approval. |
| Overtime occurrence | One date inside an overtime request — the unit that carries a day class, a planned window, actual minutes, the tier split, and its own lock verdict. Approval is one decision over the request; pricing, cancellation, and payroll consumption are all per occurrence. |
| Period locking | Locking an attendance period so derived days stop recomputing and corrections, roster edits, calendar edits, and org moves touching those dates are all refused. Unlocking needs a reason and is blocked while payroll holds a non-draft run over the range. |
| Punch window | Interval around a scheduled shift within which a punch is attributed to that shift (`start − punch_in_before`, `end + punch_out_after`); may not overlap another of the same employee's windows. Distinct from the tolerance window, which decides late/early-leave. |
| QR attendance | Optional per-tenant punch mode: a printed poster at the branch encodes a signed branch token that the punch must carry. Additive to the geofence, never a replacement for it; rotating the branch key invalidates old posters. |
| Quarantined punch | Queued punch that failed a policy gate on arrival. It is stored and visible to both the employee and HR, excluded from derivation until an HR act releases it, and its owner is notified — the offline counterpart of an online refusal. |
| Roster | Effective-dated assignment of a shift pattern to an employee, or to a company as its default arrangement; explicit per-day roster days override it. Resolution is most-specific-wins per employee per date, with holiday suppression applied (`docs/06-modules/shift.md`). |
| Roster day | Explicit schedule row for one employee on one date, overriding whatever the pattern would say; a row without a shift is a deliberate day off. |
| Shift | Named working-time definition (start, end, breaks, tolerance windows). |
| Shift pattern | Repeating sequence of shifts (e.g., 5-2, rotating 3-shift). |
| Standard daily hours (`H`) | The normal working hours of the date an overtime occurrence falls on. It is where the rest-day multiplier steps up from 2× to 3×, which is why the statute's three rest-day tables are one rule with three values of `H`. Taken from the roster's own schedule for that date; a day that never carries a shift falls back to the configured company value. |
| Time off in lieu (TOIL) | Overtime compensated with leave instead of pay. Credited into the leave ledger against the seeded `TOIL` type at the **multiplier-hour** figure, not raw hours, and redeemed as ordinary leave — same approval, same balance, same coverage answer to attendance. A TOIL occurrence never reaches payroll. |
| Tolerance window | Grace period around shift start/end before a punch counts as late/early-leave. |

## 5. Leave

| Term | Definition |
|---|---|
| Accrual | Periodic earning of leave balance — granted whole at period start (`upfront`) or in twelfths each month (`monthly`), prorated for mid-period joins. Every grant is a ledger entry, never a column edit. |
| Carry-over | Policy-bounded transfer of unused balance into the next leave period, capped per leave type and expiring a configured number of months into that period. Days held by a pending request never expire. |
| Cuti | Leave. Statutory types V1: annual (cuti tahunan), sick, maternity and miscarriage (per UU KIA), paternity, marriage, the UU 13/2003 art. 93(4) family-event days, and unpaid; plus tenant-defined custom types. Entitlements are configuration with VERIFY markers. |
| Half-day leave | Leave consuming 0.5 day of balance. **Not in V1** — an attendance day carries one whole-day verdict, so a half-day would derive as `on_leave` and contradict the punches from the other half; it unblocks when attendance supports day fractions (`docs/06-modules/attendance.md` §15, `docs/06-modules/leave.md` §15). |
| Leave balance | Available days per employee per leave type per leave period: `accrued + carried in + adjusted − used − expired − pending`. The `leave_ledger_entries` trail is the truth; the balance row carries the same arithmetic as columns so concurrent requests serialize on it. |
| Leave cancellation | Withdrawal of a leave request. The requester may cancel while pending, or an approved request strictly before its start date; on or after the start date only an administrator may, with a reason. Either way the balance is restored by a reversing ledger entry against the original period, never by editing history. |
| Leave ledger | Append-only record of every movement of a leave balance — accrual, carry-in, carry-expiry, usage, usage reversal, cuti bersama deduction, adjustment, settlement payout. Entries are never edited or deleted; a mistake is corrected by a compensating entry (`docs/06-modules/leave.md`). |
| Leave period | The `[start, end]` date range a balance belongs to. Basis is company policy: the calendar year, or the employee's join-date anniversary. Changing the basis affects periods opened afterwards; live periods are never re-keyed. |
| Leave type | Configuration deciding what a leave costs and who may take it: quota mode (`balance`, `per_request`, `unlimited`), paid flag, accrual and carry-over policy, eligibility, notice and backdate windows, attachment rule, whether it counts calendar days, and whether it moves the employee's status to `on-leave`. |
| Net leave days | The days a request actually charges: only dates the roster resolves as working, unless the type counts calendar days. Weekends, rostered days off, holidays, and cuti bersama are free by construction. Pinned on the request at approval, so a later roster edit cannot change what an approved leave cost. |
| Pending hold | Days reserved on a balance the moment a request is submitted and released or converted on its decision — what stops two overlapping requests spending the same day. A hold outlives adjustments and carry-expiry: once reserved, the days are the requester's. |
| Proration | Scaling of entitlement or pay to a partial period (mid-month join/exit, partial year). |

## 6. Payroll, tax & statutory contributions

| Term | Definition |
|---|---|
| 1/173 | Statutory divisor converting monthly wage to an hourly overtime basis. Payroll's parameter, not overtime's: overtime publishes multiplier-hours, payroll multiplies by `wage basis / 173`. |
| Bank transfer file | Export file for salary disbursement in the format a bank expects. |
| Calculation snapshot | Immutable copy of every payroll input (roster, salary as-of, attendance/overtime effects, component defs, parameter versions) taken at run creation; calculation is a pure function of it (`docs/adr/ADR-0012-payroll-calculation-engine.md`). |
| Calculation trace | Stored per-employee breakdown (bases, per-component amounts, tax steps, parameter versions) — the payslip explain-view and audit evidence. |
| BPJS Kesehatan | National health insurance; employer + employee contributions with a wage cap and a wage floor. Coverage extends to a fixed number of family members, with a surcharge per additional enrolled dependent. |
| BPJS Ketenagakerjaan | Employment social security: JHT (old age), JP (pension), JKK (work accident), JKM (death). Splits and caps are effective-dated configuration. |
| BPJS coverage exclusion | A recorded human judgement that one employee stands outside one program for an interval — a foreign national outside JP, someone covered through another employer, a late registration. Participation is otherwise automatic in every program the company has enabled. |
| BPJS registration | One company's participation in BPJS over an effective-dated interval: which programs it contributes to, at which JKK risk class, under which registration numbers. Revised by superseding the current version, never by overwriting it. |
| Contribution base | The wage a contribution is calculated on: the reported monthly wage, raised to a wage floor and lowered to a wage cap where either applies. Distinct from what was actually paid — a month of unpaid leave does not reduce it. |
| Employer cost | Money the employer owes on an employee's behalf that the employee never receives and that is never withheld from them. Sits outside net pay entirely, and is nonetheless taxable income to the employee for some contribution types. |
| Reported wage | The monthly wage an employer declares to BPJS, unaffected by proration for a mid-month join, exit, or unpaid absence. |
| Wage floor | Statutory lower bound of the contribution base — the applicable regional minimum wage. Regional rather than national, so its amount is tenant-entered while its applicability per program is statutory. |
| Form 1721-A1 | Annual PPh 21 withholding statement issued per employee. |
| JKK risk class | Company risk classification determining the JKK employer contribution rate. Carried on the company's BPJS registration and effective-dated, because a re-assessment must not re-price the months that came before it. |
| Final settlement | Money owed to a departing employee after their last regular pay: the prorated final period, encashed leave remainder, and outstanding deductions. A dedicated payroll run type. |
| Income class | A component's tax axis: regular income, irregular income, non-taxable, or final. Determines PPh 21 treatment and is independent of wage category — THR is non-wage but taxable-irregular; a receipted reimbursement is non-wage and normally non-taxable, though a category the employer configures as a benefit is non-wage and taxable-regular; a severance amount is non-wage and final. |
| Payment state | Whether an individual employee's money actually moved: pending, paid, or bounced. Tracked per employee and independent of the run's own state — a bounced transfer is a banking fact, not a payroll one. |
| Payroll component | Configurable earning or deduction; classified on two independent axes, wage category and income class, plus cadence (recurring/one-off) and how its amount is sourced. |
| Proration basis | The rule converting a monthly wage into a daily one for partial periods: calendar days, working days, or a fixed divisor. Contractual, not statutory, so it varies per company. |
| Retro flag | A mark that a closed period's inputs changed after the fact. It records that a difference may exist; it never changes what was paid. A human decides whether it becomes a retro adjustment. |
| Salary package | The set of component amounts constituting one employee's pay over one effective-dated interval. Revised as a whole — a promotion is one change to the package, not several unrelated changes to allowances. |
| Upah sebulan | The statutory monthly wage: basic wage plus fixed allowances. The base for BPJS contributions, THR, and (subject to a floor) the overtime hourly rate. Variable allowances are excluded. |
| Wage category | A component's statutory wage axis: basic wage, fixed allowance, variable allowance, or non-wage. Which categories a statutory base sums is fixed by law; classifying a component is the employer's decision. |
| Line kind | Whether a payroll line is an earning, a deduction, or an employer cost. Only the first two reach net pay; the third is the employer's own statutory liability, which some tax rules nonetheless treat as the employee's income. |
| Payroll run | Batch calculation for a company + period; lifecycle `draft → calculating → review → approved → paid → closed` (`docs/06-modules/payroll.md`). Types: regular, THR, final settlement. |
| Payslip | Per-employee output of an approved payroll run; PDF (D8). |
| PPh 21 | Employee income tax withholding. Monthly withholding uses TER; December (or exit month) uses the annual progressive recalculation. |
| Retro adjustment | Correction applied in a later run for an already-closed period. |
| Salary history | Effective-dated record of an employee's compensation; payroll always reads salary as-of the period. |
| TER | Tarif Efektif Rata-rata — average effective monthly withholding rate scheme (PP 58/2023, PMK 168/2023); rate tables are effective-dated configuration. |
| THR | Tunjangan Hari Raya — religious holiday allowance; eligibility, proration, and payment deadline per regulation; dedicated payroll run type. |
| Run type | Payroll run flavor sharing one engine: `regular`, `thr`, `final_settlement`; type-specific eligibility/proration rules. |
| Wage cap | Statutory upper bound of the wage base for a contribution type. |
| YTD ledger | Per-employee year-to-date accumulators (gross, taxable regular/irregular, PPh 21 withheld, final income and final tax, BPJS base and totals, and the employee JHT and JP contributions named separately because those two are the ones the annual tax path deducts) updated when a run closes; the single source for December/exit recalculation and 1721-A1, including any opening figures loaded at onboarding. |
| Biaya jabatan | Occupational cost allowed as a deduction in the annual PPh 21 computation: a fraction of gross income, subject to monthly and annual ceilings. |
| Gross-up | Tax method in which the employer pays a *tunjangan pajak* sized so that the withholding leaves the employee's intended take-home unchanged. The allowance is itself taxable income, which is why it cannot be a fixed amount. The alternative method is gross, where the employee bears the tax. |
| MTD slice | Month-to-date gross and PPh 21 already withheld in the same tax month, handed to the tax calculator so a month paid across several runs is priced on its combined base rather than each run in isolation. |
| Opening YTD | Year-to-date figures loaded for a tenant that begins using the system mid-year, so its first annual recalculation and Form 1721-A1 cover the whole year rather than the months the system happened to see. |
| Pinned PTKP | The PTKP status recorded for one employee's tax year at that year's first payroll run. A later change to the employee record applies from the following year — correcting a pinned year is an explicit, reasoned act. |
| PKP | Penghasilan Kena Pajak — taxable income after allowed deductions and PTKP, rounded down before the progressive rates apply. |
| PPh 21 final | Withholding on severance and comparable lump sums under a separate tariff. Excluded from the monthly withholding base and from the annual recalculation, and accumulated separately. |
| Tax profile | One employee's facts for one tax year: the pinned PTKP, the tax method, prior-employer figures, and which revision of Form 1721-A1 has been issued. |
| Tax year | The calendar year of a payroll run's payment date. Withholding follows payment, so a period paid in January belongs to the year it is paid in, not the year it was worked. |
| TER category | The grouping derived from an employee's PTKP status that selects which TER rate table applies to their monthly withholding. |
| Expense category | The tenant-configured class of an expense — transport, medical, training. It carries the receipt rule, the advisory limits, the disbursement route, and whether reimbursing it is taxable to the employee. |
| Expense claim | One employee's submission for money already spent: a header and one or more lines, each line a single expense with its own category, date, amount, and receipt. Approved as a whole or not at all. |
| Disbursement route | Whether an approved claim is paid inside a payroll run or by a separate finance transfer. Chosen on the category and pinned on the claim when it is submitted. |
| Over-policy line | A claim line above its category's advisory limit. It is flagged with the limit it exceeded, never refused — the approval chain decides, not a validator. |
| Natura / kenikmatan | Benefits in kind. Indonesian tax treats some of them as income to the employee rather than as a cost of the employer, which is why a reimbursement's taxability is configuration and not a constant. |
| Reimbursement | Repayment of a cost the employee bore on the employer's behalf, evidenced by a receipt. Distinct from an allowance, which is a fixed amount paid regardless of what was spent and lives on the salary package. |

> ⚠️ VERIFY: confirm against current Indonesian regulation before implementation. — applies to every statutory value referenced above (1/173 basis, TER tables and categories, PTKP thresholds, biaya jabatan rate and caps, PKP rounding, the severance final tariff, BPJS rates/caps/floors and the JP age ceiling, the dependent allowance and its surcharge, which employer premiums are taxable income and which employee contributions are tax-deductible, THR deadline, statutory leave entitlements). Also: which expense categories are genuine reimbursements and which are natura or kenikmatan taxable to the employee, and the thresholds that exempt them.

## 7. Approval, notification & workflow

| Term | Definition |
|---|---|
| Acknowledgment item | Inbox entry requiring explicit "I have read" confirmation (e.g., announcement); tracked per user. |
| Approval chain | Ordered configuration of approval steps for a request type; resolved per requester (`docs/05-platform/approval-engine.md`). |
| Approval step | One stage in a chain with an approver set and a quorum policy (`all`/`any`); sequence lives across steps, parallelism within one (`docs/adr/ADR-0008-approval-workflow-engine.md`). |
| Chain snapshot | Immutable copy of the resolved chain stored on the instance at submission; config edits never touch in-flight instances. |
| Fallback resolver | Step-level policy when resolution finds nobody (vacant position, no manager): skip, alternate resolver, or route to the tenant fallback role (default HR Admin). |
| Return for revision | Approver action sending a request back to the requester; resubmission restarts the full chain as a new instance. |
| Self-approval guard | Rule when the resolved approver is the requester: default reroute to next level; never `allow` by default. |
| Stuck instance | Approval instance whose active step resolved to zero assignees even after the vacancy fallback ladder; flagged, System Administrator notified, fixed by repairing org data then cancel + resubmit — never silently skipped. |
| Delegation | Temporary transfer of a user's approval authority to another user for a date range. |
| Escalation | Automatic re-routing/reminder when a step exceeds its SLA. |
| Inbox | Unified task list per user: pending approvals + acknowledgment items, with seen state (styling only — the badge counts open items) and deep links (`docs/05-platform/inbox.md`). |
| Notification template | Code-owned registry entry for one notification kind: key, channels (in-app/push/email), mandatory flag (preference-immune), audience, i18n keys, variable contract. Modules register templates on arrival; no runtime template CRUD (`docs/05-platform/notification.md`). |
| Requester | Employee on whose behalf a request (leave, overtime, correction, expense, data change) enters an approval chain. |
| Operation ID (opId) | Client-generated UUIDv7 identifying one queued offline mutation; doubles as its `Idempotency-Key`, and is persisted in a unique column on the row the operation creates — deduplication survives the Redis replay window (`docs/adr/ADR-0003-offline-sync-conflict-resolution.md`). |
| Resolver | Rule that yields the concrete approver(s) of a step: direct manager, position holder, named role, specific user. |
| Sync class | Conflict-policy classification every synced entity declares: `append-only fact`, `request aggregate`, `mutable owned record`, `reference data` (`docs/adr/ADR-0003-offline-sync-conflict-resolution.md`). |
| Sync queue | Drift-backed local queue of offline mutations on mobile; retried with backoff; **pending entries are never deleted by retention/cache cleanup** (`docs/adr/ADR-0003-offline-sync-conflict-resolution.md`). |
| Tombstone | Soft-deleted row included in delta-sync responses (`deletedAt` set) so devices evict their local copy; eviction still respects pending-data protection (`docs/adr/ADR-0007-api-versioning-response-envelope.md`, `docs/02-architecture/offline-sync.md`). |

## 8. Identity & access

| Term | Definition |
|---|---|
| Custom role | Tenant-defined permission bundle built from the static catalog; same machinery as templates, `is_system = false`. |
| Clone drift | Set difference between a cloned role's permissions and its source template's current permissions (templates re-sync on platform releases; clones never auto-follow). Surfaced as a role-editor nudge; adopting drift keys is always an explicit admin action. |
| Data scope | Row-visibility dimension orthogonal to permissions: `self` / `team` / `company` / `tenant`; resolved by modules via ownership helpers, documented per endpoint (`docs/adr/ADR-0005-rbac-permission-model.md`). |
| Device registry | Server-side record of a user's registered mobile installs; default one active device per user (tenant-tunable); punches carry the device id (`docs/adr/ADR-0004-auth-sessions-device-management.md`). |
| Permission | Unit of enforcement, code-defined, key `<ns>.<resource>.<action>`; roles bundle permissions; effective set = additive union of assignments. |
| Role assignment | Grant of a role to a user with scope on the assignment: `company_id` set = that company; `NULL` = tenant-wide. |
| Role template | One of the ten platform-defined system roles, seeded per tenant, immutable; tenants clone or build custom roles. |
| Local unlock | Biometric or 6-digit PIN gate protecting locally stored credentials on mobile; never a server credential; works offline; 5 failures wipe local tokens (not pending sync data). |
| Refresh token rotation | Every refresh use issues a new token and invalidates the old; reuse of a rotated token revokes the whole session family. |
| Remember-device | Web login option marking the session's device trusted: longer refresh lifetime; future MFA-skip hook. |
| Session | One login instance (mobile device or browser) with its own refresh-token chain; listable and revocable by the user and by System Administrator. |
| Rotation grace window | Short (10 s) idempotent-replay window after a refresh-token rotation: the just-rotated token returns the same successor pair instead of triggering family revocation. Separates legitimate multi-tab races from token theft. |

## 9. Documents & files

| Term | Definition |
|---|---|
| File category | Policy class of a stored file (selfie, employee document, receipt, generated document, import, CV) fixing allowed types, size cap, retention, and expiry-reminder behavior (`docs/adr/ADR-0009-file-storage-strategy.md`). |
| Signed URL | Short-lived server-minted URL for one GET/PUT on one object; the only way any client touches storage; minted only after permission + data-scope checks. |
| Staged upload | Two-phase upload: signed PUT into the staging prefix, then commit — verify (existence, size, magic-byte mime, sha256), move to the final path, mark metadata `committed`. Uncommitted objects auto-delete in 24 h. |

## 10. Jobs & events

| Term | Definition |
|---|---|
| Audit anchor | Daily per-tenant digest of audit rows (hash-chained to the previous day, mirrored to an external log sink) making after-the-fact tampering detectable without per-row chaining (`docs/05-platform/audit-log.md`). |
| Domain event | Immutable past-tense fact (`payroll.run.completed`) emitted by its owning module, consumed by 0..N subscribers; the only async cross-module channel (`docs/adr/ADR-0010-background-jobs-events.md`). Jobs are commands; events are facts. |
| Fan-out scan | Scheduling pattern: one platform-level UTC cron job iterates tenants and enqueues per-tenant child jobs; tenant/branch timezones resolve inside the child job. |
| Idempotent processor | Mandatory property of every job/event handler: safe under at-least-once delivery — checks current state (or an eventId guard) before side effects. |
| Sensitive read | Registered single-subject access to protected data (payslip mint, employee master view, audit query) that writes an access record in the same request; the UU PDP access-trail mechanism (`docs/05-platform/audit-log.md` §4.3). |
| Outbox | `domain_events` table written in the same transaction as the state change; a relay worker dispatches rows to subscriber handler jobs — no lost or phantom events on crash. |

## 11. Security & data protection

| Term | Definition |
|---|---|
| Blind index | Sibling column holding `HMAC-SHA256(tenant index key, normalized value)` of an encrypted field, enabling exact-match lookup and unique constraints without decrypting; NIK and NPWP only (`docs/adr/ADR-0016-field-level-encryption.md`). |
| Crypto-shredding | Rendering a tenant's encrypted fields permanently unreadable by destroying its DEK at offboarding; the UU PDP erasure instrument for whole tenants — individual erasure is purge-based instead (`docs/adr/ADR-0016-field-level-encryption.md`). |
| Envelope encryption | Key layering: a KMS-held KEK wraps per-tenant DEKs; data is encrypted under DEKs, KEK rotation only re-wraps them (`docs/adr/ADR-0016-field-level-encryption.md`). |

## 12. Import & export

| Term | Definition |
|---|---|
| Dry-run | Mandatory first pass of every import: full validation, zero writes, produces the summary + error workbook; commit is a separate explicit step that revalidates (`docs/adr/ADR-0015-import-export-framework.md`). |
| Error report | Generated xlsx mirroring the imported file with original row numbers + per-row error codes and localized messages; the contract for partial commits. |
| Import definition | Code-registered declaration of an import type: columns, validators, natural key, write mode (`create_only`/`upsert`/`update_only`), commit mode (`partial`/`strict`), template. |
| Partial commit | Default commit mode: valid rows apply, failed rows go to the error report; `strict` (all-or-nothing) reserved for payroll-affecting imports. |

## 13. Company property (asset)

| Term | Definition |
|---|---|
| Asset | One physical object the company owns and tracks — a laptop, a motorcycle, a SIM card. One registry row per object, always; there is no quantity and no stock concept (`docs/06-modules/asset.md`). |
| Asset code | The human-readable tag physically attached to the object. Unique per tenant, immutable once created, and the natural key of the registry import. |
| Asset category | Tenant-configurable grouping that decides two things and no more: whether a serial number is required, and whether a handover document is offered. Not policy in the expense sense — it carries nothing money-shaped. |
| Custody | The period during which one named employee holds one asset. Recorded as an asset assignment; the row whose return is unrecorded *is* the current holder, and an asset can be in only one pair of hands at a time. |
| Asset condition | The physical state of an object — `new`, `good`, `fair`, `poor`, `damaged` — captured at both ends of every custody episode so a return can be compared against the handover. Distinct from the asset's availability status. |
| Handover document | The record of a physical transfer, in two forms: the system-generated form (*Berita Acara Serah Terima*) and the wet-signed scan uploaded back against it. The first is what the system asserts, the second is what a person signed. |
| Asset incident | A reported damage, loss, or theft, with a resolution that decides what happens to the object. An incident may record that an employee was charged; it never moves money. |
| Retirement (asset) | Terminal removal of an object from service — written off, sold, scrapped, or donated — always with a reason. Distinct from deletion, which is available only for a registry row nobody ever signed for. |
| Read-model view | A named, read-only database view a module publishes over a narrow, non-sensitive subset of its own tables, which other modules may join. The third cross-module channel beside ports and events, permitted only under the four constraints of `docs/adr/ADR-0001-modular-monolith-module-boundaries.md` §6; `employee_directory` is the first. |

## 14. Hiring (recruitment)

| Term | Definition |
|---|---|
| Requisition | Approved permission to fill a named position a stated number of times. It carries the openings count, the hiring manager, and where the vacancy was advertised; it is opened by an approval and closed when filled, cancelled, or lapsed (`docs/06-modules/recruitment-candidate.md`). |
| Openings | How many people one requisition may hire. Counted by the requisition itself — no other part of the product tracks headcount capacity or budget. |
| Candidate | A person who might be hired, scoped to one company and identified by email. Not a user, not an employee, and not an account: the platform holds no identity for them and never contacts them. |
| Application | One candidate against one requisition — the pipeline record. A person applying to two vacancies is one candidate and two applications. |
| Stage | How far an application got: applied, screening, interview, offer. Moves forward only and may skip; a rejection freezes it where it stood, which is what makes the funnel readable. |
| Panel | The interviewers assigned to one interview. Each seat is a scorecard row from the moment it is assigned — an unfilled seat and an unsubmitted opinion are the same record. |
| Scorecard | One interviewer's verdict on one interview: a rating, a recommendation, and notes. Submitted once and never edited afterwards. |
| Offer | Approved terms extended to a candidate — salary, contract type, start date, and an expiry. Each revision is a new offer with its own approval, so a renegotiated figure never overwrites an approved one. |
| Conversion | The act that turns an accepted offer into an employee. One transaction running the ordinary hire use case; it requires both recruiting and employee-master authority, and it is the only thing that marks an application hired. |
| Anonymization | Erasing a candidate's identity in place — name, email, phone, and CV removed, the pipeline rows kept — once retention lapses. Distinct from deletion, which would take the funnel and the hire's provenance with it. |

## 15. Performance (performance-goals)

| Term | Definition |
|---|---|
| Review cycle | A company-scoped period everyone in it is reviewed over, carrying the rating scale, the goal-setting and review windows, and whether calibration applies. Nothing in performance exists outside a cycle (`docs/06-modules/performance-goals.md`). |
| Participant | One employee in one cycle. The row that carries the state, the pinned reviewer, and the final outcome — not a synonym for the employee, since one person may sit in two overlapping cycles. |
| Reviewer | The person who writes the manager review, pinned when the cycle launches and changed only deliberately. Distinct from the employee's current manager, who may be someone else by review time. |
| Goal | What was agreed at the start of a cycle, carrying a weight and — on a leaf — a measurement and a target. An objective is a goal with children; a KPI is a goal without. |
| Key result | A child goal beneath an objective. It carries the measurement; its parent carries none and takes its level from them. |
| Weight | A goal's share of the rating, in percent. Weights total exactly 100 among top-level goals and again among each parent's children. |
| Achievement | Actual against target, shown beside a goal. Context for a human judgment and never an input to the score. |
| Rating scale | The tenant's vocabulary of outcomes — the ordered levels a goal or a person can be rated at. Frozen once a cycle uses it; changing one means cloning it. |
| Rating level | One rung of a scale: a label, a numeric score, and the band of calculated scores it covers. |
| Self review | The employee's own assessment of his goals. Identical in shape to the manager's, and never scored. |
| Manager review | The reviewer's assessment. Produces the calculated score and the overall rating. |
| Calculated score | The weighted mean of the levels the manager gave each goal. It suggests an overall level and does not decide one, and the employee never sees it. |
| Calibration | An HR adjustment of a final rating, recorded beside the manager's rating rather than over it, with a reason and an actor. The employee sees the result, never the change. |
| Release | Publishing a cycle's results to their subjects as one cohort. Before it, no employee sees anything from the manager's side. |
| Development item | Something an employee is meant to work on, recorded during a review and belonging to the employee rather than the cycle — which is what lets it appear again next year. |

## 16. Learning (training)

| Term | Definition |
|---|---|
| Training category | The tenant's taxonomy of learning — K3, leadership, compliance. The dimension every training cost report groups by (`docs/06-modules/training.md`). |
| Course | A reusable curriculum: a title, a category, a duration. It carries no date, place, price, or capacity, and it is what an employee browses. |
| Training session | One dated running of a course, with a place, a trainer, a capacity, and a price. What an employee actually attends. Every session belongs to a course. |
| Delivery mode | Whether a session happens in a room or over a link. It is what decides whether the session's location is an address or a URL. |
| Enrollment | One employee in one session. Carries the approval state, the attendance verdict, and the cost of that seat. |
| Enrollment source | How the seat came about — the employee asked for it, or HR assigned it. A request goes through an approval chain; an assignment does not, because the assigner is the authority. |
| Capacity | How many seats a session has. Counted live against enrolled seats and never stored as a running total; unset means unlimited, which is what an online session is. |
| Session attendance | The single verdict — attended or no-show — recorded against an enrollment after the session. **Not the same thing as attendance in the time-and-attendance sense**: it is one judgment about one course, it has no notion of hours or lateness, and it never writes an attendance day. Being at a training session is not, by itself, a record of having been at work. |
| Training cost | What one seat cost, recorded on the enrollment. A session's total is the sum of its seats; there is no separate total, and a no-show still carries its cost. |
| Completion certificate | The document this system generates for someone who attended a completed session. Generated once and kept, so the copy a person was given never changes. |
| Certification | A credential an employee holds — a K3 card, a professional licence — with an issuer, an issue date, and usually an expiry. It belongs to the employee, not to any session, and may have been earned before they joined. Renewing one creates a new record rather than editing the old one. |
| Credential expiry | The date a certification stops being valid. It lives on the certification record and not on the uploaded scan, because a credential can be recorded before anyone photographs it, or never photographed at all. |

## 17. Company communication (announcement)

| Term | Definition |
|---|---|
| Announcement | Something the company tells its people: a title, a body, and the audience it was sent to (`docs/06-modules/announcement.md`). One-way by design — there is no reply, no comment, and no reaction. |
| Targeting rule | One line of an announcement's audience — a branch, a department, a position, or a job level. Rules add together rather than narrow each other, and no rules at all means everyone in scope. |
| Audience | Who an announcement is meant for, expressed as targeting rules. Distinct from the recipients, which is who those rules turned out to name. |
| Recipient | One person an announcement was actually sent to, fixed at the moment it was published. Someone who joins the department the next day is not a recipient, and someone who leaves it stays one. |
| Publishing | The act that sends an announcement. It resolves the audience into recipients, delivers the notice, and freezes the text — after it, only the pin and the expiry can still be changed. |
| Scheduled announcement | One that has been committed to go out at a stated time but has not gone out yet. It can still be taken back; it cannot still be edited into something else without being taken back first. |
| Retraction | Taking an announcement back. It disappears from everyone's list and any outstanding acknowledgment closes. It cannot un-tell anyone, which is why it needs a reason and cannot be undone. |
| Expiry | The date an announcement stops being shown. Unlike retraction it is a quiet ending — nothing closes, nothing is withdrawn, the notice simply stops being current. |
| Acknowledgment | A person's explicit confirmation that they have read an announcement. Recorded per recipient, and the reason a post can be evidence rather than only a notice. |
| Acknowledgment rate | How many of an announcement's recipients have confirmed reading it. Meaningful only because the recipient list is frozen — a moving audience gives a number nobody can reproduce. |
| Acknowledgment deadline | The date by which an announcement asks to be acknowledged. It sorts and styles the task; nothing is enforced and nothing is chased automatically. |
| Pinned announcement | One held at the top of the list regardless of age. The only way this system marks one notice as more important than another. |

## 18. Reporting (reports)

| Term | Definition |
|---|---|
| Report | A named question this system knows how to answer over its own data — a set of parameters in, a table of rows out (`docs/06-modules/reports.md`). Never a new fact: every number in a report belongs to the module that computed it. |
| Report catalog | The list of reports a person may run. It is filtered to what each person is already allowed to see, so two people looking at the same screen see different lists. |
| Report parameter | A value a report needs before it can run — a company, a date window, a cycle. Some are required, and a report that would otherwise scan without limit is one that requires them. |
| Derived report | A report that is the on-screen view of an export that already existed. Same question, same answer, now readable without downloading anything. |
| Owned report | A report whose answer needs data from more than one module, and which therefore reads across them directly. The reason the reporting module exists at all. |
| Applied scope | Whose rows a particular run actually covered — one person, a team, a company, or the whole tenant. Shown on every result, because a total means nothing until you know what it was counted over. |
| Report result | One run's answer: the columns, the rows, the totals, the scope it was computed at, and the moment it was computed. Never stored — asking again re-asks the question. |
| Sensitive report | A report that shows what individuals are paid or how they are taxed. Running one is recorded as an access to that data, not merely as a page view. |

## 19. Dashboards (dashboard-analytics)

| Term | Definition |
|---|---|
| Dashboard layout | A named, fixed arrangement of cards someone is shown when they open the product — `hr`, `payroll`, `manager`, `executive` (`docs/06-modules/dashboard-analytics.md`). A layout is offered only when the person can see at least one card in it, and it cannot be rearranged. |
| Widget | One card. It shows a number, a trend, a split, or a short list — always drawn from a report that already exists, never from a question asked separately. |
| Projection | Which shape a widget takes from its report: a single number, a series over time, a split by category, or the top few rows. The same report seen four ways is still one answer. |
| Comparison | The "versus last month" figure on a card. Computed by asking the same question again for the earlier period, never by a second, differently-worded question. |
| Better direction | Whether a rise in a particular number is good, bad, or neither. Turnover rising is bad, headcount rising is neither, and a card has to be told which — an arrow that guesses is a wrong signal. |
| Freshness | The moment a card's number was actually computed, shown on the card. A dashboard number may be up to an hour old; what it may never be is silently old. |
| Drill-through | Opening the report behind a card, with the same filters already applied. The card's number and the report's total are the same answer, so the two can never disagree. |
| Turnover | Leavers in a month against average headcount for that month. Leavers counts everyone whose employment ended, whatever the cause, including a fixed-term contract simply running out. Two organisations counting it differently get different numbers from the same facts, which is why the convention travels with the figure. |


## 20. Platform administration (system-administration)

| Term | Definition |
|---|---|
| Platform user | A member of the platform operations team. Not an employee of any tenant, not a user account inside one, and never holding a tenant permission. The only kind of person who can create a tenant or enter one from outside. |
| Platform console | The separate part of the admin web where platform users work: tenants, feature flags, platform health. It has its own login, its own credential, and no tenant to belong to. |
| Impersonation session | One bounded episode of a platform user acting as a tenant user: one named person, one stated reason, thirty minutes, one at a time. It ends when the operator leaves, when the time runs out, or when their platform login is revoked — never by being forgotten about. |
| Impersonation reason | The sentence a platform user writes before entering a tenant, kept with the session and repeated on every audit record it produces. Required because "who went in" without "why" is a log, not an account of what happened. |
| Tenant status | Whether a tenant is `active`, `suspended`, or `archived`. Suspended and archived both stop everyone in the tenant logging in; neither deletes anything, and every change is reversible. Statutory retention keeps running regardless of status. |
| Platform health | The operational view of the whole deployment: what has failed, in which queue, for which tenant, and what a person can do about it. Deliberately not a chart — the graphs live in the monitoring stack, and this is where the buttons are. |
| Failed job | A background job that exhausted its retries. It stays visible for a week and can be retried or discarded by hand. Retrying is safe because every job in the system is written to be safe to run twice. |
| Tenant key | The per-tenant encryption key material, held wrapped so nobody — including the platform — reads it in the clear. Created when the tenant is created; destroying it is what makes a tenant's encrypted data permanently unreadable, which is why nothing in the product can destroy it. |
