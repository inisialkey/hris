# ADR-0022: Tenant-Scoped Recovery in a Shared Database

Status: **Proposed** · Date: 2026-08-04 · Deciders: engineering (surfaced during `docs/07-operations/backup-restore.md` grilling)

## Context

`ADR-0002` puts all 500 tenants in one PostgreSQL database, isolated by `tenant_id` and `FORCE` RLS. D3 asks for PITR with RPO ≤ 15 min and RTO ≤ 4 h. `environments.md` §9 enables PITR and deletion protection in production.

Every one of those decisions assumes the failure being recovered from is **instance-wide**: a corrupt database, a bad migration applied to everything, a storage failure. Regional HA already covers most of that class, and it is Google's mechanism rather than ours.

The failure this product will actually experience is different, and no document had named it. A tenant's HR administrator runs an import that overwrites 300 salary rows, or deletes a department, or an admin-initiated bulk action lands on the wrong filter. One tenant, on a Tuesday, noticed Thursday.

Point-in-time recovery is the only instrument the handbook offered, and it is instance-wide. Restoring to Tuesday to repair tenant 47 **discards every write made by the other 499 tenants** in between — two days of attendance punches, approvals, leave decisions, and a payroll run. It converts one tenant's data-entry mistake into a company-wide incident with no undo, and it does so at the exact moment when the operator is under pressure and the destructive option is the one already documented.

The gap needed answering before `backup-restore.md` could describe any procedure, because the answer determines which procedures exist.

## Decision

**1. Instance-wide PITR is never the instrument for a single tenant's data loss.** It is reserved for damage whose blast radius is genuinely instance-wide — a purge cron that deleted wrongly across every tenant, or a corrupt database. `backup-restore.md` §5's decision table makes this a routing rule rather than a matter of judgment: one symptom in ten reaches for PITR.

**2. The instrument for single-tenant loss is a manual extraction**, in the shape `ADR-0020` already sanctioned for forensic work:

1. Clone to a temporary instance at a timestamp before the damage, **inside `hris-production`** — same VPC, private IP, no public address.
2. Extract the affected tables for that `tenant_id` alone.
3. Re-insert into the live database in foreign-key dependency order, carrying original ids.
4. Verify row counts and foreign-key integrity for that tenant.
5. Destroy the temporary instance.

**3. Four mechanisms that already exist make it work**, which is the reason this is a procedure rather than a project:

- **Uniform `tenant_id`** (`ADR-0002`, database-conventions) makes the extraction predicate identical across all 28 modules.
- **Stable `uuidv7` primary keys**, with no sequences and no minted running numbers anywhere in the schema, mean a re-inserted row carries its original id and every foreign key pointing at it still resolves. Without this the procedure would be a re-keying exercise and would not be worth documenting.
- **`ADR-0016`'s `v1:` ciphertext version prefix** means rows encrypted under a DEK generation the tenant has since rotated past still decrypt, so the extraction needs no historical key material — only the live `tenant_keys` row. The corollary is a hard constraint: **an extraction carrying encrypted columns must land in the same tenant, or it carries nothing readable.**
- **Re-insertion is a new audited fact, never a rewrite of history.** Anchors hash by insert day (audit-log UC-AUD-005), and OB26 already names *"a restore that replayed rows"* among its expected causes.

**4. This is not a product feature.** No endpoint, no console button, no support-desk action — consistent with BR-ADM-009 and A-095, which already refused to expose destruction as a route. It is engineer-run, takes hours to days, and its cost scales with how many modules the damage touched.

**5. Because it is manual, it is drilled.** `backup-restore.md` §14.2 runs it end to end semi-annually against a scratch schema. Its rot is driven by schema change across 28 modules, so the interval tracks release cadence rather than calendar risk.

## Alternatives considered

- **Nightly per-tenant logical backups.** Rejected: 500 `pg_dump` invocations a night, each needing a role that can read one tenant's rows through RLS, producing a second retention system with its own storage, its own freshness alert, and its own silent-failure mode — all standing cost, permanently, against an event that happens rarely. The extraction procedure has zero standing cost and is available for any timestamp inside the PITR window rather than only at last night's snapshot.
- **Universal soft delete, so nothing is ever really gone.** Rejected: database-conventions §4 already fixes soft delete per table class deliberately, and universalizing it does not help against the likelier failure — a bad *update*. It would also tax every query in the system with a filter, forever, to insure against one operational event.
- **Accept the collateral: restore the instance and tell the other 499 tenants.** Rejected: it prices one tenant's data-entry error at two days of everyone's work, and there is no undo once the fleet is repointed.
- **`ADR-0002`'s per-tenant-database escape hatch.** Rejected as a recovery answer: nothing is provisioned (`environments.md` §15.1), multi-tenancy §7's runbook exists for a contractual isolation demand rather than for recovery, and rebuilding the tenancy model to make restores easier is a far larger decision than the problem justifies.
- **Ship tenant-level undo as a product feature — a trash bin, or a per-tenant restore point.** Rejected on scope: it needs a design in each of 28 modules, a UI, a permission, and a retention policy, and every module would answer "what does undo mean here" differently. Nothing in V1's scope asks for it.
- **A read replica held deliberately behind by hours.** Rejected: it recovers a narrow window, costs a standing instance, and answers nothing that a PITR clone does not answer better and only when needed.

## Tradeoffs

The procedure is **manual, slow, and skill-dependent**, and it is the only instrument for the likeliest incident class in the product. Hours to days, one engineer, and the quality of the result depends on correctly enumerating which tables the damage touched — an FK-ordering problem across 28 modules that no tooling validates. The semi-annual drill is the mitigation and it is a partial one.

**It does not fit inside D3's four hours, and does not claim to.** D3's RTO describes an instance-wide restore. A tenant extraction is a different operation with a different clock, and `backup-restore.md` §3.2 names it as one of two things that would break the budget if confused for a PITR.

**Nothing prevents a tired operator reaching for PITR anyway.** The controls are a decision table, a second-person acknowledgement on instance-wide PITR only, and the fact that the superseded instance is kept for 30 days so the collateral is itself extractable. None of those is a technical block.

**The extraction can create rows that no longer make sense to their neighbours** — re-inserting a leave request whose approval chain instance was legitimately deleted, for example. The procedure verifies FK integrity, which catches structural breakage and not semantic breakage. Accepted: a human is running this against a known incident, not a machine running it blind.

## Consequences

- `docs/07-operations/backup-restore.md` §5 routes on blast radius, §6 restricts instance-wide PITR and requires a second person, §8 holds the procedure, §14.2 drills it, and §6.4 keeps the superseded instance for 30 days precisely so that PITR's collateral remains extractable by this same procedure.
- **`environments.md` §14 and `ADR-0020` are unaffected and are the reason this is cheap** — the clone-inside-the-production-project shape already existed for forensic reads; this reuses it rather than inventing a venue.
- **No schema change, no migration, no new table, no new permission, no new error code.** The four enabling mechanisms are all already in the handbook. That is the strongest argument for this option over the alternatives.
- **A-131 records it.** No module document changes.
- The extraction script itself is implementation work in `hris-api`, not handbook scope. What the handbook fixes is the procedure, its venue, its constraint on encrypted columns, and its drill.

## Future considerations

If extraction frequency rises past roughly once a quarter, per-tenant logical backups become cheaper than the procedure and this decision should be revisited — that is the named trigger in `backup-restore.md` §16.1. A tooled extraction that derives FK order from the Drizzle schema rather than from an engineer's memory is the obvious first improvement and needs no ADR. Tenant-level undo as a product feature stays out until a customer asks for it in a contract; if that day comes it is a module-by-module design and not a recovery mechanism.
