# Backend Architecture — NestJS

Status: Active (Phase 2) · Source: `docs/02-architecture/system-overview.md`, `docs/adr/ADR-0001-modular-monolith-module-boundaries.md`, `docs/adr/ADR-0006-result-pattern-error-handling.md` · Related: `docs/adr/ADR-0002-multi-tenancy-rls.md`, `docs/adr/ADR-0013-database-conventions-drizzle.md`, `docs/03-standards/naming-conventions.md` §11.1 · Downstream: `docs/03-standards/coding-standards-nestjs.md` (idioms), `docs/02-architecture/multi-tenancy.md` (tenant mechanics)

This document fixes the concrete mechanics of the NestJS modular monolith: folder anatomy, layer rules, facade shape, the request lifecycle mapped to NestJS primitives, Result/Drizzle/DI wiring, worker bootstrap, and Swagger. Style-level idioms (test layout, lint config detail) belong to `docs/03-standards/coding-standards-nestjs.md`; tenant-resolution internals to `docs/02-architecture/multi-tenancy.md`.

## 1. Fixed frame

- **One deployable, three entrypoints.** The same image starts as `api` (HTTP listener), `worker` (BullMQ processors only), or `both` (local dev) — ADR-0001 §Decision-7. Selection via `APP_ROLE` env var read in `main.ts`.
- **One module per namespace** in naming-conventions §4; layout per naming §11.1 (`domain/application/infrastructure/presentation`).
- **Clean Architecture, DDD-inspired, pragmatic:** entities and value objects where they earn their keep; **no CQRS without a justifying ADR** (spec §5.3).
- **Repositories are the only SQL surface** (database-conventions §1.9); use cases return `Result` (ADR-0006); every request/job unit-of-work is a tenant-scoped transaction (ADR-0002).
- **Drizzle is the ORM. Prohibited: Prisma, TypeORM, MikroORM, and raw SQL outside a repository** *(added 2026-08-05, MANIFEST row 72)*. `ADR-0013` decides this and records why each alternative was rejected; it is stated here because this is the document an implementer reads for the backend's fixed frame, and the prohibition previously appeared only in the ADR's rejected-alternatives list and in the handbook project's own `CLAUDE.md` — which is not a document an implementer should be following (`implementation-claude-md-template.md` §1). `mobile-flutter.md` §1 and `admin-nextjs.md` §1 already state theirs; this closes the asymmetry. Enforced by ci-cd **C12**.

## 2. Application anatomy

```
src/
├── main.ts                      # bootstrap; APP_ROLE switch: api | worker | both
├── app.module.ts                # composition root: config, database, platform + business modules
├── modules/
│   ├── leave/                   # one folder per naming §4 namespace
│   │   ├── index.ts             # THE FACADE — the only file other modules may import
│   │   ├── leave.module.ts
│   │   ├── domain/              # entities, value objects, domain services, repository interfaces
│   │   ├── application/         # use cases, ports (in/out), application DTOs, event contracts
│   │   ├── infrastructure/      # drizzle repositories, external adapters, BullMQ processors
│   │   └── presentation/        # controllers, request/response DTOs, mappers
│   └── …                        # auth, approval, notification, attendance, payroll, …
├── shared/                      # ADR-0001 whitelist: result.ts, envelope, AppError, tenant/request
│                                # context, pagination primitives — no business logic, no schema
└── database/
    ├── schema/                  # Drizzle schema, one file per module namespace + _shared.ts builders
    ├── migrations/              # drizzle-kit output, forward-only
    └── database.module.ts       # pool, ConnectionProvider, UnitOfWork
```

Rules the tree encodes:

1. `shared/` is the ADR-0001 whitelist — additions require touching that ADR in review.
2. Drizzle schema is **centralized** in `src/database/schema/` (drizzle-kit needs one schema root) but **owned** per module: `schema/leave.ts` may be edited only alongside the leave module; table ownership is declared in the module doc (ADR-0001 §Decision-5).
3. BullMQ processors live in the owning module's `infrastructure/`, not in a global workers folder (ADR-0001 §Decision-7).

## 3. Layer rules

Dependencies point inward only: `presentation → application → domain`; `infrastructure → application + domain` (implements their interfaces). Nothing imports outward.

| Layer | Contains | May import | Never contains |
|---|---|---|---|
| `domain/` | Entities, value objects, domain services, repository **interfaces**, domain error factories | `shared/`, other files in own domain | Any framework import — no `@nestjs/*`, no `drizzle-orm`, no HTTP/queue types |
| `application/` | Use cases (one class, one `execute()`), ports, application DTOs, event payload contracts | own domain, `shared/`, DI decorators (`@Injectable`, `@Inject`) | SQL, Drizzle types, `HttpException`, envelope types, Swagger decorators |
| `infrastructure/` | Drizzle repository implementations, ConnectionProvider consumers, external adapters (GCS signing, FCM), BullMQ processors | own domain + application, `src/database`, `shared/`, driver libs | Business rules — an `if` encoding policy belongs in domain/application |
| `presentation/` | Controllers, transport DTOs (class-validator + Swagger), mappers, module-local guards | own application, `shared/` | Direct repository or `db` access; business logic |

Pragmatism line: `@Injectable`/`@Inject` decorators are allowed in `application/` (use cases are providers); the domain layer stays framework-free. Cross-cutting guards/interceptors/filters live in the platform modules that own them (`auth`, `authz`) or `shared/` per the whitelist.

## 4. Module facade

ADR-0001 §Decision-1 made facade-only imports a lint error. The facade is two things kept in sync:

1. **`index.ts`** — the compile-time surface. Exports: the NestJS module class, application-layer **port tokens + interfaces**, public DTOs, and emitted event contracts. Internal paths are never exported.
2. **The NestJS module** — the runtime surface. `exports:` lists exactly the providers behind the exported tokens.

```ts
// modules/leave/index.ts — the only import path other modules may use
export { LeaveModule } from './leave.module';
export { LEAVE_QUERY_PORT, type LeaveQueryPort } from './application/ports/leave-query.port';
export type { LeaveBalanceDto } from './application/dto/leave-balance.dto';
export { LeaveRequestApproved } from './application/events/leave-request-approved.event';
```

```ts
// modules/leave/application/ports/leave-query.port.ts
export const LEAVE_QUERY_PORT = Symbol('LEAVE_QUERY_PORT');

export interface LeaveQueryPort {
  balancesAsOf(employeeId: string, asOf: string): Promise<LeaveBalanceDto[]>;
}
```

Consumption from another module: `imports: [LeaveModule]` + `@Inject(LEAVE_QUERY_PORT)`. Ports are `Symbol` tokens with interfaces — never concrete classes — so extraction later swaps the provider for an HTTP/queue adapter without touching consumers (ADR-0001 readiness criterion c). Async cross-module communication is outbox events only (ADR-0010); consuming a port and consuming an event are the only two channels.

## 5. Request lifecycle — NestJS primitive order

The system-overview §4 spine, mapped to the primitives that implement it. Order is fixed; each concern's semantics live in its source document.

| # | NestJS primitive | Concern | Source |
|---|---|---|---|
| 1 | Middleware | `X-Request-Id` assign/propagate; pino request logger binding | ADR-0011 |
| 2 | Guard: `ThrottlerGuard` | Rate limiting (Redis-backed) | `docs/03-standards/security-standards.md` |
| 3 | Guard: `JwtAuthGuard` | Access-token verification; populates auth context (`userId`, `tenantId`, `sessionId`) | ADR-0004 |
| 4 | Guard: `TenantStatusGuard` | Tenant `active` check via short-TTL Redis cache | ADR-0002 |
| 5 | Guard: `PermissionGuard` | Reads `@RequirePermission()` metadata; deny-by-default | ADR-0005 |
| 6 | Interceptor: `IdempotencyInterceptor` | Mutations carrying `Idempotency-Key`: Redis replay check before work, response capture after commit | ADR-0007 |
| 7 | Interceptor: `TransactionInterceptor` | Opens the Drizzle transaction, runs `set_config('app.tenant_id', …)`, stores the handle in ALS (§8) | ADR-0002 |
| 8 | Pipe: `ValidationPipe` | Transport DTO validation → `VAL_VALIDATION_FAILED` + field entries | ADR-0006, A-011 |
| 9 | Controller → use case | Business rules; returns `Result` | ADR-0006 |
| 10 | Interceptor (post): `EnvelopeInterceptor` | Wraps success values in the ADR-0007 envelope | ADR-0007 |
| 11 | Filters | `AppErrorFilter` (Result failures surfaced by `unwrap`), global exception filter (`SYS_INTERNAL`) | ADR-0006 |

Two consequences of NestJS's fixed ordering, accepted deliberately:

- **The transaction opens before DTO validation** (interceptors precede pipes). A 422 rolls back an empty transaction — negligible cost, not worth fighting the framework.
- **Public routes** (login, refresh) skip guards 3–5 via `@Public()` metadata; everything else is deny-by-default — a route without `@RequirePermission()` or an explicit `@Public()` fails the route lint (ADR-0005).

`@RequirePermission('leave.request.approve')` is a single custom decorator that simultaneously: feeds `PermissionGuard`, emits the permission into the Swagger operation description, and is statically scanned by the route lint. One source of truth for enforcement, docs, and CI.

## 6. Transport validation (A-011: class-validator)

ADR-0006 left the backend transport-validation library open ("Zod / class-validator"). Fixed here: **class-validator + class-transformer** — native `ValidationPipe` integration and the same decorator surface Swagger reads, so DTO shape, validation, and API docs are one declaration. Zod remains the admin-web library (spec §5.2); the two never share schemas — the API contract is OpenAPI, not a shared package. Logged as A-011.

```ts
// modules/leave/presentation/dto/submit-leave-request.dto.ts
export class SubmitLeaveRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  leaveTypeId!: string;

  @ApiProperty({ example: '2026-08-10', description: 'Branch-local date' })
  @IsDateString()
  fromDate!: string;

  @ApiProperty({ example: '2026-08-12' })
  @IsDateString()
  toDate!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
```

Division of labor (ADR-0006, restated once because everyone gets it wrong): the DTO rejects **garbage** (`VAL_` field codes, before the use case runs); the use case rejects **rule violations** (module codes, e.g. `LVE_INSUFFICIENT_BALANCE`). A date-range-inverted check is transport (`VAL_DATE_RANGE_INVALID`); an insufficient-balance check is domain. Never duplicate a domain rule into a DTO decorator.

## 7. Result wiring

### 7.1 Use case shape

One class, one public `execute()`, constructor-injected ports, returns `Result`. Never throws for business failures; never imports HTTP types.

```ts
@Injectable()
export class SubmitLeaveRequestUseCase {
  constructor(
    @Inject(LEAVE_REQUEST_REPOSITORY) private readonly requests: LeaveRequestRepository,
    @Inject(LEAVE_BALANCE_REPOSITORY) private readonly balances: LeaveBalanceRepository,
    @Inject(APPROVAL_PORT) private readonly approvals: ApprovalPort,
    private readonly events: DomainEventWriter, // outbox insert, same tx (ADR-0010)
  ) {}

  async execute(cmd: SubmitLeaveRequestCommand): Promise<Result<LeaveRequestDto>> {
    const balance = await this.balances.availableAsOf(cmd.employeeId, cmd.fromDate);
    if (balance.lt(cmd.requestedDays)) {
      return fail(leaveErrors.insufficientBalance({ available: balance.toString() }));
    }
    // … create aggregate, start approval chain, write outbox event …
    return ok(toDto(request));
  }
}
```

### 7.2 Controller unwrap

Controllers are mappers, nothing else. The `unwrap` helper (in `shared/`) throws an internal `AppErrorException` carrying the `AppError`; `AppErrorFilter` maps it to the envelope with the HTTP status registered in the error catalog.

```ts
@Controller('leave-requests')
export class LeaveRequestController {
  @Post()
  @RequirePermission('leave.request.create')
  async submit(@Body() dto: SubmitLeaveRequestDto, @Ctx() ctx: RequestContext) {
    return unwrap(await this.submitLeaveRequest.execute(toCommand(dto, ctx)));
  }
}
```

```ts
// shared/unwrap.ts — the only sanctioned Result→HTTP bridge
export function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  throw new AppErrorException(result.error); // caught by AppErrorFilter
}
```

### 7.3 Filters

Two global filters, registered in this order:

- **`AppErrorFilter`** — catches `AppErrorException`: looks up the HTTP status for `error.code` in the catalog map (each module registers `code → status` beside its error factories; the catalog document is the registry of record), emits the ADR-0007 error envelope with `requestId`. Business failures are **not** Sentry events (ADR-0011).
- **Global exception filter** — everything else: logs with full stack + `requestId`, reports to Sentry, returns `SYS_INTERNAL` (500) with zero internal detail (error-catalog §3).

Error factories live beside the domain (`modules/leave/domain/leave.errors.ts`), return `AppError` with catalog codes, and are the only place codes are spelled — string literals of error codes anywhere else are a lint error.

## 8. Drizzle integration

### 8.1 Connection and unit-of-work

`DatabaseModule` provides three things (implementation detail of ADR-0002 — tenant semantics live in `docs/02-architecture/multi-tenancy.md`):

1. **Pool** — one `pg` pool per process, sized per runtime (environments.md).
2. **`UnitOfWork`** — `run(ctx, fn)`: opens `db.transaction`, executes `set_config('app.tenant_id', ctx.tenantId, true)` as the first statement (database-conventions §9.1), then runs `fn` inside an `AsyncLocalStorage` scope holding the transaction handle. Used by `TransactionInterceptor` (HTTP) and the job wrapper (workers) — business code never calls it directly.
3. **`ConnectionProvider`** — `handle()`: returns the ALS transaction when inside a unit-of-work, else the pool (the ADR-0002 seam for future per-tenant databases).

Repositories therefore never receive or pass transaction objects; nesting use cases compose in one transaction for free, and there is no code path to a tenant-table query outside a `set_config`-bearing transaction.

### 8.2 Repository pattern

Interface in `domain/`, Drizzle implementation in `infrastructure/`, bound by token in the module:

```ts
// modules/leave/domain/leave-request.repository.ts
export const LEAVE_REQUEST_REPOSITORY = Symbol('LEAVE_REQUEST_REPOSITORY');
export interface LeaveRequestRepository {
  findById(id: string): Promise<LeaveRequest | null>;
  save(request: LeaveRequest): Promise<void>;
}
```

All tenant-class repositories extend `TenantScopedRepository` (in `src/database/`), which owns the invariants so implementations cannot forget them:

| Invariant | Mechanism | Source |
|---|---|---|
| `tenant_id = ctx` on every statement | Base class query builders inject the predicate from `TenantContext`; RLS backstops | ADR-0002 |
| Soft-deleted rows excluded by default | Base read path appends `deleted_at IS NULL`; opt-in `{ includeDeleted: true }` for admin surfaces | database-conventions §4.2 |
| Audit stamping | `created_by`/`updated_by` from `RequestContext.userId` (`NULL` for system actors) | database-conventions §3.1 |
| Optimistic locking | Updates on `version`-carrying tables append `WHERE version = :expected` and increment; zero rows affected → stale-write failure for the sync engine | database-conventions §1.10, ADR-0003 |
| Effective dating | `asOf(date)` filter helper and `supersede()` (close current + insert successor, one transaction) implemented once in the base | database-conventions §5 |

Direct `db`/`ConnectionProvider` injection outside `infrastructure/` and `src/database/` is a lint error — the structural version of "no query can forget the tenant filter."

### 8.3 Schema and migrations

Schema files spread the `_shared.ts` builders (database-conventions §3.4) — hand-rolled audit/tenant columns are a review blocker. Migration workflow, CI gates, and the `-- manual:` RLS/EXCLUDE rule are fixed in database-conventions §10 and are not restated here.

## 9. Worker bootstrap

`main.ts` reads `APP_ROLE`:

- **`api`** — creates the HTTP app: middleware, global guards/interceptors/filters/pipes (§5 order), Swagger (§10), listens.
- **`worker`** — creates an application context (no HTTP): registers BullMQ processors discovered from module `infrastructure/` layers, the outbox relay, and repeatable `cron.` jobs (ADR-0010). Every processor runs inside `UnitOfWork.run(ctxFromJobPayload, …)` — the payload's `tenantId` is mandatory for tenant work (ADR-0002 §Layer-1.3); a processor touching repositories without a unit-of-work fails at `ConnectionProvider` (no ALS scope → pool handle → RLS yields zero rows — fail-closed).
- **`both`** — both of the above in one process; local dev only, never a production topology.

Graceful shutdown, stall handling, and idempotency discipline are ADR-0010 rules; the health endpoints (liveness = process up; readiness = DB + Redis reachable) ship in a small `health` platform module and are probed per system-overview §3.

## 10. Swagger / OpenAPI

- Generated from code via `@nestjs/swagger` decorators on controllers and DTOs — the same declarations class-validator uses (§6). No hand-written OpenAPI files.
- Every operation documents: auth requirement, required permission (emitted by `@RequirePermission`), request/response DTOs wrapped in the envelope schema, and its error codes. Envelope wrapping uses shared decorators (`@ApiOkEnvelope(LeaveRequestResponseDto)`, `@ApiErrorCodes('LVE_INSUFFICIENT_BALANCE', …)`) so catalog codes appear in the spec verbatim — the depth bar of `HANDBOOK_SPEC.md` §2.1 applied at the code level.
- Served at `/api/docs` in local and staging; **disabled in production builds** (exposure posture and any future auth-gating: `docs/03-standards/security-standards.md`).
- CI exports the OpenAPI JSON as a build artifact per release — the reviewable API contract between the three repos (A-006).

## 11. Configuration and bootstrap order

- `@nestjs/config` with a class-validator-validated env schema; the process **fails at boot** on missing/malformed env — never limps with defaults for secrets/URLs. Env names per naming §12 (`UPPER_SNAKE`).
- Bootstrap order in `main.ts`: config validation → pino logger (ADR-0011 base fields) → Sentry init → OTel SDK start → app creation → global primitives (§5) → Swagger (non-prod) → listen. OTel before app creation so auto-instrumentation patches `http`/`pg`/`ioredis`/`bullmq`.
- Security headers, CORS allow-list, and cookie policy are configured at bootstrap but specified in `docs/03-standards/security-standards.md`.

## 12. Enforcement (CI-gated)

| Rule | Tool |
|---|---|
| Facade-only cross-module imports; business → platform → shared direction; no cycles | dependency-cruiser (config in repo root, reviewed like code) |
| No `@nestjs/*`/`drizzle-orm` imports in `domain/`; no `HttpException` outside `presentation/`; no `db`/`ConnectionProvider` outside `infrastructure/` + `src/database/`; no error-code string literals outside error factories | ESLint `no-restricted-imports` / `no-restricted-syntax` |
| Every route has `@RequirePermission()` or `@Public()` | route lint script (ADR-0005) |
| Schema file ↔ migration drift; empty-DB + prod-snapshot apply | drizzle-kit check + migration gates (database-conventions §10.7) |
| i18n keys for every registered error code, both locales | catalog completeness check (error-catalog §1.4) |

Violations are review blockers equal to failing tests (naming-conventions §13).
