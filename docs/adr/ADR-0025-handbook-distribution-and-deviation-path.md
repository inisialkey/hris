# ADR-0025: Handbook Distribution, ADR Namespace, and Contract Authority

Status: **Proposed** · Date: 2026-08-05 · Deciders: engineering (surfaced during `docs/08-ai-guide/ai-development-guide.md` grilling)

## Context

`HANDBOOK_SPEC.md` §14 requires the AI development guide to define *"how an AI should traverse the handbook before coding a feature"* and *"how to propose deviations"*. Both are unwritable until three things are decided, and no document decides any of them.

**How does an implementation repository reach the handbook?** A-006 fixes three repositories — `hris-api`, `hris-admin`, `hris-mobile` — and the handbook is a fourth. A traversal protocol is fiction if the 80 files are not readable from inside the repository being worked in, and it is worse than fiction for a cloud agent handed one repository and nothing else. The handbook already assumes access without providing it: `ADR-0018` decision 7 and ci-cd **C8** vendor `docs/07-operations/test-vectors/holiday-resolution.json` into two repositories with a `sha256` equality check *"against the handbook original"* — a path nothing defines.

**Where does a deviation get recorded?** `CLAUDE.md`'s decision hierarchy sends a minor gap to `ASSUMPTIONS.md` and an architectural gap to a `Proposed` ADR. Both files live in the handbook. An agent working in `hris-api` cannot write to them without a mechanism, and `ADR-0006` already commissions the guide to enforce a rule *across* that boundary — the three vendored `Result` copies *"are kept identical by this ADR + the AI development guide"*.

**When code and the handbook disagree, which is wrong?** Unstated anywhere. Left unstated, one of two failures is certain: either every internal refactor owes an upstream change and nobody complies, or the handbook silently becomes fiction and the traversal protocol starts instructing agents to trust a stale document.

## Decision

### 1. The handbook is a pinned git submodule at `docs/handbook/`

Each implementation repository mounts `hris-handbook` at `docs/handbook/`, pinned to a SHA. Git is the drift mechanism: there is no sync script, no per-file hash list, and no bot. Bumping the pin is an explicit, reviewable commit, which means an agent reads the handbook revision the code was actually written against rather than whatever was last pulled.

Two consequences follow immediately:

- **C8 is retired and `ADR-0018` decision 7 is amended.** The holiday test vector is no longer vendored-plus-hashed; it is read in place at `docs/handbook/docs/07-operations/test-vectors/holiday-resolution.json`. Vendoring plus an equality check is a hand-built substitute for what a submodule pin already guarantees.
- **`Result` stays vendored.** It is compiled code in two languages, not a data file, so it cannot be read from the submodule at runtime. Its drift check survives (this ADR's §4, gate 5).

Submodules go missing on shallow or non-recursive clones, which is a real risk when the consumer is an agent in a fresh sandbox. Mitigated by `actions/checkout` with `submodules: true` and a CI gate asserting `docs/handbook/HANDBOOK_SPEC.md` exists, so the failure is loud rather than an agent reasoning confidently without anchors.

### 2. One ADR namespace, and it lives in the handbook

Implementation repositories have **no `docs/adr/` and no `CONTEXT.md` of their own**. `ADR-0002` names one decision regardless of which repository you are standing in.

`docs/handbook/` is a full clone, not an export, so the deviation path needs no new machinery:

1. The agent writes `docs/adr/ADR-nnnn-….md` (or an `ASSUMPTIONS.md` row) **inside the submodule working tree**.
2. Commits on a branch, pushes, opens a pull request on `hris-handbook`. **Pull request only — never a direct push.** `hris-handbook` carries branch protection like the other three; an agent with push rights to the source of truth is one bad loop from rewriting the anchors. *(Applied 2026-08-05 and verified by attempting a rejected push, not by reading the API back. `enforce_admins` is on, which is what makes this clause true against the threat it names — the agent in question holds the maintainer's admin token, so an admin bypass would leave the protection decorative. "Like the other three" is literal and includes the branching model: `ADR-0019` §1 and naming-conventions §12 govern this repository too, which a brief and reverted excursion into gitflow established the hard way — issue #1, A-180.)*
3. **Implements against the proposed decision without waiting**, marking every dependent line `// ADR-nnnn (Proposed, PR #n)`. If the pull request is rejected, that marker is the grep that finds everything to revert.
4. The submodule pin bumps when the pull request merges. **The pin bump is the ratification record.**

The `grill-with-docs` skills expect `CONTEXT.md` and `docs/adr/` at a repository root and will not find them under `docs/handbook/`. Each implementation repository therefore ships `docs/agents/domain.md` pointing at the submodule — the same redirect this repository already uses for the same purpose.

### 3. The handbook is authoritative for contracts and silent on implementation

**Contract** — module document §2 permission keys, §3 `BR-*`, §4 domain model and Drizzle schema, §7 API, §8 validation rules, §11 error codes, §12 jobs and events. Code contradicting a contract row is a **defect**, and the fix is a handbook pull request whichever side turns out to be wrong.

**Not a contract** — class layout, file organisation, helper shape, internal naming, anything describing *how*. The handbook never made a claim there, so a difference is not drift and is recorded nowhere.

This is the line the documents already draw: every one of those seven sections is a contract, and nothing in a module document describes an internal. It is also the same line §2 draws — a contract change is exactly the class that deserves an upstream pull request, and an internal never was.

### 4. Contract drift is checked where checking is cheap

| Contract | Mechanism |
|---|---|
| Error codes | Already built — `coding-standards-nestjs.md` §10's catalog-completeness check now reads the handbook directly instead of a copy |
| Permission keys | `@RequirePermission` is already statically scanned by route lint (`backend-nestjs.md` §5); extend the scan to compare against the handbook's §2 matrices |
| Drizzle schema | `scripts/erd-check.mjs` already parses `pgTable` blocks out of markdown, and the handbook's blocks *are* Drizzle TypeScript; the same parser pointed at `hris-api/**/*.schema.ts` compares declared against implemented |
| API surface | **Not checked.** Swagger emits machine-readable OpenAPI; module-document §7 is prose. Comparing them is real work for weak returns, and the gap is stated rather than papered over |

Three gates land in each implementation repository's `ci-cd.md` §5 row set: banned dependencies, handbook-present, and **handbook-managed regions**. *(The third was written here as "`Result` triplication" and generalised in place 2026-08-05, `implementation-claude-md-template.md` — a widening of the same mechanism to a manifest of (local path, handbook source) pairs, not a reversal, so no supersession. `CLAUDE.md` and `docs/agents/domain.md` are copied into three repositories by that template and rot exactly as `Result` does; checking them with a second mechanism invented one session later would have been the asymmetry.)*

## Alternatives considered

- **Sibling checkout — clone `hris-handbook` next to the repository.** Rejected: nothing guarantees presence or currency, CI cannot see it, and an agent handed one repository has nothing. It fails the exact consumer the guide exists for.
- **Vendor the whole handbook into all three repositories.** Rejected: 23,000 lines triplicated, a sync job, and 80 hash checks to reproduce what one submodule pin already gives.
- **Vendor a per-repository slice.** Rejected: the slice manifest is a hand-assembled second copy of the dependency facts, which is the artifact class `erd-overview.md`'s regrilling was spent deleting.
- **Two ADR namespaces, prefixed per repository.** Rejected: the agent is unblocked instantly and permanently confused. Skills reading the local set see 0 of the 24 system decisions, so the failure mode is an agent confidently deciding something `ADR-0002` settled.
- **Pointer files at each repository root.** Rejected: two files whose only job is to be correct about a path, and it violates the `domain-modeling` rule that `CONTEXT.md` is a glossary and nothing else.
- **Handbook always wins; any divergence is a code defect.** Rejected: re-blocks the agent this ADR deliberately unblocks — a `409` discovered while coding would wait on an upstream merge.
- **Code wins once shipped; the handbook becomes an archive.** Rejected: deletes the value of the traversal protocol and of every module document.
- **A staleness marker per module document** (*"last verified against `hris-api@sha`"*). Rejected: a hand-maintained fact that is wrong the day after it is written.

## Tradeoffs

Submodules are the most-disliked feature in git, and the cost is real: an agent or a CI job that forgets `--recursive` gets an empty directory. Bought with one `submodules: true` line and one presence gate, against a sync mechanism that would need building, running, and trusting.

A single namespace means an implementation-local decision travels upstream to be numbered, which is ceremony for a small choice. Accepted because almost no decision in a repository governed by a 23,000-line handbook is genuinely local — and §3 removes the common case entirely by declaring implementation details unrecorded rather than upstreamed.

Proceeding under a `Proposed` ADR means code can exist for a decision that is later rejected. Bounded by the mandatory marker: the revert set is a grep, not an investigation.

## Consequences

- `ADR-0018` decision 7 is amended in place: the holiday vector is read from the submodule, not vendored. ci-cd §5 loses **C8** and gains three gates.
- `ADR-0006`'s claim that the guide checks `Result` triplication acquires a mechanism (gate 5) rather than remaining an assertion.
- `hris-handbook` becomes a protected repository with pull requests, review, and — for the first time — inbound contributions from agents rather than only from handbook sessions.
- The handbook gains a second executable artifact, `scripts/guide-check.mjs` (A-174 amended).
- Each implementation repository ships `docs/agents/domain.md` redirecting the domain skills into `docs/handbook/` — written verbatim in `implementation-claude-md-template.md` §6 and kept current by C13.

## Future considerations

The schema comparison in §4 is the highest-value unbuilt check and it is nearly free — `erd-check.mjs`'s parser already handles the syntax. It should be built the week `hris-api` has its first migration. The OpenAPI-versus-§7 comparison stays unbuilt until module-document §7 is machine-readable, which is a change to the module template and therefore a separate decision. If handbook pull-request volume from agents becomes material, the `Proposed`-and-proceed rule is the first thing to revisit — it is calibrated for a small team where a proposal is read within a day.
