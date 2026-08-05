# ADR-0023: Table Growth at the D1 Ceiling

Status: **Proposed** · Date: 2026-08-04 · Deciders: engineering (surfaced during `docs/07-operations/performance.md` grilling)

## Context

Two Accepted ADRs deferred this question to this document by name.

`ADR-0002` closes with *"partitioning by `tenant_id` (declarative) is compatible with this design and **may arrive via the performance doc** without superseding this ADR."* `ADR-0013` echoes it: *"Declarative partitioning by `tenant_id` composes with these conventions."* Neither decided anything; both left a door open and pointed at a file that did not exist yet.

Nobody had projected row counts, so the question had no shape. `performance.md` §4.5 supplies them at D1's design point of 500 tenants × 2,000 employees:

| Table family | Rows per year |
|---|---|
| `attendance_punches` | ~500M |
| `attendance_days` | ~250M |
| payslip lines | ~240M |
| `audit_log` | large — **already partitioned monthly** |

Two of those exceed the audit log, which is the only table in the system anyone thought to partition.

Three properties make this worth deciding now rather than when the rows arrive.

**PostgreSQL 16 cannot convert a plain table into a partitioned one in place.** Doing it later means creating a new partitioned table, moving hundreds of millions of rows, and swapping — hours of downtime or a bespoke online migration. This is a decide-now-or-pay-a-hundred-times-later item, which is the only kind worth raising in a product with no customers.

**One partition key is already unavailable and nobody noticed.** PostgreSQL requires the partition key to be a subset of the columns in every unique constraint on the table. `attendance_punches` carries `uq_attendance_punches_tenant_id_op_id` on `(tenant_id, op_id)` — the offline idempotency key that `ADR-0003` and offline-sync §5 depend on for duplicate impossibility. It contains no date column and cannot: an `op_id` is minted on a device with no knowledge of when the row will land.

**The largest table in the system has no retention window.** database-conventions §4.4 assigns windows to payroll and tax (no purge before ten years), the audit log (two years hot), employee master (statutory horizon), operational clutter (twelve months), and the mobile sync queue (never while pending). `attendance_punches` and `attendance_days` are absent from the table entirely. `attendance.selfie_retention_months` governs the image files; nothing governs the rows.

## Decision

**1. No table is partitioned in V1.**

The two candidates are `attendance_punches` and `attendance_days`. Neither is partitioned, and the trigger to revisit is numeric rather than a feeling:

- a single table crossing **500 million rows**, or
- autovacuum on `attendance_days` failing to complete between triggers.

`attendance_days` earns the second criterion because it takes an **upsert per punch** — roughly 333 updates per second during the morning window — which makes it the highest-churn large table in the system and the one where dead tuples bind before disk does.

**2. The available partition key on `attendance_punches` is `tenant_id` by hash, and nothing else.**

Range by date is foreclosed by `uq_attendance_punches_tenant_id_op_id`, and **that constraint is not a candidate for removal**: it is the mechanism behind offline-sync §5's *"duplicates are impossible at any TTL, by construction"*, which in turn is what lets `performance.md` §5.2 cut the idempotency envelope TTL from seven days to one.

This is recorded because it inverts the usual advice. For a table of append-only time-series facts, range-by-date is the valuable key — it makes retention a `DROP PARTITION` instead of a `DELETE` over hundreds of millions of rows. Hash-by-tenant buys smaller indexes and shorter vacuums and buys **nothing** for deletion.

**`attendance_days` keeps both doors.** Its unique is `(tenant_id, employee_id, date)`, which contains a date column, so range partitioning stays available on the hot read path. If exactly one table is ever partitioned, this is the one where the choice is still free.

**3. Punch retention is named as a gap and not filled here.**

A number is not invented. Attendance records are evidence in an Indonesian labour dispute, and how long they must be kept is a regulatory fact, not an engineering preference. database-conventions §4.4 gains the row with the marker; the calculation of what that horizon costs in rows is `performance.md` §4.5's and already done.

> ⚠️ VERIFY: confirm against current Indonesian regulation before implementation. — the statutory retention horizon for attendance records, and whether it differs for the derived day rows and the raw punches.

**4. Index rules do not change.** database-conventions §7's five rules stand unaltered. What was missing was never a rule — it was the volume context that makes rule 4, *"index only what a documented query needs"*, checkable. That context now exists in `performance.md` §4.5.

## Alternatives considered

- **Partition `attendance_punches` and `attendance_days` by `tenant_id` hash in V1.** Rejected: it pays real cost now — every unique and foreign key must accommodate the key, `drizzle-kit` does not generate partitioned DDL so every migration touching them becomes hand-written, and `ADR-0013`'s conventions gain a permanent exception — for a benefit that arrives in year three. The honest gain is index size and vacuum duration, neither of which is a constraint at a tenant count of five.
- **Range-partition by date and drop the `op_id` unique constraint**, replacing duplicate detection with the Redis idempotency envelope alone. Rejected outright: it converts "duplicates are impossible by construction" into "duplicates are impossible while Redis remembers", trades a correctness guarantee for a storage optimization, and `performance.md` §5.2 has just made the envelope window *shorter*.
- **A composite `(tenant_id, punch_date)` unique on `op_id` instead**, adding a date column to the constraint so range partitioning becomes legal. Rejected: `op_id` uniqueness must hold across all time for a device that syncs late, and scoping it to a date window means a punch queued on the 31st and drained on the 1st can duplicate. The constraint is date-free for a reason.
- **Set a punch retention window here — 24 or 36 months — and partition to serve it.** Rejected on CLAUDE.md's standing rule: regulation-dependent values are never invented. The marker exists for exactly this, and a wrong number here would propagate into a purge job that destroys evidence.
- **Archive old punches to Cloud Storage, in the audit log's shape.** Rejected for the reason A-140 rejected it for payroll: those rows are *queried*, not merely retained — attendance history is read by payroll recalculation, correction workflows, and reports — and an archive you must restore to answer a routine question is worse than disk. It would also be an eleventh entry in testing-strategy §14.1's destructive-cron class.
- **Defer the whole question again**, since V1 has no customers. Rejected: the date door closes silently, and the two ADRs that deferred it here would still be undischarged with nowhere left to point. `performance.md` is the last file in `docs/07-operations/`.

## Tradeoffs

Deciding not to partition means the first tenant to approach the design ceiling arrives before the mechanism does, and the migration to add it will be performed under pressure on a live table rather than calmly on an empty one. That is the cost, and the numeric trigger exists so it is noticed with months of margin rather than during an incident.

Recording the closed date door costs nothing and buys the one thing that cannot be bought later: a future engineer proposing range partitioning on `attendance_punches` discovers in this ADR, in seconds, why it will not work — instead of discovering it from a failed `ALTER TABLE` after designing a retention scheme around it.

Naming punch retention without setting it leaves a known gap open. The alternative was inventing a statutory number, which is the failure mode CLAUDE.md's marker exists to prevent and which A-017 and A-140 have both already caught in this handbook.

Hash-by-tenant remaining the only available key on the biggest table means that if partitioning does arrive, it will deliver vacuum and index benefits and **no** deletion benefit. Deletion on that table will always be a `DELETE`. That is a permanent structural consequence of a correctness decision made in `ADR-0003`, and it is the right trade — but it should be known rather than rediscovered.

## Consequences

- `database-conventions.md` §4.4 gains an `attendance_punches` / `attendance_days` row marked as an open regulatory question with the ⚠️ VERIFY marker.
- `database-conventions.md` §7 is unchanged; `performance.md` §4.5 supplies the volume context rule 4 needs.
- `ADR-0002` and `ADR-0013` gain discharge notes: the partitioning question they deferred is answered here, and neither is superseded — both explicitly permitted this outcome.
- The trigger is a thing someone must watch. `performance.md` §11.2's capacity rehearsal measures row counts as a by-product; observability OB10 already alerts on Cloud SQL disk, which is the closest existing proxy and is not the same signal.
- No schema changes, no migrations, no code. This ADR's entire product is three recorded facts and a trigger.

## Future considerations

When the trigger fires, `attendance_days` is the first candidate and range-by-date is the key, because it is the hot read path, it retains both options, and its retention question is the same one this ADR leaves open.

If the statutory horizon resolves to a bounded window, the deletion mechanism for `attendance_punches` is the question this ADR could not close. Options at that point: a batched `maintenance` job in the shape database-conventions §10 rule 6 already prescribes, accepted as slow; or a one-time rebuild into a hash-partitioned table done while volume still permits it, which is the last moment the choice is cheap.

A read replica (`performance.md` §13.2) changes none of this — replication carries the partitioning scheme, it does not substitute for it.

If PostgreSQL ever permits converting a plain table to a partitioned one in place, the entire urgency behind this ADR evaporates and it can be reduced to a note. `ADR-0013` already tracks Postgres version-dependent revisits in the same spirit.
