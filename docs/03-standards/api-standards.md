# API Standards

Status: Active (Phase 2) · Source: `docs/adr/ADR-0007-api-versioning-response-envelope.md` (contract), `docs/03-standards/error-catalog.md`, `docs/03-standards/naming-conventions.md` §3 · Related: `docs/adr/ADR-0006-result-pattern-error-handling.md`, `docs/02-architecture/backend-nestjs.md` §5/§10, `docs/02-architecture/offline-sync.md` · Downstream: every module doc §7 API

Binding conventions for every endpoint. ADR-0007 fixed the contract (versioning, envelope, wire data types, pagination styles, idempotency store); this document fixes the working rules and hosts two registries: the per-resource pagination registry (§6) and the endpoint-spec template module docs instantiate (§13). Module docs declare per-endpoint specifics and **deviations only**.

## 1. Resource design

1. Resources are plural kebab-case nouns; nesting max one level, only for true ownership; otherwise filter on the collection (naming §3).
2. Non-CRUD actions: `POST /<collection>/{id}/<verb>` with a verb from the naming §3 approved set (`approve`, `reject`, `cancel`, `submit`, `execute`, `lock`, `unlock`, `publish`, `acknowledge`, `revoke`, `restore`, `close`, `terminate`, `assign`, `return`, `export`, `retract`). A new verb is added to naming §3 first, then used. (`export` and `retract` appended 2026-08-03 — `retract` on registration by announcement.md, `export` because this mirror had drifted behind naming §3, which registered it retroactively during the recruitment-candidate.md session; the mirror is now level with the source list.)
3. Every route lives under `/api/v1` — whole-surface versioning; additive changes never bump, breaking changes are a `v2` decision (ADR-0007). Retiring an endpoint inside v1: mark deprecated in Swagger + announce; removal happens only at a version bump.
4. Every endpoint declares its permission requirement: one key normally; `— (authenticated)` for own-scope surfaces (resolved calendars, delta sync); composite operations declare all keys they check — deny-by-default (ADR-0005, backend-nestjs §5).

## 2. Methods and status usage

| Method | Use | Notes |
|---|---|---|
| `GET` | Read; never mutates; always safe to retry | |
| `POST` | Create + action verbs | `201` for resource creation (created resource in `data`), `200` for actions |
| `PATCH` | **The** update verb: partial semantics — absent = unchanged, `null` = clear (ADR-0007) | `PUT` is unused in V1; full-replace adds a second update semantic for no gain |
| `DELETE` | Soft delete by default (database-conventions §4) | `200` with envelope (see below); hard delete exists only via purge jobs, never HTTP |

**Every response carries the envelope — therefore no `204`.** Deletes and actions return `200` with `data` = the affected resource's terminal representation (or `{ "id": … }` where returning the full body is wasteful). No `Location` header ceremony: clients take `data.id`.

Redirections (3xx) are not used by the API. `4xx`/`5xx` semantics come from the error catalog entry of the code being returned — status is transport garnish, clients branch on `error.code` (ADR-0007).

## 3. Request conventions

| Header | Rule |
|---|---|
| `Authorization: Bearer <access>` | All routes except `@Public()` (login, refresh, reset) |
| `Idempotency-Key: <uuid>` | Required where §7 says so; accepted on any POST |
| `X-Request-Id` | Client-supplied honored, else assigned; echoed on every response (ADR-0011) |
| `Accept-Language` | `id` (default) / `en`; affects server-generated documents only — UI strings are client-side (D12) |

- Content type: `application/json` only. **No multipart anywhere** — file bytes travel via signed URLs (ADR-0009); the API handles metadata JSON.
- Bodies camelCase both directions; wire data types (UUID strings, ISO-8601 `Z` timestamps, `YYYY-MM-DD` dates, decimal-string money, `snake_case` enum values) per the ADR-0007 table — not restated here.
- Unknown body fields are **rejected** (`VAL_VALIDATION_FAILED`, whitelist DTOs — `forbidNonWhitelisted`): a typo'd optional field must fail loudly, not silently no-op. The one exception: forward-compat additions the endpoint doc explicitly marks tolerated.
- Empty string is never a valid value for an optional field — send `null` (clear) or omit (unchanged). Empty string → `VAL_INVALID_FORMAT`.

## 4. Reads: filtering, sorting, search

Rules on top of the ADR-0007 grammar:

1. **Sorting:** `sortBy=field:asc,other:desc`; whitelisted fields per endpoint (declared in the module doc + Swagger). **Every sort is deterministic:** the endpoint appends `id` as final tiebreaker — offset pages must not shuffle between requests.
2. **Filters:** flat camelCase params; ranges `<field>From`/`<field>To` (inclusive both ends; date filters on `timestamptz` fields interpret dates in the **branch timezone** of the filtered entity where the module doc says so — module docs must state which); comma lists = OR within the field, AND across fields. No generic filter language in V1 (ADR-0007).
3. **Search:** `q` = case-insensitive contains across the endpoint-documented field set. Search is a filter, composable with the rest.
4. `includeDeleted=true`: admin surfaces only, gated by the module's read permission at minimum (module doc may demand a stronger key); soft-deleted rows come back with `deletedAt` set.
5. Booleans are literal `true`/`false`; anything else → `VAL_INVALID_FORMAT`.
6. List endpoints without explicit `sortBy` document their default order; the default is also deterministic.

## 5. Pagination rules

Two styles, semantics per ADR-0007 (`meta` shapes, param names, defaults/max 100). Working rules:

1. **Every list endpoint paginates.** No unbounded collections, no `pageSize=0` tricks (spec §5.14).
2. **Offset depth cap:** `page × pageSize ≤ 10 000`. Beyond it → `VAL_VALIDATION_FAILED` with `VAL_OUT_OF_RANGE` on `page`. A grid that legitimately needs deeper access is mis-styled — switch the resource to cursor (registry edit), or narrow with filters. Protects the database from `OFFSET 200000` scans.
3. Cursor tokens are opaque base64 keyset positions; clients never construct or parse them. A cursor older than its data window (or referencing evicted rows) → `VAL_INVALID_CURSOR` (400) — clients restart from page one.
4. Cursor `meta` never carries totals (ADR-0007). A UI that needs a count alongside a cursor feed gets a separate documented count/summary endpoint — counts are a query cost decision, not a freebie.
5. `keepPreviousData`-style UX concerns live client-side (admin-nextjs §7); the API contract does not change per consumer.

## 6. Pagination registry (per-resource)

Protocol mirrors the error catalog: **the module doc that introduces a list endpoint adds its row here in the same session.** Seed rows from platform decisions already made:

| Resource (list endpoint) | Style | Reason |
|---|---|---|
| Admin master-data grids (employees, companies, roles, holiday calendars, …) | offset | Humans paging TanStack grids; totals wanted (ADR-0007 rule of thumb) |
| Admin transactional grids (leave/overtime/correction requests, payroll runs, expense claims) | offset | Same; bounded by period filters in practice |
| Self-service sessions/devices lists | offset | Tiny, but the paginate-everything rule stands; totals harmless |
| Inbox items, notifications | cursor | Feeds: unbounded, newest-first, infinite scroll |
| Mobile self-service history (my attendance, my requests, my payslips) | cursor | Mobile scroll + sync-adjacent access patterns |
| Audit log | cursor | Append-only and huge; deep offset scans are the exact §5.2 failure |
| Delta-sync endpoints (per entity, §8) | cursor | Machine consumption; `updatedSince` + keyset is the contract |
| Import/export/report job lists | offset | Admin grids, small |
| Report **results** (`GET /reports/{key}/result`) | offset | Bounded twice by construction — reports.md BR-RPT-010 caps rows and statement duration, and definitions declare required params, so the §5.2 depth cap is the report's own limit rather than a guard against it. Deeper access is not "mis-styled": it is the file, which is the same query with a worker budget |

A module deviating from its family's seed row states why in its doc §7 and updates this table.

## 7. Idempotency (working rules)

Store mechanics, TTL (7 d), and the outcome flowchart are ADR-0007. Operational rules:

1. **Required** (`Idempotency-Key` missing → `VAL_VALIDATION_FAILED` on the header): every queue-reachable endpoint (declared per module §10 checklist, offline-sync §10) and every payment-affecting mutation (payroll execute/close, disbursement actions, bank-file generation). The endpoint's spec block (§13) carries `Idempotency: required`.
2. **Accepted** on any other POST; PATCH/DELETE accept it where the module doc says retries are expected.
3. Key = UUID (client-generated; the offline queue uses `opId` — ADR-0003). Scope is per tenant (`hris:idem:{tenantId}:{key}`) — cross-tenant collisions are impossible by construction.
4. **Payload hash = SHA-256 of the raw request body bytes.** Headers and query are excluded. Same key + different hash → `VAL_IDEMPOTENCY_PAYLOAD_MISMATCH` (409): the client mutated a payload it claimed was a retry — a client defect, never retried (offline-sync §4).
5. Replayed responses are byte-identical to the original and carry `Idempotency-Replayed: true`. Replays don't re-execute permissions or business rules — they return the stored outcome; a permission revoked after the original success does not un-happen it.
6. GET is never idempotency-keyed — it is already safe.

## 8. Delta-sync endpoint shape (binding for offline entities)

Every entity the mobile app pulls (offline-sync §3) exposes:

```
GET /api/v1/<resource>/sync?updatedSince=<ISO8601>&cursor=<opaque>&limit=<n>
```

- Ordering: `(updated_at, id)` ascending — stable keyset; `cursor` encodes the last-seen pair; first call omits `cursor` and sets `updatedSince` (device's `lastPulledAt` high-water mark).
- Rows include **tombstones**: soft-deleted rows with `deletedAt` set, so devices evict local copies (pending-data protection still applies on-device — offline-sync §1). Purged rows (past D4 windows) are gone entirely; devices older than the purge window do a full re-pull (documented per module).
- Version-carrying entities include `version`; devices store and echo it (database-conventions §11.4).
- `meta`: `{ nextCursor, hasMore }`; page through until `hasMore = false`, then persist the new high-water mark.
- Auth + data scope apply exactly as on normal reads — sync is not a privileged channel: the employee pulls own-scope data only.

## 9. Concurrency on the wire

Mutable entities that carry `version` (database-conventions §1.10): every update (PATCH or action verb) **must include the client's `version`** in the body; mismatch → `SYNC_VERSION_CONFLICT` (409) with `details.current` = the current server row. Applies to the admin web the same as to mobile — two HR admins editing one shift definition hit the same protection. Entities without `version` (append-only facts, server-computed aggregates) reject client `version` fields as unknown (§3).

No `ETag`/`If-Match` in V1 — one optimistic-concurrency mechanism, in the body, same across clients (ETags revisit per ADR-0007 future note).

## 10. Bulk operations

No generic bulk endpoints in V1. The two sanctioned shapes:

1. **File-based bulk** — the import framework (ADR-0015): validation pipeline, dry-run, error report. For anything resembling mass data entry.
2. **Explicit module bulk actions** (e.g. approve several leave requests): a module doc may define `POST /<collection>/bulk-<verb>` taking `{ "ids": [...] }` (≤ 100 per call), returning **per-item results** — never all-or-nothing across unrelated aggregates:

```json
{ "success": true, "data": { "results": [
  { "id": "…", "success": true },
  { "id": "…", "success": false, "error": { "code": "LVE_REQUEST_ALREADY_DECIDED", "messageKey": "errors.LVE_REQUEST_ALREADY_DECIDED" } }
] }, "meta": { "succeeded": 1, "failed": 1 } }
```

Rows that do not exist yet may be batched by **natural key instead of `ids`** (`{ items: [{ …key…, …fields… }] }`, same ≤ 100 cap, same per-item result envelope) — a bulk create/upsert cannot reference ids it is about to mint. First use: `POST /api/v1/roster-days/bulk-assign` (shift.md §7, added 2026-08-02). The `{ ids }` shape stays the default for actions on existing aggregates.

The HTTP status is `200` when the batch was processed (individual failures live in the items); the envelope-level error path is reserved for the batch itself being unprocessable. Each item's `error` object mirrors the catalog shape minus `requestId`. (`LVE_REQUEST_ALREADY_DECIDED` above stopped being illustrative on 2026-08-02: `docs/06-modules/leave.md` registered it, and `POST /api/v1/leave-requests/bulk-approve` is the shape's second real use.)

## 11. Errors on the wire

- The catalog is the registry; module docs list their codes in §11 and register them the same session (error-catalog §1).
- Every endpoint's spec block enumerates the codes it can return — `SYS_INTERNAL`, `SYS_RATE_LIMITED`, `AUTH_*` transport codes, and `AUTHZ_PERMISSION_DENIED` are implied on every authenticated route and not re-listed.
- **Existence-hiding duty:** any endpoint addressing a resource by id applies error-catalog §2 — data-scope miss = `SYS_NOT_FOUND`, 404 (a module `*_NOT_FOUND` code exists only when a client must branch on that specific miss — none yet; grilled 2026-08-02). Module docs may not invent per-endpoint 403 variants for data scope.
- Validation failures: one top-level `VAL_VALIDATION_FAILED` with the field-entry array — never per-field top-level codes (error-catalog §4).

## 12. Swagger rules (review gate)

Per backend-nestjs §10, an operation is complete when it shows:

1. `operationId` = camelCase verb + resource, matching the use-case class (`submitLeaveRequest` ↔ `SubmitLeaveRequestUseCase`); tag = module namespace (naming §4).
2. Auth requirement (or explicit public marker) and the required permission key(s) in the description (emitted by `@RequirePermission`).
3. Request/response DTOs wrapped in envelope schemas (`@ApiOkEnvelope`), field examples for money (decimal string) and dates.
4. Every returnable catalog code via `@ApiErrorCodes(…)` (§11 exemptions aside).
5. Pagination style + params for lists; `Idempotency: required/accepted` marker for mutations.

Missing any item fails review — this checklist is the api-standards review gate referenced by ADR-0007.

## 13. Endpoint spec template (module docs §7)

Module docs specify each endpoint with this block — the depth bar of `HANDBOOK_SPEC.md` §2.1 in fixed form:

```markdown
#### <VERB> /api/v1/<path>
Permission: `<ns>.<resource>.<action>` · Idempotency: required | accepted | — · Pagination: offset | cursor | —
Queue-reachable: yes | no (offline-sync §10)

Request: <DTO table: field · type · required · rule>
Response 2xx: <data shape (+ meta shape for lists)>
Errors: <catalog codes beyond the implied set, one line each: code — trigger>
```

Endpoints inside one module sharing request/response fragments reference a shared schema section once — no copy-paste blocks. Everything else (envelope, headers, wire types, status semantics) is inherited from this document and never restated per endpoint.

The reference module's §7 (`docs/06-modules/holiday.md` — summary table carrying Permission/Pagination/Queue-reachable/Idempotency, then per-endpoint detail blocks) is the canonical instantiation of this template (grilled 2026-08-02).
