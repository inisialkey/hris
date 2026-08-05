# ADR-0024: Tenant Onboarding as a V1 Capability

Status: **Proposed** · Date: 2026-08-04 · Deciders: engineering (surfaced during `docs/00-overview/implementation-roadmap.md` grilling)

## Context

Nine module documents refuse a bulk import, and every refusal is well argued on its own terms. `docs/05-platform/import-export.md` §4.3 records them: attendance, because spreadsheet-writable punch facts are the fraud amplifier that pushed `employee.master` to `create_only` (A-019); overtime, because a spreadsheet path around eligibility, statutory caps, and the period lock is a way to manufacture pay; expense, because a claim requires a receipt and a row cannot carry a JPEG; bpjs, because both of its tenant tables are sparse by design; recruitment, because a hard-unique email rejects an agency dump mid-file (A-057). And payroll, in bold — *"**No import.** Bulk salary import is deliberately excluded from V1 — a spreadsheet that silently supersedes effective-dated pay for a thousand people is the highest-blast-radius import in the product."*

Read one at a time, each is right. Read together, against the act of onboarding one tenant, they leave a step with no mechanism.

The `employee.master` import template carries *"master fields plus `company_code`/`branch_code`/`position_code`"* and **no salary column**. So a tenant at the D1 typical size of two thousand employees imports its people, its opening leave balances, its year-to-date tax figures (`tax.opening_ytd`, BR-TAX-015), its roster, its assets, and its certificates — and then enters two thousand multi-line effective-dated pay packages by hand through the admin UI. `docs/06-modules/payroll.md` §1 makes the package the first of the module's three layers of authority and the thing a run prices a period from — one effective-dated `salary_histories` record per employee per interval (BR-PAY-005). Without it there is no run, and without a run the product has not performed the function it exists for.

No module document could see this. `payroll.md` assessed its own blast radius correctly. `import-export.md` recorded nine separate refusals correctly. The gap is visible only from a document whose input is every module at once, which is why it surfaced during the roadmap and not before.

Two facts make the resolution cheap rather than a reversal.

**Payroll's argument is an argument against `supersede`, not against loading data.** The blast radius it names is a spreadsheet *silently superseding* live effective-dated pay. Onboarding is the **first** package for an employee who has none. There is nothing to supersede.

**The framework already has the mode that expresses exactly that.** `ADR-0015` gives `ImportDefinition` a `writeMode` of `create_only | upsert | update_only`. `employee.master` uses `create_only` for precisely this reason (A-019), and `leave.balance_adjustment` states the property in words — it writes additive entries and *"never an overwrite of a live balance, which is the property A-019 wanted and `employee.master` could not have."*

## Decision

### 1. Tenant onboarding is a first-class V1 capability, not a consequence of other features

A tenant that cannot be loaded cannot be sold to. The ordered onboarding sequence is owned by `docs/00-overview/implementation-roadmap.md` §7, and completing it end to end on staging is a gate on the first production release (§8 of that document).

### 2. Import exclusions are exclusions against `supersede`, never against seeding

This is the general rule, stated so the next module to hit the same wall does not have to rediscover it. A refusal grounded in *"a spreadsheet would silently overwrite live business data"* does not extend to a `create_only` definition that refuses any row whose target already exists, because the property the refusal protects is preserved by the write mode rather than by the absence of the import.

Refusals grounded in something else are untouched. Attendance's remains — a punch is a fact whose *creation* is the fraud, not its overwrite. Overtime's remains, for the same reason one step downstream. Expense's remains: the missing receipt is missing whether the row is new or not.

### 3. `payroll.salary_opening` is registered as a V1 ImportDefinition

- `writeMode: 'create_only'`, `partial` commit, natural key `[employee_number]`.
- **A row is refused when the employee already has any `salary_histories` record.** The refusal is the safety mechanism, which is why this definition requires no dry-run diff report.
- Permission `payroll.salary.import`, following the convention every other import in the registry uses — `holiday.calendar.import`, `employee.master.import`, `shift.roster.import`, `leave.balance.import`, `training.certification.import`.
- `rowHandler` is payroll's existing package-creation path, so BR-PAY-001's component typing and BR-PAY-005's btree_gist non-overlap exclusion apply per row unchanged.
- Registered in `import-export.md` §4.3, whose "Deliberate non-imports" paragraph is narrowed in the same place to name revision rather than all salary loading.

### 4. Bulk salary revision stays deferred, on its original terms

An import that supersedes live packages remains in `payroll.md` §15, behind the mandatory dry-run diff report, post-GA. **Not one word of payroll's reasoning is reversed.** The two were sharing a name; separating them costs the module nothing.

## Alternatives considered

- **Accept manual entry for the first tenants and defer both imports.** Rejected: two thousand multi-line pay packages typed by hand is the single most likely path for a wrong salary figure to enter the product — the exact risk the exclusion was written to prevent, relocated from a reviewed spreadsheet to an unreviewed afternoon of typing.
- **Build the full import with the dry-run diff report in V1, covering both cases at once.** Rejected: it pays the cost of a mechanism the onboarding case does not need, and pulls post-GA work forward for no benefit. The dry-run exists because of supersede.
- **Add salary columns to the `employee.master` template.** Rejected: it would make a hire and a pay package one atomic row, so a package error would fail the hire, and `employee.master` is `create_only` at the employee grain — a salary correction would then require deleting a person. It also puts a payroll-permission concern behind an employee permission.
- **A one-off seeding script run by a platform operator outside the product.** Rejected: it bypasses `ADR-0002`'s tenant scoping, `ADR-0016`'s per-tenant DEKs, audit-log capture, and the validation pipeline — the four things that make the data trustworthy afterwards. `system-administration.md` BR-ADM-006 already refuses this shape for provisioning, seeding *"through other modules' facades, never their tables."*
- **Widen the rule to a general "opening balances" framework across modules.** Rejected as speculative: two definitions already exist for this purpose (`leave.balance_adjustment`, `tax.opening_ytd`) and neither shares a shape with the third. A framework over three unlike things is scaffolding.
- **Leave the contradiction in this ADR and not amend `payroll.md`.** Rejected on `CLAUDE.md`'s anchor rule: a module document stating **"No import."** in bold while an ADR says otherwise is precisely the silent divergence that rule forbids, and a reader of the module would never learn the ADR exists.

## Tradeoffs

A `create_only` opening import means a tenant that loads a wrong package cannot fix it by re-running the file — the second run refuses every row. The correction path is the ordinary one: supersede through the UI, per BR-PAY-005. That is worse ergonomics than an upsert and is the price of the property that makes this import safe, and it is the same trade `employee.master` and `tax.opening_ytd` already accept.

The sequencing in §2 leaves a judgment call at each future refusal — whether a given exclusion is really about supersede or about the data itself. Three of the nine are clearly about the data and are untouched here; the boundary is a reading, not a mechanism, and a future module could get it wrong in either direction.

The `payroll.salary.import` permission key is immortal and additive-only under `ADR-0005`, so registering it now commits to it. It is narrow enough that this is a small commitment, and splitting it from `payroll.salary.update` follows the same reasoning `tax-pph21.md` §2 gives for splitting its five keys at birth.

## Consequences

- `docs/06-modules/payroll.md` §13 narrows **"No import."**; §2 gains a `payroll.salary.import` row; §15 keeps the revision import unchanged.
- `docs/05-platform/import-export.md` §4.3 gains the `payroll.salary_opening` row, and its "Deliberate non-imports" paragraph is narrowed.
- `docs/00-overview/implementation-roadmap.md` §7 owns the ordered onboarding sequence, and §8 gates the first production release on running it once end to end.
- **No new error code, and the existing one is not incidental.** An employee who already holds a package holds it over an open interval, so a second insert collides with BR-PAY-005's exclusion constraint and reports the registered `PAY_SALARY_OVERLAP` — the database enforces decision 3's refusal, and the `create_only` write mode states it. The row surfaces in the import error report on the same terms as any other rejected row.
- No schema change. `salary_histories` and `salary_history_lines` are unchanged; the import writes through the existing creation path.
- No new domain term. "Opening package" is a phrase, not a concept — the entity is the salary package that `CONTEXT.md` already defines.

## Future considerations

Bulk salary revision behind the dry-run diff report, as `payroll.md` §15 already specifies, once a tenant has a reason to move a thousand packages at once — an annual review cycle is the likely first one. `import-export.md` §4.3's observation that migrated historical expense claims *"are opening figures, not claims, and belong in payroll's opening balances"* points at a mechanism that still does not exist; this ADR does not create it, because a settled historical claim is history rather than a balance, and nobody has asked for it. If a third opening-data definition ever appears with a shape resembling the first two, the general framework rejected above becomes worth reconsidering — but not before.
