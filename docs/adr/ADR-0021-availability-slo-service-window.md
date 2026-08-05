# ADR-0021: Availability SLO and the Service Window

Status: Proposed · Date: 2026-08-04 · Deciders: product owner + engineering (surfaced during `docs/07-operations/observability.md` grilling)

## Context

D3 fixes availability at **99.9% monthly**, confirmed binding in Phase 0 alongside D1–D14. Nobody has done the arithmetic since.

99.9% of a 30-day month is **43 minutes 12 seconds** of unavailability, in total, for the month.

Three decisions taken elsewhere describe the operation that has to deliver it:

- **A-102**: a small organization with no QA role and no on-call role.
- **`docs/07-operations/environments.md` §11**: **no PagerDuty**, on the explicit reasoning that paging requires a rotation and there is nobody to rotate. Every alert route is a chat channel and an email address. A consequence not stated there: without a paging vendor there is also no vendor heartbeat, so nothing external notices that nothing is being noticed.
- **A-003 and D1**: every tenant is Indonesian. The people who would respond work WIB hours.

The arithmetic that follows is unambiguous. An outage beginning at 23:00 WIB and noticed at 08:00 is nine hours — about **twelve months of budget consumed in one night**. Across a weekend it is closer to **eight years'** worth. A single unattended overnight failure ends the annual target, and there is no plausible response process that prevents it.

So D3's availability clause is not a target being missed. It is a target that **cannot be met by the operation the handbook has designed**, and no document says so. `observability.md` cannot define an SLI, an error budget, or an alerting posture on top of a number that is decorative — the budget would be exhausted permanently and would therefore mean nothing.

D3's other two clauses are unaffected: PITR RPO ≤ 15 min and RTO ≤ 4 h are mechanism-bound, they belong to `backup-restore.md`, and nothing here touches them.

## Decision

**1. The availability SLO is 99.9% within a defined service window, and best-effort outside it.**

The service window is **08:00–20:00 WIB, Monday to Saturday**. Within it, 99.9% is a real commitment measured against a real response capability. Outside it, there is no availability target — detection continues, response does not.

**2. Both figures are computed, always.**

The recording rules produce windowed availability *and* unqualified 24×7 availability. The unqualified number is not discarded, hidden, or renamed. It stays on the `API` dashboard beside the windowed one, so the gap between what is committed and what is delivered is visible at all times rather than disappearing at the moment it is scoped away.

**3. Detection does not respect the window.**

Alert rules evaluate at every hour. The external uptime check (`observability.md` OB21) runs at every hour. Routing is unchanged. **What the window scopes is the commitment, not the detection** — an outage at 02:00 is in the channel when someone opens it, and the S1 declaration is available to whoever sees it.

**4. This scopes D3's availability clause; it does not supersede D3.**

D3 remains the source of the 99.9% figure and of the RPO/RTO clauses. This ADR records how the availability half is read given A-102, and is the document a future reader is sent to when D3 and the runbook appear to disagree.

**5. The trigger to revisit is commercial, and it is named.**

The first tenant contract carrying an uptime commitment, or the first out-of-window incident that costs a customer a statutory payroll deadline. Either funds a rotation, and the rotation is what makes an unwindowed 99.9% achievable rather than aspirational.

## Alternatives considered

- **Keep D3 unqualified and add an on-call rotation.** The only option that delivers 24×7 99.9% honestly. Rejected on the same ground `environments.md` §11 rejected PagerDuty: A-102's organization has nobody to rotate, and a rotation with one name on it is not a rotation — it is one person's phone, permanently, until they leave.
- **Keep D3 unqualified and change nothing.** Honest about the target, dishonest about the operation. Produces an error budget that is exhausted in the first bad night and stays exhausted, which trains everyone to ignore it — and an ignored budget is worse than no budget, because it is cited in planning as though it were real.
- **Lower the target to ~99.5% (3.6 h/month) unwindowed.** Achievable, arithmetically honest, and it fits an unattended overnight. Rejected because it silently weakens a confirmed Phase 0 decision and reads as a downgrade of ambition rather than a clarification of scope. It also prices in overnight outages as acceptable, which they are not — they are unattended, which is a different claim.
- **Two separate SLOs, one per period** — 99.9% in-window, 99.0% out-of-window. Rejected: the out-of-window number is a fiction, since nothing acts on it. Committing to a figure that no process defends is the failure this ADR exists to remove, reintroduced one line lower.
- **A follow-the-sun arrangement or an outsourced first-line responder.** Rejected as a D13-scale cost with no product to hand over to — a first-line responder with no runbook authority and no deploy rights can only forward the alert to the same person who would have seen it at 08:00.
- **Rely on GKE self-healing and treat overnight outages as tolerable.** Partially true and already relied upon — readiness gates, PDBs, regional HA (`environments.md` §9) do handle the common node and pod failures unattended. Rejected as a *complete* answer: none of it recovers from a bad release, a migration defect, a Redis exhaustion under `noeviction`, or an expired certificate, and those are the failures that produce nine-hour outages.

## Tradeoffs

A windowed SLO is weaker than an unwindowed one, and any prospective customer who reads carefully will see that. That is the correct outcome: it is what is true today, and discovering it in a contract negotiation is better than discovering it in a post-incident conversation.

Computing both numbers costs a second recording rule and a second panel, and it means the unflattering figure is permanently on a dashboard. Deliberate. Scoping a target and then hiding the unscoped measurement is how an organization loses track of the gap entirely.

The window's boundaries — 08:00–20:00 WIB, Monday to Saturday — are a judgment, not a derivation. They approximate when Indonesian tenants use an HRIS: Saturday is included because attendance and shift work run six days in much of the market, and Sunday is not. Getting them wrong is cheap to correct, since the boundaries are a recording-rule parameter and nothing else depends on them.

Alerts firing outside the window with no response commitment will, over time, train people to skim overnight notifications. The mitigation is §13.4's weekly rhythm and OB21's watchdog rather than a promise nobody can keep.

## Consequences

- **`docs/07-operations/observability.md` §3.2** states the window, §3.1 defines the SLI against it, and §3.3 fixes what the error budget may do — read monthly, never pages, **never gates a release**. That last clause exists because `ADR-0019` makes promotion a human act, and a freeze policy nobody enforces is cited once and ignored thereafter.
- **Two recording rules, not one**, and two panels on the `API` dashboard.
- **`docs/07-operations/observability.md` §13.2** repeats "S1 outside the window is best-effort" in the incident table, because that is where a reader looks under pressure.
- **D3's availability clause is now read through this ADR.** Its RPO and RTO clauses are untouched and remain `backup-restore.md`'s. **Taken up 2026-08-04:** that document reads the RPO clause as binding **PostgreSQL alone**, since D3 names it, and derives per-store objectives for the other ten stores; it finds the RPO comfortably beaten by write-ahead-log archival and **the RTO to be the clause actually at risk**, budgeting it line by line to ≈ 3 h 35 m of 4 h with the clone step unmeasured. It also adopts this ADR's two-clock device: the RTO budget runs **from the decision to restore**, detection lag sits before it and is governed by the service window here, and the customer-visible outage is reported as the sum — never as the budget alone.
- **`environments.md` §11's no-PagerDuty decision gains its missing half.** That section explained why there is no pager; this explains what that means for the number the pager would have defended.
- Recorded as **A-121**.

## Future considerations

A second engineer makes a rotation possible, and a rotation is the single change that would retire this ADR — at which point the window is removed, D3 is read unqualified again, PagerDuty becomes worth its bill, and OB4's burn-rate alert finally has a consumer capable of acting on it within the horizon it measures.

Progressive delivery (`ADR-0019`'s future note) reduces the *probability* of the overnight bad-release case rather than the response time, so it improves the unwindowed number without changing this decision.

If tenants ever span more than one Indonesian timezone in a way that matters operationally — WITA and WIT branches with materially different working hours — the window is expressed in WIB and would need restating as a coverage span rather than a clock range.
