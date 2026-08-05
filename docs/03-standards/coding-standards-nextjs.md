# Coding Standards — Next.js (Admin Web)

Status: Active (Phase 2) · Source: `docs/02-architecture/admin-nextjs.md` (architecture — not restated here) · Related: `docs/adr/ADR-0006-result-pattern-error-handling.md`, `docs/adr/ADR-0007-api-versioning-response-envelope.md`, `docs/03-standards/naming-conventions.md` §11.2, `docs/03-standards/design-system.md` (approved) · Downstream: `docs/07-operations/testing-strategy.md` (coverage targets)

Idioms and testing conventions for the admin web repo. Rendering model, Server Actions policy, Axios chain, and React Query/RHF/DataTable conventions are `docs/02-architecture/admin-nextjs.md`; this document is how code inside those boundaries is written.

## 1. TypeScript rules

- `tsconfig`: `strict` plus `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (`import type` enforced). `exactOptionalPropertyTypes` deliberately off — it fights RHF and shadcn typings for near-zero payoff.
- **No `any`**, explicit or via inference holes; `unknown` at boundaries, narrowed immediately. `as` casts only at the wire edge (typed API functions, §5) — never to silence feature-code errors.
- **No `!` non-null assertion** outside tests; a justified exception carries a one-line comment.
- **No TS `enum`.** String literal unions (wire enums) or `as const` objects (lookup maps). Closed local unions get exhaustive `switch` + `assertNever(x)` helper (`lib/`); **wire enums are open** (ADR-0007 — server may add values), so their rendering maps end in an explicit fallback branch, never `assertNever` (§5).
- Domain-shaped strings (`EmployeeId`, decimal money strings) stay plain `string` — no branded-type machinery; the API is the authority and branding buys ceremony, not safety, in a display-and-forms app.
- Prettier untouched (incl. Tailwind class-sort plugin, §8); formatting is CI-checked, never reviewed by humans.

## 2. Components

- **`'use client'` sits at the feature-root boundary**, not sprinkled per file: `page.tsx` (RSC, routing only) mounts one client feature component; everything below inherits client context. A `'use client'` deep inside a feature tree is a smell — the boundary already passed.
- Named `function` declarations, PascalCase, in kebab-case files (naming §11.2). **No default exports** except files where Next.js requires them (`page.tsx`, `layout.tsx`, `error.tsx`, `not-found.tsx`, `loading.tsx`).
- Props: local `type Props = { … }` per component; exported only when genuinely shared. Handlers named `handleX` inside, `onX` as props.
- **Derive, don't sync:** values computable from props/state/query data are computed in render (memoized only when measured). `useEffect` is for real external synchronization (subscriptions, `BroadcastChannel`, focus/URL side effects) — an effect that only calls `setState` from other state is a review blocker.
- Cross-feature composition goes through the other feature's public `index.ts` (its only sanctioned barrel); `components/shared/` is for genuinely app-wide pieces (DataTable, RequirePermission, page scaffolds) — two features needing the same widget is the promotion trigger, not speculation.
- Every user-facing string through next-intl (`t('<ns>.<context>.<element>')`, naming §10); interpolation via message placeholders, never string concatenation.

## 3. Hooks and React Query idioms

Key factories and defaults are admin-nextjs §7. In-code shape:

```ts
// features/leave/hooks/use-leave-requests.ts
export function useLeaveRequests(filters: LeaveListFilters) {
  return useQuery({
    queryKey: leaveKeys.list(filters),
    queryFn: () => leaveApi.list(filters),
    placeholderData: keepPreviousData,        // grids: admin-nextjs §7
  });
}

// features/leave/hooks/use-approve-leave-request.ts
export function useApproveLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: leaveApi.approve,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leaveKeys.lists() }),
  });
}
```

- One hook per query/mutation, named `use<Thing>` in `features/<ns>/hooks/`; components never call `useQuery`/`useMutation` inline and never touch `queryClient` directly — **invalidation lives in the mutation hook**, not in components.
- `select` for per-component projections of a shared query; `enabled` for dependent queries — no conditional hook calls, no fetch-in-effect.
- Custom non-query hooks return named objects, not tuples, past two values.
- React Query owns the async error channel: feature code receives typed `ApiError` (admin-nextjs §6) and does **not** wrap queries in `Result`. `lib/result.ts` (vendored, ADR-0006) serves synchronous fallible helpers only.

## 4. Forms — RHF + Zod idioms

Schema split (transport shape + UX rules only; business rules arrive as catalog codes) and `applyServerErrors` are admin-nextjs §8 — not repeated. In-code conventions:

- One schema per form, `<thing>Schema`, colocated in `features/<ns>/schemas/`; form values type is `z.infer<typeof …Schema>` — never hand-written twice.
- Shared field primitives live in `lib/zod.ts` (`zDecimalString`, `zDateISO`, `zUuid`, `zRequiredString`) — the decimal-string money pattern is written once there. Zod messages are i18n keys resolved at render, not literal strings baked into schemas.
- Submit pattern — server errors into the form, unhandled codes to the feature error surface:

```ts
const onSubmit = form.handleSubmit(async (values) => {
  try {
    await approve.mutateAsync(values);
    toast.success(t('leave.approval.approved'));
  } catch (e) {
    if (e instanceof ApiError && applyServerErrors(form, e)) return;
    throw e; // feature error boundary/panel renders errors.<CODE> + requestId
  }
});
```

- **No client-side money arithmetic.** Money is a decimal string end to end (ADR-0007); the client formats (design-system §3) and validates shape (`zDecimalString`) but never computes — previews/totals that need math come from the server. A `parseFloat` near a money field is a review blocker.
- Buttons disable while `isPending`; forms guard unsaved-changes navigation only on surfaces where loss costs real work (payroll config, long forms) — not on two-field dialogs.

## 5. Wire types and API functions

- `features/<ns>/types/` mirrors OpenAPI shapes hand-written (no cross-repo codegen in V1 — A-011: OpenAPI is the contract; generation may be adopted later, additively). Field names mirror the wire exactly.
- **No runtime validation of API responses.** The envelope interceptor types the unwrap; the backend's contract tests + Swagger review gate (api-standards §12) own correctness. Zod validates user input, not our own server's output.
- API functions in `features/<ns>/api/` are thin: typed params in, typed `data` out, zero branching (the interceptor already unwrapped/threw). Anything smarter than parameter mapping belongs in a hook or the backend.
- **Open wire enums render with a total map + fallback** — mirror of the mobile unknown-enum rule: unknown status → neutral `StatusChip` (design-system §2.3) + Sentry breadcrumb, never a crash or blank cell.

## 6. Client state

- Server state = React Query; grid/filter state = URL params (admin-nextjs §7); everything else starts as `useState` in the owning component. `useReducer` when transitions outgrow booleans.
- **No global client-state library** (admin-nextjs §1 — deviation requires a documented edit there first). React context is for cross-cutting providers only — session/permissions, theme, locale, toast — registered in the root layout; a feature creating its own context for what props can carry is a review blocker.
- State lives at the lowest component that needs it; lifting happens when sharing appears, not before.

## 7. Error handling

- `ApiError` is the only error feature code handles; branch on `error.code` constants — `error.status`/HTTP checks and message string-matching are banned (ADR-0006 rule 4). UI text via `t('errors.<CODE>')` with generic fallback + `requestId` surfaced (admin-nextjs §6).
- Route-group `error.tsx` boundaries catch render-time and rethrown unexpected errors: generic panel + `requestId` + reset button — never a blank screen. Expected business failures never reach a boundary; they render in place (form errors, inline panels, toasts).
- Toast rules: success toasts for fire-and-forget mutations; errors prefer the nearest inline surface (form field > panel > toast) — a toast is the last resort, not the default. Never swallow: `catch` without rethrow/handling is a review blocker.

## 8. Styling — Tailwind + shadcn

- Tokens only: colors/spacing/type through the design-system CSS variables and Tailwind theme — raw hex/arbitrary color values in feature code fail lint (design-system §13). Arbitrary values (`w-[347px]`) are a smell outside genuinely one-off layout math.
- Class composition via `cn()` (`lib/utils`); variant components via `cva` (ships with shadcn) — no template-string class concatenation, no `style=` props except dynamic values CSS can't express (chart geometry).
- `components/ui/` (generated shadcn) is never hand-edited (admin-nextjs §9); customization wraps. Class order is enforced by `prettier-plugin-tailwindcss` — humans never review class order.
- Dark + light are both first-class: features use semantic tokens (`bg-surface`, `text-muted-foreground`), never `dark:` overrides in feature code — the token layer owns theming (design-system §2).

## 9. Testing conventions

Pyramid per spec §5.15; numeric targets live in testing-strategy.md. Stack (A-015): **Vitest + React Testing Library + MSW + Playwright**. Structure: tests colocated `*.test.ts(x)` next to source; shared builders in `src/test/builders/` (`aLeaveRequest(overrides)`), MSW envelope helpers in `src/test/msw/` (`ok(data)`, `apiError(code, details)` — ADR-0007 shapes written once).

| Layer | What | How |
|---|---|---|
| Unit — lib + schemas | `lib/` utils, Zod schemas (incl. `zDecimalString` edges), key factories | Vitest, no DOM |
| Hooks | Query/mutation hooks: unwrap, error typing, invalidation | `renderHook` + QueryClient wrapper (retry off) + **MSW** — mock the network, never Axios internals |
| Components | Feature components, permission-gated rendering | RTL + user-event; providers via one `renderWithApp` helper (QueryClient, `PermissionProvider` with explicit permission list, real `id` messages); query by role/label, never class names |
| Forms | Zod messages, server `VAL_` mapping | RTL: fill → submit → assert field errors; MSW returns the 422 envelope, assert `applyServerErrors` landed on the field |
| E2E | **Journey list is fixed by `docs/07-operations/testing-strategy.md` §8.1 — E1–E6, closed and enforced by filename.** The four this row originally named are E1–E4; E5 (approval decision) and E6 (payroll run → payslip) were added 2026-08-04 | Playwright against staging-shaped mock API (critical paths only — thin tier). Because the API is mocked, E5/E6 prove the **UI journey**; their substantive assertions live in the backend e2e tier, and the two meet only in the staging smoke suite (testing-strategy §9) |

Rules: assert on **error codes, i18n keys, and roles/labels** — never on translated human strings or Tailwind classes; MSW is the only API fake (interceptor chain stays under test); no whole-page snapshot tests (they rot — targeted assertions only); every bug fix lands with the regression test that would have caught it.

## 10. Enforcement (CI)

| Check | Tool |
|---|---|
| Types strict | `tsc --noEmit` |
| Feature isolation, no raw axios/fetch in components, `'use server'` whitelist, no RSC API calls (admin-nextjs §12) | ESLint boundaries + restricted-syntax |
| No raw colors / no TS `enum` / no `parseFloat` on money paths | ESLint restrictions + review checklist (design-system §13) |
| Format + Tailwind class order | Prettier + `prettier-plugin-tailwindcss` (`--check`) |
| i18n completeness (id + en), no literal JSX user-facing strings | next-intl check (D12) |
| Env schema (`NEXT_PUBLIC_` rules, naming §12) | build-time schema check |
| Unit/hook/component tests + E2E | Vitest gate; Playwright on protected branches |
