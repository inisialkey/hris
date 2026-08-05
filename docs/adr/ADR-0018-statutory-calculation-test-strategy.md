# ADR-0018: Statutory Calculation Test Strategy

Status: **Proposed** (grilled 2026-08-04 during `docs/07-operations/testing-strategy.md`; awaiting user review) · Date: 2026-08-04 · Deciders: product owner + engineering

## Context

Four modules are arithmetic engines whose output is the product itself: `payroll.md`, `tax-pph21.md`, `bpjs.md`, and `overtime.md`. Their correctness is not a quality attribute — a wrong figure is a wrong payslip, a wrong 1721-A1, and a wrong statutory remittance.

Five module documents already promise "golden vectors" as the mechanism — holiday §4 and §14, shift §4, leave §14, overtime §14, attendance §14 — and no artifact was ever defined: not a format, not a location, not a rule about what happens when one fails.

Two facts make the obvious implementation wrong.

**First, the rates in the test database are not verified.** `CLAUDE.md` forbids inventing regulatory numbers and requires every regulation-dependent value to carry `⚠️ VERIFY`. BR-TAX-001, BR-BPJS-001, and BR-OVT-009 all make the statutory parameters **platform data seeded by migration**, so a Testcontainers database applies exactly those unconfirmed values. Any vector computed against them encodes an unconfirmed number as an expectation.

**Second, a passing test reads as a claim.** A test suite named for PPh 21 that passes is, to every reader, evidence the PPh 21 calculation is right. If its expected values were derived from the same unverified table the code reads, it is evidence of nothing except internal consistency — and it will keep passing after the regulation is confirmed and the rate turns out to be different, because both sides moved together. That failure is silent, permanent, and lands in a compliance conversation.

The naive alternatives both fail. Typing plausible published rates into fixtures invents regulatory numbers into an executable artifact, which is worse than doing it in prose because a test asserts. Writing no calculator tests until the rates are verified leaves the engines unprotected for the entire build.

## Decision

### 1. Golden vectors are a first-class artifact with a defined format

One JSON file per calculator. Every vector carries `input`, `expected`, and a `source` field naming the regulation article or worked example it came from. The file declares which rate set it was computed against.

Vectors are the acceptance artifact a domain expert reviews **without reading TypeScript**, which is the only realistic path to a payroll engine checked by someone who knows payroll.

### 2. A vector is never edited to make a test pass

A failing vector is a **code defect** until a human re-verifies the vector against the regulation and records why it changed. Either the calculator changes, or the vector changes with a recorded re-verification.

The vector file's git history therefore becomes the audit trail of every statutory reinterpretation the product has ever made — which is a compliance artifact the codebase would otherwise not produce.

### 3. Structural and statutory vectors are separate files with different lifecycles

**Structural vectors** are rate-independent. They prove the logic that is wrong regardless of any rate: tier boundaries landing on the correct side, proration dividing by the correct denominator, rounding direction and unit, the month-to-date slice combining a THR run with a regular run, the JP age ceiling deriving from birth date rather than a stored flag, employer premiums reaching taxable assembly, the `wage_category` a component lands in, trace completeness. They run and gate every pull request.

**Statutory vectors** use the real published rates and assert real rupiah. Each carries `⚠️ VERIFY` at **vector granularity**. They ship tagged `pending-verification` and skipped.

### 4. Structural vectors run against a deliberately fictional rate set

`structural-fiction-v1` uses values nobody could mistake for real: PTKP `100000000`, TER band boundaries on round millions, JKK `0.0100`, BPJS caps at round numbers, an overtime factor of exactly `2.0` in every tier. The file header states that the rates are fictional and why.

This is the load-bearing clause. A structural fixture using *approximately* real rates quietly becomes the compliance suite: someone finds `PTKP = 54000000` in a fixture, assumes it is authoritative, and cites a passing test. A fictional set cannot be read that way, and an engineer who "corrects" it to a plausible value has destroyed the property that makes the suite honest rather than fixed a typo.

**`structural-fiction-v1` is also what the seed migration holds** *(amended in place 2026-08-05, `ai-development-guide.md` grilling — an extension of this decision's reach, not a reversal, so no supersession)*. BR-TAX-001, BR-BPJS-001 and BR-OVT-009 make statutory parameters platform data seeded by migration, so a migration file has to contain numbers, and nothing said which. The hazard above is strictly worse one layer down: **a fixture asserts, a seed runs.** An engine seeded with plausible-looking rates is indistinguishable from a production-ready one, and the person who discovers otherwise is in a compliance conversation. One rate set now has two consumers — the structural vectors and the seed — which is also one fewer thing that can drift. Real values enter only through the platform rate-set path, confirmed by a human against current regulation; never through a migration an assistant wrote. `ai-development-guide.md` §5 states this as an imperative rule for implementers.

### 5. Pending statutory verification blocks release promotion, never a merge

The count of `pending-verification` vectors is printed by CI and gates promotion to production (`testing-strategy.md` §13, G20). It does not gate a merge, because no pull request can supply a verified Indonesian regulation.

**Scoped to reachable calculators** *(amended 2026-08-04, `implementation-roadmap.md` §4.4 grilling)*. G20 blocks promotion for the calculators a release actually exposes, not for every vector in the repository. The count that motivated the narrowing did not exist when this was written: **121 `⚠️ VERIFY` markers across twenty-eight files**, concentrated in `bpjs.md`, `tax-pph21.md`, `settings.md`, and `overtime.md`. *(Corrected 2026-08-05 from 119/27 — the original count was taken mid-session on 2026-08-04 and predates the markers `implementation-roadmap.md` and `ADR-0023` added the same day.)* Read globally, that number holds *every* build at staging indefinitely — including a pilot exposing only attendance and leave, whose BPJS code is unreachable because no payroll run exists to invoke it. A gate that blocks an unreachable code path is not protecting anyone; it is trading the whole pilot opportunity for a counter that was written before anybody counted. The rule this ADR is defending is unchanged and undiluted: **a calculator a user can invoke must be verified before it reaches production.**

Reaching zero is the concrete, countable definition of "the calculators are ready" — replacing a prose intention in `ASSUMPTIONS.md` with a number a pipeline enforces.

### 6. No integration or e2e test asserts a money amount

Amounts are asserted **only** by vectors. Integration tests assert structure and flow: the line exists, its `wage_category` is correct, the trace has the expected entry count, the ledger balances against itself, the run reached `calculated`.

Without this rule the other five decisions leak: an integration test asserting `4382500` against a migration-seeded unverified rate reintroduces exactly the problem this ADR exists to prevent, in a file nobody will search when the rate is corrected.

### 7. A vector file lives in the handbook only when more than one implementation consumes it

Otherwise it lives beside its single implementation. Today the rule selects exactly one file: holiday resolution, which holiday.md §4 states is implemented twice — server-side and in shared Dart domain code over the local mirror (BR-HOL-010). It lives at `docs/07-operations/test-vectors/holiday-resolution.json`. The four statutory files have one consumer each and live in `hris-api`.

**Read from the submodule, not vendored** *(amended in place 2026-08-05, `ADR-0025` — a change to the delivery mechanism, not to which file is canonical, so no supersession)*. As written this clause said *"vendored into both implementation repositories with a `sha256` equality check in CI"*, and ci-cd **C8** was that check. `ADR-0025` mounts the handbook at `docs/handbook/` as a pinned submodule, which makes the copy and the hash a hand-built substitute for what the pin already guarantees: both repositories read `docs/handbook/docs/07-operations/test-vectors/holiday-resolution.json` in place, and **C8 is retired**. The clause was also the only part of this ADR that assumed a handbook-access mechanism nothing had defined.

The rule carries its own trigger: a second implementation of any pure function moves its vectors up.

## Alternatives considered

- **Best-guess published rates in the fixtures now, marked `⚠️ VERIFY`.** Rejected. This is inventing regulatory numbers into an executable artifact, which `CLAUDE.md` forbids and which is strictly worse in code than in prose — a document with a marker invites verification, a green test suite asserts correctness. It also produces the silent-forever failure: when the real rate differs, code and expectation were derived from the same wrong source and no test notices.
- **Structural vectors only; no statutory vectors until the rates are verified.** Rejected. The vector file is where the verification work gets recorded; without the skipped vectors sitting there carrying their citations, "verify the tax tables" stays an open-ended line in `ASSUMPTIONS.md` with no definition of done. The quarantined set is the task list.
- **Approximately-real rates in the structural fixtures, for readability.** Rejected, and this is the alternative most likely to be re-proposed. It reads better and it is the exact mechanism by which a structural suite is mistaken for a compliance suite. Readability here is a liability.
- **Snapshot baselines generated from the current implementation.** Rejected outright. A snapshot asserts only that behavior has not changed, which on day one blesses whatever the calculator did the first time it ran — including wrong. For an engine whose output is the product, that is worse than no test, because it looks like coverage.
- **Expected values inline in Jest specs rather than data files.** Rejected: it scatters across dozens of files exactly the numbers a regulator's letter changes, and it puts them where a payroll expert cannot review them.
- **A single vector file per module rather than per calculator.** Rejected: payroll alone carries stage arithmetic, proration, and component splitting; one file per calculator keeps a failing vector's blast radius legible.
- **Keeping all vector files in the handbook repository for consistency.** Rejected: it taxes every statutory vector edit — where all the churn will be — with a cross-repo sync, for zero benefit, since nothing else reads them.
- **Property-based tests instead of vectors.** Rejected as a replacement, adopted as a complement (`testing-strategy.md` §6.5, five named properties). A property proves an invariant holds across an input space; it cannot prove the engine reproduces the regulator's own figure, which is the question a payroll audit asks.

## Tradeoffs

The fictional rate set makes the structural suite unreadable as documentation — nobody learns PPh 21 from these fixtures, which is deliberate and will still feel wrong to a new engineer. Two files per calculator instead of one is more surface. The skipped statutory vectors will sit red-adjacent in the suite for months, and a skipped test is a well-known place for attention to die — mitigated only by G20 making the count visible at every release. Rule 6 forbids the most natural assertion an engineer writes when testing a payroll integration path, and it will be violated by accident; the review checklist has to carry it. Rule 2 means a failing vector cannot be resolved by the person who broke it without a domain conversation, which is friction exactly where friction is wanted and exactly where a deadline will argue against it.

## Consequences

- `docs/07-operations/testing-strategy.md` §6 implements all seven decisions, and §13 registers the two release gates G19 and G20.
- The five documents that promised golden vectors without defining them — holiday §4/§14, shift §4/§14, leave §14, overtime §14, attendance §14 — are now discharged by a defined artifact; their scenario rows are unchanged.
- `hris-api` gains `test/vectors/` with structural and statutory files per calculator, plus a fixture module exporting `structural-fiction-v1`.
- The handbook gains `docs/07-operations/test-vectors/holiday-resolution.json` as its first executable artifact, consumed by two repositories under a checksum check.
- CI gains a `pending-verification` counter whose non-zero value holds a build at staging **for the calculators that release exposes** (scoped 2026-08-04 — decision 5).
- **Verification is a workstream, not a task inside a sprint.** `implementation-roadmap.md` §3 makes it the third track, starting on day one with a named owner, on the ground that it produces no commits and is therefore invisible to any plan made of commits — and that an external advisor cannot be engaged, briefed, and through 119 markers in the week before a release.
- No module document changes. No schema changes. No error codes.

## Future considerations

Retiring `pending-verification` to zero is the milestone that makes the statutory suite real; until then the engines are proven structurally correct and unproven against Indonesian regulation, and this ADR is the document that says so plainly. Once verified, the annual rate revision becomes a vector-file change reviewed against the new regulation — the same path, exercised routinely rather than once. If a second market is ever added, the rate-set indirection already present in the file header is the seam that keeps one calculator serving both.
