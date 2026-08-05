# ADR-0019: Release and Promotion Model

Status: **Proposed** (grilled 2026-08-04 during `docs/07-operations/ci-cd.md`; awaiting user review) · Date: 2026-08-04 · Deciders: product owner + engineering

## Context

A-006 splits the implementation into three repositories — `hris-api`, `hris-admin`, `hris-mobile` — with no monorepo. They ship to three different places: two container images into one Kubernetes cluster, and one pair of binaries into two app stores whose review queues nobody controls.

Nothing in the handbook says how a change becomes a production release. The pieces that exist point in compatible directions but stop short of a model:

- naming-conventions §12 fixes branch names over the types `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci` — **no `release/`, no `hotfix/`, no `develop`**.
- `ADR-0007` versions the whole API surface together, declares open enums, and states the governing fact: *"old app versions live for months — breaking-without-versioning is prohibited."*
- database-conventions §10 makes migrations forward-only and immutable, requires expand → migrate-data → contract for breaking changes, and requires that a migration never break **the currently deployed** application version.
- system-overview §3.1 orders migrations before application pods.

Two questions have no answer anywhere, and both are asked for the first time during an incident. **Do the backend and the admin web release together?** And **how far back can we roll?**

The first matters because the staging smoke suite validates a *pair* — one API digest against one web digest — so promoting one side alone puts production on a combination nothing exercised. The second matters because forward-only migrations mean rolling back application code does not roll back the schema, and an on-call engineer needs a number rather than a derivation.

## Decision

### 1. Trunk-based development, no release branch

`main` is the only long-lived branch and is always releasable. Short-lived branches per naming-conventions §12, squash-merged. A release branch would contradict the branch-type list an anchor document already fixed.

### 2. The digest is the release identity; the version tag is a label for humans

A merge to `main` builds an image **once** and tags it `sha-<short12>`. Promotion re-tags **that same digest** `v<semver>` and deploys it. Deployments reference `@sha256:` digests. `latest` is prohibited.

A rebuild from the same commit is a different image — base-image drift, timestamps, transitive resolution — so promoting a rebuild would re-open everything the staging smoke suite just closed. The version number is chosen by the operator at promotion time and carries no semantic contract; the API's compatibility contract is `ADR-0007`'s URI version, which is a different number and moves for different reasons.

### 3. Staging deploys automatically; production is promoted by a human

Every merge to `main` deploys to staging and runs the smoke suite. Nothing else deploys automatically. Production promotion is a manual action behind an environment approval, gated on the smoke statuses for that digest.

A manually triggered staging deploy would make the post-deploy gate run whenever someone remembered, which is not a gate.

### 4. The three repositories promote independently; compatibility comes from the contract, not from pairing

`hris-api` promotes on its own schedule, then `hris-admin`, then mobile ships when a store lets it. There is no pinned pair and no release train.

The reason is not convenience. `ADR-0007` already requires the API to serve app versions months old, so the backend **must** tolerate clients it was never co-tested with, and the OpenAPI breaking-change gate enforces that on every pull request. Once old clients are mandatory, pinning web-to-api is a fiction of safety bought with real coordination cost: the slower repository gates the faster one, and within two months somebody invents the release branch decision 1 refused.

Two rules keep independence safe. **The backend promotes first** — additive-then-consume, the API-surface mirror of expand → migrate-data → contract. And **a web change consuming a new API field names the version that introduced it** in the pull request, as a reviewer check.

### 5. Guaranteed rollback depth is exactly one release

Rollback redeploys the previous digest through an audited workflow. It is guaranteed to work for exactly one release back, and that falls out of an existing rule rather than being chosen here: database-conventions §10 rule 5 requires release N's migration to be compatible with the application version deployed before it, which is N−1. Nothing is promised about N−2.

### 6. A contract step is a one-way door

Once expand → migrate-data → **contract** drops the column, every earlier application version is unrunnable. A release containing a contract step declares it in the release notes, and rollback past it is prohibited — recovery is a forward fix or PITR.

### 7. Rollback restores code, never data

Rows written by a bad release survive its rollback. Bad data is corrected forward, or by PITR under D3, which discards post-restore writes for every tenant and is therefore a last resort.

## Alternatives considered

- **Coordinated release train — `api` and `admin-web` promoted as a pinned, co-tested pair.** Rejected: it buys a guarantee the mobile client already makes impossible, since an installed app is never part of any tested pair. The cost is real coordination that grows with team size, and the first schedule conflict produces a release branch.
- **GitFlow with `develop` and `release/*`.** Rejected: contradicts naming-conventions §12's branch-type list, and long-lived branches with three repositories multiply the merge surface without protecting anything trunk-based development plus gates does not already protect.
- **Tag-triggered builds — pushing `v1.4.0` builds and ships.** Rejected: it produces an artifact no smoke suite ever ran, which is the exact failure decision 2 exists to prevent.
- **Automatic promotion when smoke turns green.** Rejected for V1: smoke is five journeys, not a release decision. Payroll and statutory correctness questions (`ADR-0018`'s G20) need a person who knows what month it is.
- **Semantic versioning derived from commit types, via `release-please` or equivalent.** Rejected: it ships major versions nobody intended for a product with no external consumers pinning versions, and it wants to own the version bump, which conflicts with decision 2's digest-first identity.
- **Rolling back by reverting migrations.** Rejected by `ADR-0013` before this ADR existed: down migrations are untested fiction by the time production needs them.
- **Monorepo, making the pair question disappear.** Rejected by A-006, and it would not actually help — the mobile client's version skew is the binding constraint, and a monorepo does not change what is installed on a phone.

## Tradeoffs

Independent promotion means production can briefly run an api/web pair no smoke run exercised. That exposure is accepted consciously; it is identical in kind to the exposure the mobile client carries permanently, and the OpenAPI gate is the mitigation.

A manual promotion step means a fix that passed every gate still waits for a person. Accepted: the alternative removes the only point where someone asks whether now is a good moment to change a payroll system.

A rollback depth of one is thin. Deepening it would require every migration to be compatible with N−2, which doubles the expand → contract window and leaves dead columns in the schema for longer. The honest mitigation is that PITR exists, not that the depth is comfortable.

Operator-chosen version numbers drift from meaning over time. Accepted, because the digest is the identity and the number is a label; the compatibility contract lives in `ADR-0007`'s URI version instead.

## Consequences

- `docs/07-operations/ci-cd.md` §2, §6, and §8 implement this model: trigger table, tag scheme, rollout order, rollback workflow, and the per-repository promotion requirements.
- The rollback-depth-of-one rule turns database-conventions §10 rule 5 into a load-bearing operational constraint, not merely a schema-hygiene rule. Relaxing rule 5 would silently remove the rollback guarantee.

- **Rollback is rehearsed once before the first production release** *(added 2026-08-04, `implementation-roadmap.md` §8)*. Decision 5 derives the depth-one guarantee from an existing rule rather than choosing it, which makes it correct and entirely untested — nothing in the handbook ever executes it. A guarantee whose first execution happens during an incident is a guarantee nobody has, and the drill costs one staging promotion plus one rollback of it.
- Release notes acquire a mandatory element: any release containing a contract migration must say so.
- The staging smoke suite becomes the promotion gate rather than a report, so its flakiness is a release-velocity problem and is why testing-strategy §12 permits retries there and nowhere else.
- `hris-mobile` has no promotion in this sense: CI's responsibility ends at the internal track, and the store decides the rest.
- **Mobile release consequence, added 2026-08-04** (`environments.md` §10.4, A-119). Decision 2 fixes the container digest as the release identity and has no mobile analogue, because mobile produces no image. The analogue is this: **the production-flavored artifact is built by the promotion workflow, not by the merge build.** Merge builds only the `staging` flavor, which goes to a separate Play listing and TestFlight app under a distinct application id. Without this, an internal-track build pointing at the staging API sits one console click away from the production track — the mobile shape of the failure decision 2 exists to prevent. Two consequences follow honestly: two store listings exist rather than one, and **the artifact that reaches the store is not the artifact S5 smoke-tested**, since the two differ in `--dart-define` values and the Firebase configuration file and in nothing else.

## Future considerations

Progressive delivery — canary with automated metric analysis — would change decision 3 from "a human promotes" to "a human approves a policy", and becomes worth the traffic-splitting infrastructure once observability alerting can carry a promotion decision. Multi-region deployment would turn a single production environment into a fleet and make promotion a per-region operation. A minimum-supported-app-version mechanism, which the handbook does not currently define anywhere, would put an upper bound on the client skew decision 4 depends on and is the one change that could make pairing worth revisiting. **Made visible 2026-08-04:** `observability.md` §7's `Mobile & sync` dashboard carries an **app version spread** panel — the only view anywhere in the handbook of how far that skew actually extends — and `hris_punch_sync_failures_total` broken down by `ADR-0003` rejection class is what turns "a release broke a client version still in the wild" from a hypothesis into a signal (OB17). Neither bounds the skew; both are the precondition for ever deciding to.
