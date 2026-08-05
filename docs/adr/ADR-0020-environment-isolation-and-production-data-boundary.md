# ADR-0020: Environment Isolation and the Production Data Boundary

Status: **Proposed** (grilled 2026-08-04 during `docs/07-operations/environments.md`; awaiting user review) · Date: 2026-08-04 · Deciders: product owner + engineering

## Context

D5 fixes containers everywhere, Docker Compose for development, and managed Kubernetes for production. A-003 fixes `asia-southeast2`. Neither says how many environments exist, what separates them, or what may travel between them.

Several documents assume an answer without stating one:

- ci-cd §11 splits CI privilege by GitHub Environment so that a staging-scoped workflow cannot reach production credentials — a split that only means something if the *targets* are separately governed.
- testing-strategy §7 rule 4 prohibits copying production data into any test or staging environment, and assigns "the anonymization path for any production restore used outside production" to `environments.md` and `backup-restore.md`.
- ci-cd §12 states the same prohibition from the pipeline's side.
- `ADR-0016` encrypts NIK, NPWP, BPJS numbers, and bank data with per-tenant DEKs wrapped by a cloud KMS key.
- `ADR-0009` places the storage bucket in the same Firebase project as FCM.

Two questions have no owner. **What enforces the separation between staging and production — us, or the cloud provider?** And **is there a sanctioned way to get production-shaped data into a non-production environment?**

The second is not hypothetical. "Can I get a copy of production in staging" is asked in every engineering organization that exists, usually by someone senior, usually while debugging something expensive. An answer that lives only in a runbook loses that argument. It needs to be a decision with reasons attached.

## Decision

### 1. Three environments, and a closed identifier set

`local`, `staging`, `production`. `APP_ENV` accepts exactly those three plus `test` for CI-ephemeral containers, and a value outside the set fails boot rather than defaulting.

CI ephemeral infrastructure and the GitHub `release` secret scope are **not** environments and are named as such, because both get mistaken for one.

There is no shared development cluster and no separate demo environment. The demo tenant lives on staging beside the smoke tenant.

### 2. Two GCP projects, with IAM as the isolation boundary

`hris-staging` and `hris-production`, each holding its own GKE cluster, Cloud SQL instance, Memorystore instance, and Firebase project.

The starting point is forced rather than chosen: `ADR-0009` puts the bucket in the FCM project, and a staging push must never reach a real employee's phone, so two Firebase projects — and therefore two GCP projects — exist before anything is decided.

Given that they exist, the cluster and the managed data services go in the matching project. **This converts an isolation boundary we assert into one Google enforces.** In a single cluster with two namespaces, ci-cd §11's privilege split survives only as long as every RBAC binding stays correct, and one wrong ClusterRoleBinding removes it silently. Across projects, the staging deploy identity holds no grant in the production project at all.

One shared Artifact Registry lives in the production project, because `ADR-0019` promotes a digest and a digest lives in one registry.

### 3. Production data never leaves the production project

Not into staging, not into CI, not onto a laptop, not in anonymized form, not "just this once for an incident".

### 4. No anonymization path is built

testing-strategy §7 rule 4 assigned the mechanism to `environments.md`. The mechanism is a refusal, for three reasons in descending order of finality:

- **`ADR-0016` already blocks it.** The regulated columns are AES-GCM ciphertext under a per-tenant DEK wrapped by a *production* KMS key. A staging restore either cannot decrypt them — leaving ciphertext, which debugs nothing — or staging is granted production KMS access, which is a far worse outcome than the problem being solved.
- **An anonymizer is a column allowlist, and allowlists fail open.** The first migration adding a sensitive column that nobody remembers to add to the scrubber exports real salaries into an environment with none of the controls, and nothing reports it. It must be perfect on the day it is written and on every day after.
- **It would be exercised rarely and trusted absolutely**, which is the worst combination a security control can have.

### 5. Forensic restores happen inside the boundary

The legitimate need behind every request for production data is "reproduce this with production-shaped data". That is served by a **PITR restore into a temporary Cloud SQL instance inside `hris-production`** — same VPC, same IAM, no public IP — read, then destroyed.

The data never crosses the boundary, so there is nothing to anonymize. `backup-restore.md` owns the procedure; `environments.md` owns the rule that the target lives inside the production project and is torn down.

### 6. Staging is synthetic by construction

Staging holds exactly two tenants, both seeded through system-administration §5.3's real provisioning path: the smoke tenant ci-cd §12 resets before each run, and a demo tenant CI never touches.

Seeding through the real path rather than a fixture script is deliberate — a smoke suite running on differently-shaped data tests a system that does not exist.

## Alternatives considered

- **One cluster, two namespaces.** Rejected: cheaper by one control plane, but the isolation becomes something we enforce with RBAC and network policy rather than something the provider enforces. Two Firebase projects were already mandatory, so the project sprawl this avoids is one project, not two.
- **One project, two clusters.** Rejected: keeps the IAM boundary weak — a single project's service accounts, secrets, and registry are reachable from both — while paying the second control plane anyway.
- **GKE Autopilot.** Rejected on two concrete blockers: `ADR-0011`'s node-exporter needs host mounts, and `ADR-0014`'s Chromium sandbox needs a node-level seccomp profile. Both are refused under Autopilot.
- **A third `hris-shared` project holding only the registry.** Deferred rather than rejected. It would remove CI's `artifactregistry.writer` grant in the production project, which is a real if narrow residual. It waits for a second consumer.
- **Building the anonymizer anyway, scoped to a "safe" subset of tables.** Rejected: the subset is exactly the allowlist whose failure mode is the objection. A partial anonymizer also invites the belief that the output is safe, which is worse than an honest prohibition.
- **Restoring production into staging with encrypted columns left as ciphertext.** Rejected: it debugs nothing, because the columns anyone wants production data to inspect are the encrypted ones, while still moving names, addresses, salaries, and the full org structure outside their controls.
- **A fourth "pre-production" environment mirroring production with real data volumes.** Rejected: it is the anonymization question again with a different name, and D13's operator population cannot maintain a fourth environment nobody deploys to on a schedule.

## Tradeoffs

Two projects cost a second GKE control plane and a second set of managed instances that hold nothing valuable. Accepted: the alternative spends the same money on Firebase separation and then relies on our own RBAC for everything else.

Refusing the anonymization path means an engineer debugging a production-only defect cannot reproduce it locally with real data. Mitigated by decision 5, but not eliminated — a forensic restore is slower and more deliberate than a staging copy, and that friction is the point rather than an oversight.

Staging never surfaces defects that only appear at production data volume or shape. Accepted, and named honestly: `performance.md` owns load characteristics with synthetic data, and the alternative buys realism with a permanent copy of regulated data outside its controls.

A closed `APP_ENV` set means adding an environment is a code change rather than a configuration change. That is intentional friction, and it is small.

## Consequences

- `docs/07-operations/environments.md` §2, §3, and §14 implement this: the inventory, the topology, and the data boundary.
- testing-strategy §7 rule 4's forward promise is discharged **by refusal** — the mechanism it anticipated is not built, and decision 5 replaces it.
- `backup-restore.md` inherits the forensic-restore procedure, and inherits the constraint that its target instance lives inside the production project. **Discharged 2026-08-04** — `backup-restore.md` §9 makes it four steps ending in *destroy the instance the same day*, with `environments.md` §13.3's `FORCE` RLS warning carried over verbatim, since a query without the tenant variable returns zero rows and reads as "no data" rather than "wrong query". The clone turned out to have **two further uses this ADR did not foresee**, which is what makes the refusal cheap rather than merely principled: it is step 1 of `ADR-0022`'s tenant-scoped extraction, and it is the venue for §14's restore drills — so the mechanism built to replace anonymization is now the mechanism behind every non-trivial recovery procedure in the handbook.
- Every environment-shaped question now has one answer to point at: a request for production data in staging is refused by an ADR, not by whoever happens to be asked.
- `ADR-0016`'s per-tenant DEKs acquire a second load-bearing role beyond crypto-shredding — they are what makes the data boundary self-enforcing rather than policy-dependent.
- GKE Standard is required rather than preferred, which fixes node pool management as an operational concern.

## Future considerations

Pod user namespaces would remove the node-level seccomp file that partly motivates GKE Standard, though `ADR-0011`'s node-exporter would still rule out Autopilot. A third project holding only Artifact Registry becomes worthwhile once a second consumer exists. Multi-region deployment would multiply projects per region and turn decision 2 into a matrix; A-003's single region keeps it a pair. If a contract ever demands per-tenant infrastructure, multi-tenancy §7's existing move runbook is the path, and it moves a tenant *within* the production boundary rather than across it.
