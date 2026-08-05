# ADR-0013: Database Conventions and Drizzle Usage Patterns

Status: Accepted · Date: 2026-08-01 · Deciders: product owner + engineering (spec §5.4, confirmed Phase 0)

## Context

Spec §5.4 binds Drizzle ORM (schema in TypeScript, drizzle-kit migrations; **Prisma prohibited**). `docs/04-database/database-conventions.md` states the binding rules — PK strategy, audit fields, soft delete, effective dating, money type, migration workflow, shared builders. Per handbook policy, rationale lives in ADRs, once. This ADR records why those rules are what they are; the conventions doc stays rule-only. Rules here are summarized, not restated — the conventions doc wins on detail.

## Decision

Adopt the database-conventions.md rule set. The load-bearing choices and their reasons:

1. **Drizzle, SQL-transparent.** Drizzle emits reviewable SQL, keeps schema as plain TypeScript (code review = schema review), and its generated migrations are editable files — which the RLS policies and EXCLUDE constraints (hand-added `-- manual:` SQL) depend on. Works cleanly with `set_config`-per-transaction (ADR-0002).
2. **App-generated UUIDv7 PKs.** Offline-first *requires* client-generated IDs (ADR-0003: devices create entities before the server ever sees them) — sequences are structurally impossible for synced entities, and one PK strategy everywhere beats two. v7 over v4 for B-tree locality; app-side over DB-side because the ID exists before insert (queue keys, idempotency, tests) and managed Postgres < 18 has no native `uuidv7()`.
3. **Audit fields in the app layer, no triggers.** `$onUpdate` + repository stamping keeps behavior visible in reviewed TypeScript, portable across Postgres/Drift, and testable without a database. The bypass risk (raw SQL skipping stamps) is already closed by the repositories-only rule (CLAUDE.md).
4. **Soft delete = `deleted_at` + partial indexes.** One nullable column, uniques stay correct via partial indexes, restore is an UPDATE. Alternatives lose: status enums conflate lifecycle with deletion; archive tables split every query and make restore a migration; hard delete + audit-log-as-backup cannot restore relational integrity.
5. **Effective dating = `[from, to)` + btree_gist EXCLUDE.** Half-open intervals make adjacency gap-free and as-of queries one predicate. The DB-level EXCLUDE constraint is the concurrency backstop application checks can't be (two concurrent `supersede()` calls race; the constraint doesn't). Temporal-table extensions rejected: unavailable/unmaintained on managed Postgres.
6. **Money = `numeric(15,2)`.** Proration, 1/173 overtime math, and TER rounding produce fractional intermediates; integer minor units push an implicit ×100 convention through three codebases and Excel I/O. `numeric` is exact, Drift-mirrorable, and serializes to the ADR-0007 decimal string unchanged.
7. **Forward-only migrations.** Down migrations are untested fiction by the time production needs them; PITR (D3) is the real rollback, expand→migrate→contract the real zero-downtime tool. Immutable applied migrations keep every environment's history identical.
8. **Manual SQL lives inside the generating migration.** RLS/EXCLUDE must ship atomically with the table they protect — a separate "add policies" migration creates a window where the table exists unguarded and an ordering coupling drizzle-kit can't see.
9. **Shared column builders (`_shared.ts` spread).** Plain-TS spreads beat inheritance/codegen: greppable, no magic, and the review rule "hand-rolled audit columns = blocker" is trivial to enforce.

## Alternatives considered

- **Prisma.** Prohibited by spec; independently rejected: migration DSL hides SQL (fatal for hand-added RLS), engine binary complicates the transaction-scoped `set_config` pattern.
- **TypeORM / MikroORM.** Rejected: decorator-entity drift, ActiveRecord temptations against the repository rule, weaker generated-SQL transparency.
- **Knex/Kysely (query builder only).** Rejected: loses typed schema as single source for migrations + Drift mirroring discipline.
- **`serial`/`bigint` identity PKs.** Rejected: impossible offline (ADR-0003), leaks volume, complicates merge of client-created rows.
- **DB triggers for audit/soft-delete enforcement.** Rejected: invisible to code review, unportable to Drift, duplicated logic once repositories also do it.
- **History/audit tables via triggers for effective dating.** Rejected: write amplification and split reads; explicit effective-dated rows are the queryable business model, not a byproduct.
- **`money` type / float.** Rejected: locale traps / IEEE-754 corruption.

## Tradeoffs

App-side ID/audit generation trusts the app layer — acceptable because the repositories-only rule is lint-enforced and RLS backstops tenancy, the one place trust would be fatal. `numeric` is marginally slower than `bigint` — irrelevant beside payroll's job-queue latency profile. Forward-only means a bad migration needs a fix-forward under pressure — drilled via the CI empty-DB + prod-snapshot gates. gist EXCLUDE constraints add write cost to effective-dated tables — those tables are low-write config/history by nature.

## Consequences

- `docs/04-database/database-conventions.md` is the binding rulebook; this ADR is its justification record — changes to one require the other.
- `docs/04-database/core-schema.md` (next) applies the builders/patterns verbatim; `docs/03-standards/coding-standards-nestjs.md` carries the repository/Drizzle idioms.
- CI gates from conventions §10 (empty-DB apply, prod-snapshot apply, `drizzle-kit check`) are non-negotiable pipeline steps (ci-cd.md). **Wired 2026-08-04** — `docs/07-operations/ci-cd.md` §7.2 places all three (`migrate:empty`, `migrate:forward`, `drizzle-kit check`), and §7.3 supplies the production schema snapshot both this ADR and testing-strategy §14.1 depended on without anything producing it: the promotion workflow publishes a `pg_dump --schema-only` artifact per release, schema only and never data, with its bootstrap exemption self-clearing on the first `v*` tag. Rule 5 (a migration never breaks the currently deployed app version) turns out to be load-bearing twice over — it is what makes Helm `--atomic` auto-rollback correct, and it is the derivation of the guaranteed rollback depth of exactly one release (`ADR-0019`).
- Drift mirrors server names/types (conventions §11) — kept honest by sync-layer codegen or review.

## Future considerations

Postgres 18 native `uuidv7()` lets the default move DB-side without breaking anything (app-side stays for offline entities). Declarative partitioning by `tenant_id` composes with these conventions (ADR-0002 note). **Discharged 2026-08-04 by `ADR-0023`: not in V1**, with a numeric trigger — a table crossing 500M rows, or autovacuum on `attendance_days` failing to keep up. Two facts that note assumed away: `drizzle-kit` does not generate partitioned DDL, so adopting it makes every migration touching those tables hand-written under §10 rule 4's `-- manual:` convention; and on `attendance_punches` the *useful* key is unavailable, since range-by-date requires a date column in every unique constraint and the `op_id` unique cannot have one. `performance.md` §4.5 supplies the row-volume projection that made the question answerable at all — and it is also what finally makes §7 rule 4's *"no speculative indexes"* checkable, since nobody could previously say what "large" meant. If Postgres lands SQL:2011 system versioning on managed offerings, revisit effective-dating mechanics — the `[from,to)` business model would stay, storage might not.
