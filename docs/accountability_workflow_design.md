# DRIFT Accountability Workflow Design

## Product Promise

DRIFT will turn an engineer-reviewed finding into an **accountable, evidence-linked maintenance case**. It does not claim that a map alone determines jurisdiction, an AI score proves structural condition, a contractor closure proves repair quality, or a prepared UAV recommendation authorizes flight.

| Step | DRIFT output | Human/authoritative dependency |
|---|---|---|
| 1. Evidence intake | Provenance, capture-quality, location, and retention record | Original permitted UAV/CCTV/site source or labelled public reference |
| 2. Candidate review | Engineer-reviewed defect candidate and DSI factor card | Engineer validates finding and approved project inputs |
| 3. Ownership resolution | Proposed owner/team/SLA route with source references | Approved project GIS, ownership registry, contract/SLA record |
| 4. Maintenance case | Ticket with contractor assignment, due date, proof requirement, and escalation draft | Authorized manager assigns a real contractor/user |
| 5. Closure claim | Contractor closure record plus original proof references | Contractor provides actual completion information |
| 6. Verification | Fixed, Needs Rework, or Cannot Verify decision | Engineer compares follow-up evidence against the criterion |
| 7. Handoff/transparency | Expiring review package, export payload, or approved public summary | Owner approval, named recipient system, privacy review |

## Ownership and Routing Registry

The routing service must resolve against project-scoped records only. A public GIS boundary can be attached as context, but it is not a legal ownership decision.

| Entity | Required fields | Critical guardrail |
|---|---|---|
| `authority` | legal name, jurisdiction type, contact channel, active dates | Data steward validates each authority |
| `route_rule` | asset class, zone/boundary reference, owner, responsible team, contract/SLA reference, effective range | Conflict or missing match returns `unresolved` |
| `SLA_rule` | response target, closure target, escalation ladder, business calendar, policy version | Ticket does not promise a deadline until an active rule matches |
| `routing_decision` | ticket, matched rule(s), source references, confidence, reviewer, outcome | Machine output remains proposed until authorized review |

## Defect Severity Index (DSI)

DSI is an explainable advisory policy. The initial output is a priority band and factor card, not an engineering conclusion.

| Factor | Evidence source | Allowed output |
|---|---|---|
| Evidence support | provenance, coverage, quality, repeatability | sufficient / limited / insufficient |
| Location support | asset match, registered camera zone, survey/GPS confidence | exact asset, approved zone, unresolved |
| Asset criticality | project asset register | configured 1–5 value and source |
| Operational impact | approved traffic/operations dataset or owner-entered record | cited project value, otherwise not assessed |
| Repeat history | linked evidence over time with matching rule | observed repeat count/period, not degradation rate unless measured |
| Verification state | open, contractor closed, follow-up reviewed | priority modifier only |

The minimum DSI output is `insufficient_evidence` whenever evidence provenance, location support, or criticality is missing. Any mathematical score is optional and must store the policy version, factors, weights, input record IDs, calculation timestamp, and reviewer state.

## Contractor SLA and Verification

| Ticket stage | Required fields | Prohibited shortcut |
|---|---|---|
| Open | engineer-approved finding, route state, DSI card, required verification criterion | Auto-assigning a fictitious contractor |
| Assigned | authentic contractor organization/user, due date, applicable SLA rule | Claiming delivery or acceptance from an unconfigured external system |
| Contractor closed | closure note, time, completion-proof evidence IDs | Changing status to fixed |
| Verification pending | follow-up capture target, comparison rule, engineer owner | Autonomous UAV dispatch or hidden verification |
| Finalized | engineer decision, source-linked comparison, limitation statement | Payment release or compliance certification without authority |

## Government Handoff and Public Transparency

The first integration release generates a reviewable export payload and signed/expiring review link; it does not impersonate government users or push into a system until the authority authorizes an adapter and supplies a documented schema and server-side credentials.

| Feature | First release | Activation requirement |
|---|---|---|
| Review link | Time-bound, scope-limited inspection package with evidence links and DSI explanation | Recipient identity, purpose, expiry, and access log |
| System export | JSON/CSV/PDF handoff package with delivery state `prepared` | Authorized agency mapping and credentialed adapter |
| Public view | Owner-approved status summary of real ticket state | Privacy review, publication approval, and revocation control |
| CCTV visibility | No raw feed or image in public output | Separate explicit authorization; default deny |

## Release Order

1. Create persistent project-owned registries and ticket records; do not seed contractors or owners.
2. Provide an operator-facing Accountability workspace that clearly displays readiness and missing dependencies.
3. Add DSI factor-card computation for engineer-reviewed records.
4. Add ticket creation, contractor closure proof linkage, and engineer verification.
5. Add ownership/SLA registry and prepared handoff package.
6. Add controlled public summary only after a project owner approves publication policy.
