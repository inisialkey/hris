# Implementation `CLAUDE.md` Template

Status: Active (Phase 4) · Source: `HANDBOOK_SPEC.md` §14 · Depends on: `docs/08-ai-guide/ai-development-guide.md` (the protocols; this file only gates on them), `docs/adr/ADR-0025-handbook-distribution-and-deviation-path.md` (submodule, namespace, contract authority) · Checked by: `scripts/guide-check.mjs`

## 1. What this is

Three ready-to-use `CLAUDE.md` files — one per implementation repository — plus the small bootstrap each one assumes. Copy the block for your repository verbatim to its root. Nothing here needs assembling, editing, or filling in.

**These files are deliberately thin.** `ADR-0025` mounts the handbook as a pinned submodule at `docs/handbook/`, so every rule, protocol and convention is already readable from inside the repository. A `CLAUDE.md` that restated any of it would be a mutable copy in three places of something the submodule holds immutably in one — which is the failure `ADR-0025` exists to prevent. What is left is only what must be true **before** any handbook read happens: which repository this is, the mandatory read, and the stack prohibitions an agent can violate in its first file.

> **Two files will be named `CLAUDE.md` in every implementation repository.**
> The one at the repository root — from this document — instructs an implementer.
> `docs/handbook/CLAUDE.md` instructs a *handbook author*: it says to read `PROGRESS.md`, to generate one large file per task, and never to bulk-generate the handbook. **None of that applies to writing product code.** Each block below carries this warning inline, because it is the only place a reader will think to look after noticing two files with the same name.

## 2. Bootstrap

Run once, at repository creation, before the `CLAUDE.md` is of any use:

```bash
git submodule add git@github.com:<org>/hris-handbook.git docs/handbook
git -C docs/handbook checkout <sha>          # pin explicitly; never track a branch
git add .gitmodules docs/handbook && git commit -m "chore: pin handbook"
```

CI must check out submodules — `actions/checkout` with `submodules: true`. Gate **C11** (`ci-cd.md` §5) asserts `docs/handbook/HANDBOOK_SPEC.md` exists, because an uninitialised submodule fails **silently**: the `@`-import below resolves to nothing and the session looks entirely normal.

Then place `docs/agents/domain.md` (§6) and install the two design skills — **`ui-ux-pro-max` in `hris-mobile` only, `frontend-design` in `hris-admin` only.** `hris-api` installs neither. That split is not a preference; applying either skill's stack and palette guidance to the other platform contradicts `design-system.md`, which binds both.

### 2.1 On `@`-import

Each block opens with `@docs/handbook/docs/08-ai-guide/ai-development-guide.md`. In **Claude Code** this loads the guide into context at session start, which turns the reading protocol from an instruction an agent may skip into a fact it already has. An agent whose tooling does not implement `@`-imports gets the prose line immediately below it and must follow it manually — so the line is written to stand alone, not as a caption for the import.

---

## 3. `hris-api/CLAUDE.md`

```markdown
# CLAUDE.md — hris-api

Backend for HRIS, a multi-tenant Indonesian HRIS SaaS. NestJS modular monolith.

## The handbook is the specification

@docs/handbook/docs/08-ai-guide/ai-development-guide.md

**Before writing code, follow the reading protocol in
`docs/handbook/docs/08-ai-guide/ai-development-guide.md` §2. It is not optional.**
If `docs/handbook/` is empty the submodule is not initialised — run
`git submodule update --init` and stop until it resolves. Work done without the
anchors is wrong in ways review does not catch.

`docs/handbook/CLAUDE.md` is **not** for you. It instructs handbook authors and
tells them to read `PROGRESS.md` and generate one document per task. Ignore it.

## This repository

NestJS modular monolith, one deployable, three entrypoints (`api` / `worker` /
`both` via `APP_ROLE`). Clean Architecture, DDD-inspired. Drizzle ORM, PostgreSQL
with `tenant_id` row-level isolation, Redis, BullMQ, Swagger, JWT + refresh token.

**Prohibited: Prisma, TypeORM, MikroORM, raw SQL outside a repository, CQRS
without a justifying ADR.** Fixed frame: `docs/handbook/docs/02-architecture/backend-nestjs.md` §1.
Enforced by CI gate C12.

## Deviating

Never silently. The handbook is authoritative for contracts — permission keys,
business rules, schema, API shapes, validation, error codes, jobs and events.
It is silent on implementation, and an implementation choice is not a deviation.

A contract you must contradict becomes an ADR in `docs/handbook/docs/adr/`
(the submodule is a full clone — write in it), a pull request on `hris-handbook`,
and a `// ADR-nnnn (Proposed, PR #n)` marker on every dependent line. Implement
against it; do not wait. Full protocol: `ai-development-guide.md` §3.

**Never type a regulatory number** — no tax rate, BPJS cap, or overtime
multiplier, in code, migrations, fixtures or comments. `ai-development-guide.md` §5.

<!-- handbook-managed: do not edit above this line -->
<!-- Repo-local tooling below: dev setup, scripts, editor conventions.        -->
<!-- Anything about the product goes upstream as a handbook PR (§7).          -->
```

---

## 4. `hris-admin/CLAUDE.md`

```markdown
# CLAUDE.md — hris-admin

Admin web for HRIS, a multi-tenant Indonesian HRIS SaaS. Next.js App Router.

## The handbook is the specification

@docs/handbook/docs/08-ai-guide/ai-development-guide.md

**Before writing code, follow the reading protocol in
`docs/handbook/docs/08-ai-guide/ai-development-guide.md` §2. It is not optional.**
If `docs/handbook/` is empty the submodule is not initialised — run
`git submodule update --init` and stop until it resolves. Work done without the
anchors is wrong in ways review does not catch.

`docs/handbook/CLAUDE.md` is **not** for you. It instructs handbook authors and
tells them to read `PROGRESS.md` and generate one document per task. Ignore it.

## This repository

Next.js App Router + TypeScript, feature-based architecture. React Query for
server state, React Hook Form + Zod, Tailwind + shadcn/ui, TanStack Table, Axios
with the interceptor chain. Desktop-first responsive. One app serves tenant
administration and the Super Admin console, separated by route groups.

**Prohibited: Pages Router, a global client-state library (Redux/Zustand/Jotai),
business logic or database access in the Next.js server.** Fixed frame:
`docs/handbook/docs/02-architecture/admin-nextjs.md` §1. Enforced by CI gate C12.

Design skill: **`frontend-design`**. Never apply `ui-ux-pro-max` here — it advises
the Flutter app. `docs/handbook/docs/03-standards/design-system.md` overrides both.

## Deviating

Never silently. The handbook is authoritative for contracts — permission keys,
business rules, schema, API shapes, validation, error codes, jobs and events.
It is silent on implementation, and an implementation choice is not a deviation.

A contract you must contradict becomes an ADR in `docs/handbook/docs/adr/`
(the submodule is a full clone — write in it), a pull request on `hris-handbook`,
and a `// ADR-nnnn (Proposed, PR #n)` marker on every dependent line. Implement
against it; do not wait. Full protocol: `ai-development-guide.md` §3.

**Never type a regulatory number** — no tax rate, BPJS cap, or overtime
multiplier, in code, migrations, fixtures or comments. `ai-development-guide.md` §5.

<!-- handbook-managed: do not edit above this line -->
<!-- Repo-local tooling below: dev setup, scripts, editor conventions.        -->
<!-- Anything about the product goes upstream as a handbook PR (§7).          -->
```

---

## 5. `hris-mobile/CLAUDE.md`

```markdown
# CLAUDE.md — hris-mobile

Employee app for HRIS, a multi-tenant Indonesian HRIS SaaS. Flutter, Android + iOS.

## The handbook is the specification

@docs/handbook/docs/08-ai-guide/ai-development-guide.md

**Before writing code, follow the reading protocol in
`docs/handbook/docs/08-ai-guide/ai-development-guide.md` §2. It is not optional.**
If `docs/handbook/` is empty the submodule is not initialised — run
`git submodule update --init` and stop until it resolves. Work done without the
anchors is wrong in ways review does not catch.

`docs/handbook/CLAUDE.md` is **not** for you. It instructs handbook authors and
tells them to read `PROGRESS.md` and generate one document per task. Ignore it.

## This repository

Flutter, Clean Architecture feature-first. `flutter_bloc` with **Cubit as the
default** — Bloc only where the module doc justifies it in writing. Drift for all
business data with SQLCipher always on. **Offline-first is the architecture, not
a feature:** reads serve from Drift, writes enqueue, the server reconciles.

**Prohibited: Riverpod, Hive, Flutter Web, business data in SharedPreferences**
(trivial app settings only — theme, locale, onboarding flags). Fixed frame:
`docs/handbook/docs/02-architecture/mobile-flutter.md` §1. Enforced by CI gate C12.

Design skill: **`ui-ux-pro-max`**. Never apply `frontend-design` here — it advises
the admin web. `docs/handbook/docs/03-standards/design-system.md` overrides both.

## Deviating

Never silently. The handbook is authoritative for contracts — permission keys,
business rules, schema, API shapes, validation, error codes, jobs and events.
It is silent on implementation, and an implementation choice is not a deviation.

A contract you must contradict becomes an ADR in `docs/handbook/docs/adr/`
(the submodule is a full clone — write in it), a pull request on `hris-handbook`,
and a `// ADR-nnnn (Proposed, PR #n)` marker on every dependent line. Implement
against it; do not wait. Full protocol: `ai-development-guide.md` §3.

**Never type a regulatory number** — no tax rate, BPJS cap, or overtime
multiplier, in code, migrations, fixtures or comments. `ai-development-guide.md` §5.

<!-- handbook-managed: do not edit above this line -->
<!-- Repo-local tooling below: dev setup, scripts, editor conventions.        -->
<!-- Anything about the product goes upstream as a handbook PR (§7).          -->
```

---

## 6. `docs/agents/domain.md` — identical in all three repositories

`ADR-0025` gives implementation repositories no `CONTEXT.md` and no `docs/adr/` of their own, so the `grill-with-docs` and `domain-modeling` skills — which look for both at a repository root — find nothing. This file is the redirect. It is the same mechanism, and the same filename, this handbook repository already uses.

```markdown
# Domain Docs

Where this repository's domain documentation lives, for skills that expect it
at the root.

## Layout

The domain model is **not** in this repository. It lives in the handbook,
mounted as a pinned git submodule (ADR-0025):

- Glossary: `docs/handbook/CONTEXT.md`
- Decisions: `docs/handbook/docs/adr/` — `Accepted` overrides `Proposed`, and a
  `Proposed` ADR still binds new code.

There is no root `CONTEXT.md`, no root `docs/adr/`, and no `CONTEXT-MAP.md`.
Single context, one namespace, held upstream. Do not create local copies — two
numbering schemes would make `ADR-0002` name two different decisions depending
on which repository you are standing in.

## Vocabulary

When your output names a domain concept — an issue title, a test name, a
hypothesis, a variable — use the term as `docs/handbook/CONTEXT.md` defines it.
Indonesian regulatory terms stay in Indonesian: PPh 21, BPJS, THR, PKWT, PKWTT,
cuti.

A concept missing from the glossary is a signal: either you are inventing
language the project does not use, or there is a real gap. Real gaps are
appended upstream in the same pull request that introduces them.

## Contradicting a decision

Surface it, never override it in place. Say which ADR you contradict and why,
then follow `docs/handbook/docs/08-ai-guide/ai-development-guide.md` §3 — an ADR
written inside the submodule clone, a pull request on `hris-handbook`, and a
marker on every dependent line. Changing an `Accepted` decision is a supersession
and a human's call; stop and ask.
```

## 7. Below the marker

Everything above `<!-- handbook-managed: do not edit above this line -->` is compared against this document by CI (§8). Below it, one rule:

**Repo-local tooling belongs there. Anything about the product goes upstream.**

| Belongs below the marker | Goes upstream as a handbook PR |
|---|---|
| `pnpm db:up` before integration tests | A naming rule, a validation rule, an error code |
| Which emulator the golden tests assume | Any API shape, permission key, or business rule |
| Local `.env` bootstrap, editor settings | A convention other repositories would also need |
| A repo-specific script and what it does | Anything contradicting or extending a module document |

This is `ADR-0025` §3's contract-versus-implementation split applied one layer up. A `CLAUDE.md` rule about the product is contract-class: it will duplicate or contradict the handbook, and an agent reading both has no way to tell which wins. A rule about how to run this repository was never the handbook's to hold.

## 8. Drift

Three copies of a file that the handbook keeps moving under. Every way it rots is silent — an edit drops the `@`-import, a section number changes, a prohibition is loosened — and the symptom is an agent that quietly stops reading the protocol.

**Gate `C13`** (`ci-cd.md` §5) compares handbook-managed regions against their handbook source, over a manifest of pairs:

| Local path | Handbook source |
|---|---|
| `CLAUDE.md` (above the marker) | this document, §3 / §4 / §5 for that repository |
| `docs/agents/domain.md` | this document, §6 |
| `shared/result.ts` · `src/lib/result.ts` · `core/result.dart` | `ADR-0006`'s canonical block, above its own marker |

One gate, one manifest, local additions permitted below each marker. The comparison target is on disk already — `C11` guarantees the submodule is mounted — so this is a diff, not a fetch.

`scripts/guide-check.mjs` checks the other direction, inside the handbook: `G8`–`G10` assert that the three blocks exist, that each names a real stack and carries the `@`-import path, that the lines they are supposed to share are byte-identical, and that every path they cite resolves. Three near-identical blocks in one document drift as readily as three files in three repositories; the only difference is that here a check can see it.

## 9. Maintenance

- **Adding a rule here is almost always the wrong move.** The test: does an agent need this *before* it has read anything? If not — and it usually is not — it belongs in the handbook, where the guide already points at it and no copy exists.
- **A section number cited in a block is a dependency.** Renumbering `ai-development-guide.md` breaks three repositories silently; `G9` catches it here first.
- **The three blocks are meant to be near-identical.** Where they differ — repository name, stack paragraph, prohibitions, design skill — the difference is deliberate and `G10` pins the rest. A change that lands in one block and not the others is a defect unless it is one of those four.
- **The bootstrap in §2 is versioned by nothing.** If `actions/checkout` or git submodule ergonomics change, this section is the last place anyone will think to look — `C11` is what actually catches the consequence.
