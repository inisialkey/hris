# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary.
- **`docs/adr/`** — read the ADRs that touch the area you're about to work in. Status `Accepted` overrides `Proposed`.

Layout is **single-context**: one `CONTEXT.md` and one `docs/adr/` at the repo root. There is no `CONTEXT-MAP.md`.

## When an anchor document doesn't exist yet

This repo generates its handbook file by file, so an anchor document is often simply *not written yet* rather than missing by accident.

`HANDBOOK_SPEC.md` and `CLAUDE.md` govern when `CONTEXT.md` and ADRs get created — this file does not. Follow them:

- Check `PROGRESS.md` first to see whether the document has been generated.
- A not-yet-written anchor is **not** licence to invent its contents. Use the decision hierarchy in `CLAUDE.md`: a minor gap is decided by best practice and logged in `ASSUMPTIONS.md`; an architectural gap gets an ADR with status **Proposed**, flagged for user review in the task report.
- Never bulk-create anchor documents to unblock yourself. One large file (or at most three small ADRs) per task.

## File structure

```
/
├── CONTEXT.md                  ← domain glossary
├── HANDBOOK_SPEC.md            ← authoritative specification
├── PROGRESS.md                 ← generation state; read at session start
├── ASSUMPTIONS.md              ← logged minor decisions
└── docs/
    ├── adr/                    ← architectural decisions
    ├── 03-standards/           ← naming-conventions, error-catalog, design-system
    ├── 04-database/            ← database-conventions, core-schema
    └── 06-modules/             ← business modules (holiday.md is the template)
```

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

Indonesian regulatory terms stay in Indonesian (PPh 21, BPJS, THR, PKWT, PKWTT, cuti) — see the writing standards in `CLAUDE.md`.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider), or there's a real gap. Real gaps get appended to `CONTEXT.md` in the same session that introduces them.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

Changing a decision means superseding its ADR first, then updating dependent documents, then recording the change in `PROGRESS.md`. Never contradict an anchor document in place.
