# Coding Standards — Flutter

Status: Active (Phase 2) · Source: `docs/02-architecture/mobile-flutter.md` (architecture — not restated here) · Related: `docs/adr/ADR-0003-offline-sync-conflict-resolution.md`, `docs/adr/ADR-0006-result-pattern-error-handling.md`, `docs/03-standards/naming-conventions.md` §11.3, `docs/04-database/database-conventions.md` §11, `docs/03-standards/design-system.md` (approved) · Downstream: `docs/07-operations/testing-strategy.md` (coverage targets)

Idioms and testing conventions for the Flutter repo. Layer rules, folder anatomy, and library choices are `docs/02-architecture/mobile-flutter.md` (A-012); this document is how code inside those boundaries is written.

## 1. Dart language rules

- `analysis_options.yaml`: `flutter_lints` base + analyzer strict modes — `strict-casts`, `strict-raw-types`, `strict-inference` all on. Warnings are errors in CI.
- **No `dynamic`** in signatures or fields (JSON decode internals convert immediately at the mapper edge). No `as` downcasts in feature code — pattern matching instead.
- **No `!` null-assert** outside tests; restructure or handle. A justified exception carries a one-line comment.
- Immutability by default: `final` fields, `const` constructors wherever possible; collections exposed as unmodifiable views from states/entities.
- Exhaustive `switch` on every sealed type — `default`/`_` arms on sealed hierarchies are banned (they silently swallow new cases; the compiler must break the build instead).
- `dart format` untouched (trailing commas everywhere widgets nest); formatting is CI-checked, never reviewed by humans.

## 2. State classes

Two sanctioned shapes — pick per screen, don't mix within one cubit:

```dart
// Shape A — sealed hierarchy: screens with distinct render shapes
sealed class LeaveListState extends Equatable {
  const LeaveListState();
  @override
  List<Object?> get props => [];
}

final class LeaveListLoading extends LeaveListState { const LeaveListLoading(); }

final class LeaveListLoaded extends LeaveListState {
  final List<LeaveRequest> requests;
  final SyncStatus sync;
  const LeaveListLoaded(this.requests, this.sync);
  @override
  List<Object?> get props => [requests, sync];
}

final class LeaveListError extends LeaveListState {
  final AppFailure failure;               // carries the catalog code
  const LeaveListError(this.failure);
  @override
  List<Object?> get props => [failure];
}
```

```dart
// Shape B — single data class + copyWith: incremental/form state
final class LeaveFormState extends Equatable {
  final LeaveType? type;
  final DateRange? range;
  final SubmitStatus status;              // enum: idle | submitting | success | failure
  final AppFailure? failure;
  const LeaveFormState({this.type, this.range, this.status = SubmitStatus.idle, this.failure});
  LeaveFormState copyWith({...}) => …;
  @override
  List<Object?> get props => [type, range, status, failure];
}
```

Rules: `Equatable` on every state; states carry domain entities or `AppFailure`, never raw exceptions/JSON; loading is a state (or `status` field), never a nullable-field convention.

## 3. Cubit / Bloc idioms

- One public method per user intent (`loadRequests()`, `submit()`); methods are `Future<void>` — UI never awaits return values for data (data arrives via state).
- **Guard late emissions:** after every `await`, bail if closed — `if (isClosed) return;` — before `emit`. Async gaps outlive screens.
- No cubit reads another cubit. Shared state comes from `core/` cubits injected where needed, or composition happens in a use case. `BlocListener` is for side effects only (navigation, snackbar, haptic); `BlocBuilder`/`BlocSelector` for rendering; `BlocSelector` preferred on large states.
- Blocs (the two justified cases — mobile-flutter §4) keep event handlers thin: transformer + use-case call + emit; `droppable()`/`restartable()` transformers chosen per handler and commented with one line saying why.
- Cubits never: touch dio/Drift directly, format strings for UI (l10n at widget layer), or catch exceptions (repositories already converted — §5).

## 4. Use cases

- Callable class: `Future<Result<T>> call(Params p)`; ≥ 3 parameters become a `const` params object. `Stream<T>` use cases wrap repository watch streams — errors inside streams surface as states via a `Result`-shaped stream event, not stream errors.
- A use case that only forwards a repository call still exists **only if** it adds a rule, composes, or names a business action screens share; otherwise the cubit calls the repository contract directly — no ceremony forwarding (lazy rule; deviations of the pure-forward kind are simply not written).

## 5. Result and error handling

Consumption — switch expressions, exhaustive:

```dart
final result = await submitLeaveRequest(params);
if (isClosed) return;
switch (result) {
  case Success(:final value):
    emit(state.copyWith(status: SubmitStatus.success));
  case Failure(:final failure):
    emit(state.copyWith(status: SubmitStatus.failure, failure: failure));
}
```

Repository conversion boundary (the only try/catch layer — ADR-0006):

```dart
Future<Result<LeaveRequest>> submit(LeaveDraft draft) async {
  try {
    final dto = await _api.submit(draft.toPayload());     // dio, envelope-unwrapped
    return Success(dto.toEntity());
  } on ApiException catch (e) {                            // error envelope → typed
    return Failure(AppFailure(code: e.code, messageKey: e.messageKey, details: e.details));
  } on DioException catch (e) {
    return Failure(AppFailure.transport(e));               // SYNC_OFFLINE / SYS-class mapping
  }
}
```

- UI text: `context.l10n.error(failure.code)` — a single helper resolving `errors.<CODE>` with fallback to a generic message + `requestId` surface. String-matching on `message` is banned (ADR-0006 rule 4); branching on `code` constants only.
- Never swallow: a caught-and-ignored exception is a review blocker; genuinely ignorable cases log via the Sentry breadcrumb helper.

## 6. Drift patterns

- Tables/DAOs per mobile-flutter §6; features never run `customStatement` — raw SQL lives in `core/database` (migrations) only.
- **Reads are streams:** repository read APIs default to `watch*()` returning Drift streams; one-shot `get*()` only where a stream is meaningless (lookups inside a use case).
- Multi-table writes wrap in `transaction(() …)` — enqueue-with-optimistic-apply (offline-sync §2) is the canonical example.
- **Money = `TEXT` column + `TypeConverter<Decimal, String>`** (package `decimal`, appended to A-012): exact decimal strings end-to-end, mirroring the wire format (ADR-0007) and `numeric(15,2)`. Integer minor units are prohibited (database-conventions §11.1); `double` near money is a build-failing lint (custom rule on `MoneyText`/converter types).
- Schema migrations: every release bumps `schemaVersion` with a written `MigrationStrategy`; drift's generated schema-verification tests run in CI (`drift_dev` schema snapshots committed); `local_*` tables follow the never-destructive rule (mobile-flutter §6.3).
- Query composition stays in DAOs; repositories combine DAO calls, never build queries.

## 7. Models and mapping

- Wire/Drift models are hand-written (`fromJson`/`toJson`/`toEntity`/`toCompanion`) — no `json_serializable`/`freezed` (A-012 posture: the only codegen in the repo is Drift's). Mappers are total: unknown enum strings map to a domain `unknown` case with a Sentry breadcrumb, never a throw (server may add enum values — ADR-0007 open enums).
- Entities (domain) contain no `fromJson` — mapping is a data-layer concern; domain stays wire-ignorant.
- DTO field names mirror the wire exactly (camelCase); entity names may differ where CONTEXT.md vocabulary says so.

## 8. Widgets

- `const` constructors aggressively; `ValueKey(entity.id)` on every list item; no business logic in `build` — extract methods/widgets when a build exceeds ~40 lines.
- Kit-first: design-system §10 widgets are mandatory; hand-rolled buttons/chips/fields are review blockers. Tokens via `Theme.of(context)` — raw `Color(0x…)` in features fails lint (design-system §13).
- Text: every user-facing string through l10n (`context.l10n.…`); interpolations via ARB placeholders, never string concatenation (grammar breaks across id/en).
- Layout: `LayoutBuilder`/constraints over `MediaQuery.of` deep in trees; safe areas at page scaffolds (design-system §4); lists virtualize by default (`ListView.builder` — never `Column` of unbounded children).
- Accessibility: kit widgets carry semantics; screens add `Semantics`/`MergeSemantics` for composed rows and `SemanticsService.announce` for async outcomes (design-system §8.6).

## 9. Testing conventions

Pyramid per spec §5.15; numeric coverage targets live in testing-strategy.md. Structure: `test/` mirrors `lib/`; `*_test.dart`; shared builders in `test/support/builders/` (`aLeaveRequest(overrides…)` test-data builders per entity — fixtures are built, not copy-pasted JSON).

| Layer | What | How |
|---|---|---|
| Unit — use cases | Rules, Result paths | Hand-written fake repositories (preferred); `mocktail` where interaction verification matters |
| Unit — cubits/blocs | State sequences per intent | `bloc_test` (`build/act/expect`); every failure code path emits its failure state |
| Unit — repositories | Conversion boundary | Fake data sources; assert `DioException`→transport failure, envelope error→code passthrough, success→entity |
| Unit — sync engine | Crash invariants (offline-sync §7) | In-memory Drift (`NativeDatabase.memory()` — SQLCipher itself is not under test); tests: `syncing`→`pending` demotion on restart, double-ack idempotency, enqueue atomicity, cleanup never touches pending |
| Widget | Kit widgets + screens | Screens tested with fake cubits (`whenListen`); golden tests for kit widgets + key screens in **both themes** (fonts bundled ⇒ goldens deterministic; goldens run in CI on the pinned Flutter version) |
| Integration | **Journey list is fixed by `docs/07-operations/testing-strategy.md` §8.2 — M1–M4, closed and enforced by filename.** The three this row originally named are M1–M3; M4 (leave request offline → drain → verdict reconciles) was added 2026-08-04 because M2 exercises the punch sync class only, and a request receives a verdict that may contradict the optimistic local state | `integration_test` on emulator in CI (critical paths only — the expensive tier stays thin). No device farm in V1 (A-101) |

Rules: tests assert on **error codes and state types**, never message strings (ADR-0006); no network/real time in unit tests — clocks injected (`Clock` abstraction in `core/`), `fakeAsync` for backoff/timer logic; every bug fix lands with the regression test that would have caught it.

## 10. Enforcement (CI)

| Check | Tool |
|---|---|
| Analyzer strict + warnings-as-errors, format | `dart analyze` / `dart format --set-exit-if-changed` |
| Import boundaries (mobile-flutter §3/§12) | `tool/check_imports.dart` — path-rule script, zero deps; runs in CI |
| Prohibited packages (`riverpod`, `hive`, stray `shared_preferences`) + codegen whitelist (Drift only) | pubspec + import scan |
| No raw colors / no `double` money / kit-widget bypass | custom lint rules + review checklist (design-system §13) |
| l10n completeness (id + en, no untranslated) | `flutter gen-l10n` untranslated report must be empty (D12) |
| Drift schema snapshots current | drift schema verification tests |
| Goldens | pinned Flutter version in CI; golden diffs block merge |
