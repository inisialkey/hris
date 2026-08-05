# Coding Standards — NestJS (Backend)

Status: Active (Phase 2) · Source: `docs/02-architecture/backend-nestjs.md` (architecture — not restated here) · Related: `docs/adr/ADR-0006-result-pattern-error-handling.md`, `docs/adr/ADR-0013-database-conventions-drizzle.md`, `docs/03-standards/naming-conventions.md` §11.1, `docs/04-database/database-conventions.md` · Downstream: `docs/07-operations/testing-strategy.md` (coverage targets)

Idioms and testing conventions for the backend repo. Layer rules, facade mechanics, request lifecycle, Result/Drizzle wiring, and CI boundary enforcement are `docs/02-architecture/backend-nestjs.md`; this document is how code inside those boundaries is written.

## 1. TypeScript rules

- `tsconfig`: `strict` plus `noUncheckedIndexedAccess`. **`verbatimModuleSyntax` off — deliberate divergence from the admin web:** Nest DI and class-validator rely on `emitDecoratorMetadata`, which needs value imports for `design:type` metadata; aggressive `import type` elision silently breaks DTO validation. `import type` is still used wherever the import is genuinely type-only (interfaces, ports).
- **No `any`**, explicit or inferred; `unknown` at boundaries (job payloads, webhook bodies), narrowed before use. `as` casts only in infrastructure mappers — never to silence domain/application type errors.
- **No `!` non-null assertion** outside tests and DTO property declarations (`prop!: string` is the sanctioned class-validator idiom — the pipe guarantees assignment).
- **No TS `enum`.** String literal unions + `as const` maps; DB-level enums are Drizzle `pgEnum` (database-conventions §1.5) with the union type derived from it — one declaration.
- Exhaustive `switch` + `assertNever` (`shared/`) on closed unions (state machines, sync classes). Wire input enums validated by class-validator `@IsIn` at the edge — past the DTO, values are trusted and closed.
- Prettier untouched; formatting CI-checked, never human-reviewed.

## 2. Classes, files, DI

- One exported class per file; suffixes per naming §11.1 (`*.use-case.ts`, `*.controller.ts`, `*.repository.ts`, `*.dto.ts`, `*.errors.ts`, `*.processor.ts`).
- Constructor injection only, all deps `private readonly`; `@Inject(SYMBOL_TOKEN)` for ports/repositories (backend-nestjs §4/§8.2), bare class injection only for module-internal concrete services. No property injection, no `ModuleRef` service location in business code.
- Use cases do not inject other use cases. Same-module composition = domain service or shared repository call; cross-module = the other module's port. A use case injecting its sibling is the ADR-0001 boundary problem in miniature.
- Controllers: one per resource, methods map 1:1 to endpoints, body = `toCommand(dto, ctx)` + `unwrap(await useCase.execute(…))` + `toResponse(…)` — three lines is the budget; a fourth line of logic belongs in the use case.

## 3. Error factories

The only place codes are spelled (backend-nestjs §7.3). Shape:

```ts
// modules/leave/domain/leave.errors.ts
export const leaveErrors = {
  insufficientBalance: (params: { available: string }) =>
    new AppError('LVE_INSUFFICIENT_BALANCE', params),
  requestAlreadyDecided: () => new AppError('LVE_REQUEST_ALREADY_DECIDED'),
} as const;

// HTTP status registered beside the factories, imported by AppErrorFilter's catalog map
export const leaveErrorStatus = {
  LVE_INSUFFICIENT_BALANCE: 422,
  LVE_REQUEST_ALREADY_DECIDED: 409,
} as const;
```

- `params` carry i18n interpolation values only (`messageKey` resolution is client-side, ADR-0007) — never pre-rendered sentences, never PII beyond what the error needs.
- Every factory's code exists in `docs/03-standards/error-catalog.md` first — an unregistered code is a review blocker, not a TODO.

## 4. Async discipline

- ESLint `no-floating-promises` + `require-await` are errors. Fire-and-forget does not exist in request paths — background work goes through BullMQ (ADR-0010), not a dangling promise.
- **Inside a unit-of-work, awaits are sequential.** The transaction rides one `pg` connection; `Promise.all` over repository calls in the same tx interleaves statements on a single socket — banned. `Promise.all` is for independent external IO outside the tx (parallel GCS URL signing, multi-key Redis reads).
- No `async` executor anti-patterns: no `new Promise` around async fns, no `.then` chains in business code — `await` only.
- Timeouts: every outbound call (HTTP adapters, GCS, FCM) carries an explicit timeout at the adapter — no library-default infinite waits (system-overview capacity anchors).

## 5. Drizzle idioms

Repository invariants (tenant predicate, soft-delete, audit stamping, optimistic locking, effective dating) live in `TenantScopedRepository` — backend-nestjs §8.2. Inside implementations:

- Query builders only; `sql` template fragments for what the builder can't express (window functions, `FOR UPDATE SKIP LOCKED`) — still inside repositories (CLAUDE.md: no raw SQL outside repositories).
- **Drizzle row types never cross the repository boundary.** Private `toEntity(row)` / `toRow(entity)` mappers per repository; returns are domain entities or query DTOs. A `typeof table.$inferSelect` in a use-case signature is a lint error waiting to be written by hand — review blocker.
- Default `select` whole rows; column projection only on measured hot paths (grids with wide rows) — noted with a one-line comment.
- N+1 discipline: list endpoints load children via one `inArray` query or a join — a repository call inside a `for` over rows is a review blocker.

### 5.1 Money

- Drizzle `numeric(15,2)` columns in string mode — money enters and leaves the process as decimal strings (ADR-0007, database-conventions §1.4).
- **Arithmetic via `decimal.js` only** (A-016), in domain/application code: `new Decimal(a).plus(b)`; rounding always explicit (`toDecimalPlaces(2, ROUND_HALF_UP)` — payroll rounding rules per module doc). `number`, `parseFloat`, `+x` on money values are lint errors.
- SQL aggregation (`SUM` on `numeric`) is exact in PostgreSQL and allowed for reporting reads; **authoritative row-level calculation happens in engine code** (ADR-0012 determinism — a payslip line is computed, traced, and stored, never re-derived by SQL).

## 6. Time

- Store and compute UTC (`timestamptz`, `Date` in code); convert to branch timezone only when rendering server-side documents (payslips — ADR-0014) or deriving branch-local business dates (attendance day boundaries).
- **`Clock` port (`shared/`) injected wherever now matters** (attendance windows, accrual runs, token expiry) — `new Date()` in domain/application is a lint error; infrastructure may use it for timestamps that never feed business rules (log fields).
- Business dates (leave from/to, payroll period) are `date` columns / `YYYY-MM-DD` strings end to end — never midnight timestamps (timezone drift manufactures off-by-one-day bugs).

## 7. Jobs and events

Queue registry, retry classes, outbox mechanics: ADR-0010. In-code:

- Processor classes are thin: validate/narrow the payload (`unknown` in), build the context, call one use case inside `UnitOfWork.run` — business logic in a processor body is a review blocker.
- Event payloads are plain JSON-serializable contracts exported from the facade — ids + primitives, never entities; consumers re-read state by id (payload is a pointer, not a snapshot — except where the ADR says otherwise, e.g. payroll trace).
- Every processor is idempotent (ADR-0010); the test proving it lives beside the processor (§9).

## 8. Logging

- Injected pino logger only; `console.*` is a lint error. Structured fields, not interpolation: `log.info({ leaveRequestId, employeeId }, 'leave request submitted')`.
- Levels: `error` = unexpected + Sentry (global filter owns it); `warn` = degraded-but-handled (retry succeeded, fallback used); `info` = domain milestones (state transitions, job start/end); `debug` = local dev only.
- No PII in log fields — the redaction registry (security-standards §10) is a backstop, not permission; business failures are envelope responses, not error logs (ADR-0011).

## 9. Testing conventions

Pyramid per spec §5.15; numeric targets in testing-strategy.md. Stack (A-016): **Jest** (Nest-native — decorator metadata works without transformer gymnastics), **supertest** (HTTP), **Testcontainers** (real PostgreSQL + Redis). Structure: unit tests colocated `*.spec.ts`; integration/e2e under `test/` (`*.integration.spec.ts`, `*.e2e-spec.ts`); builders in `test/support/builders/`.

| Layer | What | How |
|---|---|---|
| Unit — domain | Entities, value objects, domain services, error factories | Pure Jest, no DI container, no DB |
| Unit — use cases | Rules, Result paths, event emission | Hand-written in-memory fake repositories (preferred); every failure path asserts its catalog code |
| Integration — repositories | Queries, base-class invariants, migrations | **Testcontainers PostgreSQL**, real migrations applied; includes the RLS leak tests L1–L6 (multi-tenancy §5) with two-tenant fixtures — mandatory per ADR-0002; Drizzle is never mocked |
| Integration — processors | Payload narrowing, idempotency | Fake `Job` + real use case with fakes; **double-delivery test proves idempotency** (ADR-0010) |
| E2E — API | Guard order, envelopes, codes, idempotency replay | Nest app + supertest over Testcontainers PG/Redis; asserts: deny-by-default (no-permission → `AUTHZ_PERMISSION_DENIED`), `VAL_` field details shape, `Idempotency-Key` replay returns first response, suspended-tenant block |

Rules: assert on **error codes and envelope shape**, never message strings (ADR-0006); `Clock` injected — no real time, `jest.useFakeTimers` for backoff/expiry; unit tests touch no network/DB; every bug fix lands with its regression test; per-module test data builders, no shared mutable fixtures.

## 10. Enforcement (CI)

| Check | Tool |
|---|---|
| Types strict | `tsc --noEmit` |
| Architecture boundaries (backend-nestjs §12: facades, layer imports, db access, error-literal ban, route lint) | dependency-cruiser + ESLint + route lint script |
| `no-floating-promises`, `require-await`, no `console.*`, no `new Date()` in domain/application, no `parseFloat`/`number` money math | ESLint restrictions |
| Format | Prettier `--check` |
| Unit + integration + e2e | Jest gates; Testcontainers suites on protected branches |
| Migration drift + apply gates | drizzle-kit check (database-conventions §10.7) |
| Error-code ↔ catalog ↔ i18n completeness | catalog completeness check (error-catalog §1.4) |
