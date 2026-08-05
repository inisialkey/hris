# Design System

Status: **Active — approved by user 2026-08-02** (§5.12 checkpoint passed) · Source: `docs/00-overview/product-overview.md`, spec §5.12 · Related: `docs/02-architecture/mobile-flutter.md`, `docs/02-architecture/admin-nextjs.md`, `docs/02-architecture/offline-sync.md` §8 · Authored with both design skills in the loop (§1); **this document binds — skill output that conflicts with it or with `HANDBOOK_SPEC.md` §5 is rejected** (CLAUDE.md).

Scope: design tokens, typography, spacing, elevation, iconography, dark/light, motion, WCAG 2.1 AA rules, and component-kit conventions for both apps. Implementation idioms live in the coding-standards docs; per-screen flows live in module docs §6 (UI Flow) and must cite these tokens.

## 1. Skill-loop record (spec §5.12 reconciliation)

| Input | Recommended | Kept / overridden |
|---|---|---|
| `ui-ux-pro-max` (Flutter app) | Slate/navy neutrals + professional blue accent (#0F172A/#0369A1), Inter, minimal style, subtle motion (300–400 ms fades), standard density, M3 `ColorScheme` + `darkTheme`, anti-patterns: playful design, AI purple/pink gradients, emoji-as-icons | **Kept:** palette family, Inter, minimal + subtle motion, M3 theming route, all anti-patterns. **Overridden:** its landing-page "pattern" block and oversized-display styling (this is an in-app product, not marketing); motion durations tightened to 150–250 ms (enterprise tool, §7) |
| `ui-ux-pro-max` icon DB | Phosphor primary / Heroicons fallback | **Overridden per platform:** Material Symbols on Flutter (M3-native), Lucide on web (ships with shadcn/ui). Its underlying rule — one style, one weight, no emoji — kept |
| `frontend-design` (admin app) | Deliberate token system; avoid template defaults (cream+serif+terracotta, near-black+acid-green, broadsheet); structure must encode information; copy is design material; one signature device, restraint elsewhere | **Kept:** token discipline, anti-default stance, microcopy rules (§11), one functional signature per app (§12). **Constrained:** aesthetic risk budget is spent inside the enterprise frame — shadcn/ui + inspiration set (Stripe/Linear/Notion/Vercel/Talenta) win over novelty |

Both skills converged on the same family (slate neutrals, one professional blue, Inter, restraint) — adopted as the shared brand core below.

## 2. Color tokens

One brand hue across both apps; two densities. Tokens are the only sanctioned color source — raw hex in component code is a review blocker on both stacks (Tailwind theme / `ThemeData` only).

### 2.1 Brand + neutrals (light)

| Token | Hex | Use |
|---|---|---|
| `primary-600` | `#0369A1` | Primary actions, links, active nav, focus ring base |
| `primary-700` | `#075985` | Hover/pressed on primary |
| `primary-50` | `#F0F9FF` | Selected rows, subtle emphasis surfaces |
| `bg` | `#F8FAFC` | App background |
| `surface` | `#FFFFFF` | Cards, sheets, table body |
| `muted` | `#F1F5F9` | Table header, wells, disabled fills |
| `border` | `#E2E8F0` | Hairlines, input borders |
| `text` | `#0F172A` | Primary text (≥ 12.6:1 on `surface`) |
| `text-secondary` | `#475569` | Labels, captions (7.5:1) |
| `text-disabled` | `#94A3B8` | Disabled only — never for content |
| `destructive-600` | `#DC2626` | Destructive actions, error text |

### 2.2 Dark mode

Dark is a first-class theme on both apps (admin defaults **light** — office context; mobile follows the **system** setting). Elevation in dark = lighter surface, never heavier shadow.

| Token | Hex |
|---|---|
| `bg` | `#020617` · `surface` `#0F172A` · `surface-2` `#1E293B` · `border` `#293548` |
| `text` | `#E2E8F0` · `text-secondary` `#94A3B8` |
| `primary` | `#38BDF8` (recomputed for dark contrast, not the light token inverted) · pressed `#7DD3FC` |
| Status colors | 300/400-range variants of §2.3 (e.g. pending `#FBBF24`), same pairing rules |

### 2.3 Status vocabulary (domain tokens — shared across both apps)

Request lifecycles are the product's visual language; the mapping is fixed here once, and **status is never conveyed by color alone** (WCAG 1.4.1) — every chip = color + icon + label.

| Status class (examples) | Token | Light fg / bg | Icon idea |
|---|---|---|---|
| Draft (`draft`) | `status-draft` | `#475569` / `#F1F5F9` | pencil |
| Pending / awaiting (`pending`, `syncing`, `in_review`) | `status-pending` | `#B45309` / `#FFFBEB` | clock |
| Approved / success (`approved`, `synced`, `paid`, `active`) | `status-positive` | `#15803D` / `#F0FDF4` | check |
| Rejected / failed (`rejected`, `failed`, `conflict`) | `status-negative` | `#B91C1C` / `#FEF2F2` | x / alert |
| Locked / terminal (`locked`, `closed`, `archived`) | `status-locked` | `#334155` / `#E2E8F0` | lock |
| Info / scheduled (`scheduled`, `published`) | `status-info` | `#075985` / `#F0F9FF` | calendar / info |
| **Unsynced (mobile-only overlay)** | `status-unsynced` | `#B45309` outline chip | cloud-off |

Module docs map each entity status to one class in their §6 — new classes require editing this table first.

All fg/bg pairs above meet ≥ 4.5:1; do not lighten foregrounds below these values.

## 3. Typography

- **One family: Inter** (both apps, bundled — no runtime font fetch on mobile). Weights **400 / 500 / 600** only (300 fails small-size contrast; 700+ reserved for the rare display number). Fallbacks: system UI stacks.
- **Monospace `JetBrains Mono`** for IDs, request numbers, and code-like values only.
- **Money and every numeric column: `tabular-nums`** (Inter feature setting) — amounts must align vertically. This is binding for TanStack columns and Flutter payslip/table widgets.

| Role | Admin (desktop-dense) | Mobile |
|---|---|---|
| Display / page title | 24 / 600 | 22 / 600 |
| Section heading | 18 / 600 | 18 / 600 |
| Body (default) | **14 / 400**, lh 1.5 | **16 / 400**, lh 1.5 |
| Secondary / label | 13 / 500 | 14 / 500 |
| Caption / meta | 12 / 400 — floor; nothing smaller | 12 / 400 — floor |
| Data grid cell | 13–14, tabular-nums | — |
| Big metric (dashboard) | 30 / 600, tabular-nums | 28 / 600 |

Formatting rules (display layer): IDR via `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })` / Dart `NumberFormat.currency(locale: 'id_ID', symbol: 'Rp')` — never hand-rolled separators; negatives use the minus sign + `destructive` color, never parentheses. Dates `d MMM yyyy` in the active locale; times honor the branch-timezone visibility rule (admin-nextjs §9).

## 4. Spacing, layout, radius, elevation

- **4 px base grid** both apps; scale `4 8 12 16 20 24 32 40 48 64`.
- **Admin density:** page gutter 24, card padding 16–20, table row height **40 px** (dense grids are the product; 48 for touch-adjacent rows only), form field vertical rhythm 20.
- **Mobile touch:** minimum target **48×48 dp** with ≥ 8 dp separation (M3/skill rule); list rows ≥ 56 dp; bottom-nav ≤ 5 items; safe-area insets respected everywhere (notch, gesture bar).
- **Admin breakpoints (desktop-first):** optimized 1280–1536; **minimum supported 1024** — below it the sidebar collapses to icons and tables scroll horizontally inside the DataTable container; the page itself never scrolls horizontally. No mobile-web layout in V1 (spec: desktop-first responsive).
- **Radius:** admin `8 px` default (shadcn `--radius: 0.5rem`), 4 px for chips/inputs-in-grids; mobile M3 — 12 px cards/sheets, 8 px buttons/inputs, 24 px bottom-sheet top.
- **Elevation:** admin is **border-first, flat** (Linear/Vercel direction): borders + `shadow-sm` on overlays only (popovers, dialogs). Mobile uses M3 elevation 0–3 (0 flat lists, 1 cards, 2 app bar on scroll, 3 dialogs/sheets); dark mode swaps shadows for surface lightening (§2.2).

## 5. Iconography

| Platform | Set | Sizing | Weight |
|---|---|---|---|
| Admin web | **Lucide** (shadcn-native) | 16 inside dense rows/buttons, 20 default, 24 nav | 1.5–2 px stroke, one weight app-wide |
| Flutter | **Material Symbols, outlined** | 20 dense, 24 default | one optical weight app-wide |

Rules: no emoji as icons, ever (skill checklist); icon-only buttons require a tooltip (web) / semantic label (Flutter) — accessible name mandatory; status icons come from the §2.3 vocabulary; never mix filled and outlined variants in one surface.

## 6. Motion

- Durations: **150 ms** (hover/press/toggle), **200–250 ms** (panel, sheet, page transition), 300 ms ceiling (bottom sheets). Easing: standard ease-out for enter, ease-in for exit; exits faster than entries.
- Motion conveys state change or spatial origin — no decorative scroll-reveal choreography in the admin app (data tool, not a landing page); mobile keeps M3-subtle transitions (skill motion dial 3/10 confirmed).
- `prefers-reduced-motion` (web) / `MediaQuery.disableAnimations` (Flutter) honored: transitions collapse to fades ≤ 100 ms.
- Skeletons over spinners for content loads > 300 ms (skill feedback rule); spinners only for indeterminate actions; button-level loading state on every mutating action (admin-nextjs §7 pairs it with React Query `isPending`).

## 7. Dark/light rules

1. Both themes ship on both apps from day one; every token above has a dark value — components reference tokens, so theme = token swap, no per-component branching.
2. Admin default light, user-toggleable (persisted via the sanctioned theme cookie — admin-nextjs §4); mobile follows system with in-app override.
3. Contrast is re-verified **per theme** (§8) — dark primaries/status colors are recomputed values, not inversions.
4. Charts and status chips must remain distinguishable in both themes without relying on hue alone (pattern/label redundancy — dashboard-analytics inherits this).

## 8. Accessibility — WCAG 2.1 AA (binding checklist)

1. Text contrast ≥ 4.5:1 (≥ 3:1 for ≥ 18.66 px/600); UI component boundaries + focus indicators ≥ 3:1. Both themes.
2. Focus visible always — never `outline: none` without a replacement ring (`primary` 2 px offset ring on web; Material focus/`FocusRing` on Flutter). Full keyboard path on admin: grids (row focus + arrow keys via TanStack), dialogs (trap + restore), menus, date pickers.
3. Touch targets §4; pointer targets on admin ≥ 24 px with spacing.
4. Forms: visible labels always (placeholder is never the label — skill forms rule), error text adjacent to the field (pairs with `applyServerErrors`, admin-nextjs §8), helper text before error text, required marked accessibly.
5. Color never sole carrier (§2.3); charts add labels/patterns.
6. Screen readers: semantic landmarks + table semantics on web; `Semantics` widgets on Flutter for chips, punch button, sync states; announcements for async outcomes (approve/reject results, sync banner changes) via live regions / `SemanticsService.announce`.
7. Language attributes follow the active locale (`id`/`en`) so assistive tech switches voices correctly.
8. Zoom: admin remains functional at 200% browser zoom (no clipped fixed containers); mobile honors OS font scaling up to 1.3× without truncating money values — amounts may wrap, never ellipsize.

## 9. Component conventions — admin (shadcn/ui)

- `components/ui/` = generated primitives, untouched (admin-nextjs §9); tokens land in Tailwind theme + CSS variables consumed by shadcn.
- **DataTable** (the wrapper, admin-nextjs §9) additionally binds: 40 px rows, sticky header, `tabular-nums` right-aligned numeric/money columns, status chips from §2.3, row hover + selected (`primary-50`) states, column-header sort affordance, error state showing `requestId`, empty state with one primary action.
- Forms: RHF + Zod per admin-nextjs §8; layout = label above field, 20 px rhythm, destructive confirmation dialogs for irreversible verbs (`lock`, `close`, `revoke` — the api-standards verb set drives which actions get confirms).
- Toasts: outcome feedback only (success/transport errors); validation lands at fields, never as toast (admin-nextjs §8).
- Money display: §3 formatting; totals rows 600 weight; variances/negatives in `destructive-600`.

## 10. Component conventions — Flutter kit (`core/theme` + shared widgets)

Tokens → `ThemeData` via M3 `ColorScheme` (light + dark) with the §2 values (`ColorScheme.fromSeed` is not used — seeds drift from the fixed palette; explicit scheme instead). Named kit (implementation in coding-standards-flutter.md; widgets live under `core/` or the design-system package folder):

| Widget | Binds |
|---|---|
| `AppButton` (primary/secondary/destructive/text) | §2 colors, 48 dp min, loading state built-in |
| `AppTextField` | visible label, helper/error slots, §8.4 rules |
| `StatusChip` | §2.3 vocabulary — takes a status class, renders color+icon+label |
| `SyncChip` / `SyncBanner` | offline-sync §8 states: unsynced chip on rows, escalation banner, "synced Xm ago" passive line |
| `AppCard`, `AppListTile` | radius/elevation §4, 56 dp rows |
| `EmptyState`, `ErrorState` | error shows `errors.<CODE>` text + `requestId`; empty offers the next action |
| `SkeletonBox` | §6 loading rule |
| `MoneyText` | tabular-nums, id-ID formatting, never scales below readable size (§8.8) |

Screens compose kit widgets; a feature widget hand-rolling one of these is a review blocker (same posture as the DataTable rule).

## 11. Microcopy (both apps)

Sentence case everywhere (buttons included). Active verbs naming the outcome: "Ajukan cuti" / "Submit leave request", never "Submit"/"OK" alone; the verb stays identical through its flow (button → confirmation → toast). Errors state what happened + what to do next, in interface voice — no apologies, no blame, no raw server text (ADR-0006: `errors.<CODE>` i18n only). Empty states = invitation to act, one primary action. Bahasa Indonesia is the default register — plain, respectful (formal "Anda" register), no slang; English mirrors it. Domain terms come from `CONTEXT.md` — UI copy never invents synonyms (a punch is "presensi", consistently).

## 12. Signature devices (one per app, functional)

- **Admin — the scope bar:** a persistent context strip under the header on every scoped surface: company selector (when multi-company), payroll period / attendance period, and lock badge when the period is locked. It encodes the tenant→company→period reality every admin action depends on — always visible, never buried in filters. Module UI Flows reference it instead of re-inventing period pickers.
- **Mobile — sync truth line:** the app-wide sync status language (§10 `SyncChip`/`SyncBanner` + "Synced Xm ago") as a single consistent system — the offline-first promise made visible. No screen invents its own offline indicator.

Everything else stays quiet — restraint is the style (both skills, converged).

## 13. Enforcement

| Rule | Gate |
|---|---|
| No raw hex/color literals in components (Tailwind theme / `ThemeData` only) | ESLint + custom lint / `dart analyze` rule |
| Status rendering only via `StatusChip`/chip component bound to §2.3 | review checklist |
| Contrast pairs of §2 verified per theme | tooling check in CI (token file → contrast script) |
| Icon sets locked (§5); no emoji icons | review checklist |
| Reduced-motion + focus-visible present | `docs/07-operations/testing-strategy.md` §11 — a `prefers-reduced-motion: reduce` Playwright project asserting §6's ≤100 ms fade, plus keyboard traversal of every E2E journey; Flutter via `MediaQuery.disableAnimations` widget tests and `Semantics` assertions on the kit widgets §8 item 6 names. Contrast stays on the row above — testing it twice is a second implementation of the same check |
| Module UI Flow sections cite tokens/components by name, no new visual language | module DoD (holiday.md template) |
