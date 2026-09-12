# DRIFT Accountability Platform: Validated Research Notes

## Validated Product Direction

The discussion-point direction is supportable if DRIFT is positioned as an **evidence-grounded accountability and handoff layer**, not as a claim that it can autonomously determine legal ownership, repair quality, or flight authorization. Transportation asset-management guidance supports centralizing asset inventory, condition, performance, location, maintenance history, and work planning so agencies can make more rational, traceable allocation decisions.[1] Digital as-built guidance further describes asset-specific data, standardized templates, field verification, asset-steward review, data governance, and ETL exchange as key lifecycle elements.[2]

| Proposed differentiator | Research-supported design | Required caution |
|---|---|---|
| Jurisdiction/ownership routing | Resolve a reviewed candidate through a project-controlled asset/ownership registry, GIS boundary/source reference, responsible team, contract/SLA rule, and escalation record | Never infer legal ownership from map proximity or public layers alone; show `routing unresolved` when authoritative mapping/contract data is absent |
| DSI severity/priority | Combine approved project consequence and impact factors with evidence and location support; disclose criteria and policy version | Do not infer depth, load-bearing capacity, traffic volume, deterioration rate, or risk probability without validated inputs and a documented method |
| Government workflow handoff | Generate a review package and export payload from a human-approved ticket; use ETL/API adapters for a named agency system | Do not claim SAP, Salesforce, Workday, Cityworks, or civic-portal integration until the agency authorizes it and credentials/schema are configured |
| Contractor SLA enforcement | Track assignment, due date, contractor closure claim, proof references, verification target, follow-up evidence, and engineer disposition | `contractor_closed` is not `fixed`; automated reinspection is a recommendation/queued task, never an autonomous UAV flight |
| Public trust dashboard | Publish only owner-approved, privacy-safe summary status and expected dates from real ticket data | No raw CCTV, personal data, sensitive locations, unverified candidates, or closure claims represented as verified outcomes |

## Implementation Implications

FHWA describes asset management as a systematic approach that supports work plans, budgets, location tracking, performance/condition monitoring, and maintenance decisions.[1] The digital-as-built workflow specifies a practical requirements-gathering approach: identify business users, intended use, responsible collector, collection timing, verification process, data format/accuracy/completeness, and exchange requirements.[2] These fields should become DRIFT configuration and ticket metadata rather than narrative-only UI text.

| DRIFT object | Minimum additional fields |
|---|---|
| Asset ownership route | asset ID, authority/owner, authoritative source URL/reference, spatial/boundary version, responsible team, contract reference, SLA rule, effective dates, confidence and resolution state |
| DSI policy | policy version, criteria, weights/thresholds, input sources, missing-data condition, sensitivity notes, approver, effective dates |
| Escalation package | ticket ID, evidence and provenance links, DSI breakdown, owner route, human approver, recipient system, export timestamp, delivery status |
| Contractor closure | real contractor ID, assigned user, due date, closure claim/time, proof references, follow-up criterion, engineer verification outcome |
| Public summary | owner approval, publication scope, privacy review, content version, revocation/expiry, published ticket state |

## Sources

[1] [Federal Highway Administration, “Why Your Agency Should Consider Asset Management Systems for Roadway Safety”](https://www.fhwa.dot.gov/publications/research/safety/05077/index.cfm)

[2] [Federal Highway Administration, “Guide for Digital As-Builts Using Integrated Digital Workflows”](https://www.fhwa.dot.gov/construction/dabs/library_hif24061.pdf)

[3] [Transportation Research Board, “Guide for Integrating Digital Construction Inspection Technologies”](https://rip.trb.org/View/2381754)
