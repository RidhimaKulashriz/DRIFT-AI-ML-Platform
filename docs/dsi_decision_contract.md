# DRIFT Decision Support Intelligence Contract

## Purpose and Boundary

DRIFT DSI is a **transparent advisory prioritization service** for contractor work. It combines approved project data to help an engineer decide which review or maintenance ticket should be addressed first. It never certifies structural safety, approves payment, marks a repair complete, authorizes surveillance, or commands a drone.

> A high DSI priority means that the available evidence and project-defined consequence warrant **earlier human review**. It is not a prediction of failure probability or an automatic work-release instruction.

## Authoritative Record Types

| Record type | Created from | May be used for | Must never be used for |
|---|---|---|---|
| `field_evidence` | Original permitted operator, UAV, CCTV, or site upload | Review, ticket linkage, follow-up comparison | Reuse after retention expiry or outside its authorized project/purpose |
| `external_reference` | Approved public inventory/dataset import | Prototype mapping, taxonomy, model evaluation | Project finding, contractor assignment, ticket closure proof |
| `model_candidate` | CV/AI inference attached to a source record | Triage and engineer review | Automatic verification, compliance claim, or repair release |
| `ticket` | Engineer-approved actionable issue | Contractor assignment and closure workflow | Fabricated contractor or completion history |
| `verification` | Engineer-reviewed follow-up evidence | Fixed/rework/cannot-verify decision | Silent ticket closure from a score alone |
| `knowledge_document` | Approved project document under a version and role scope | RAG retrieval and cited answers | Public-web, unapproved, or cross-project answers |

## Required Data Dictionary

| Domain | Required fields | Quality gate |
|---|---|---|
| Asset | `asset_id`, type, owner, project, corridor/zone, geometry, criticality, lifecycle state | Asset must exist before a ticket is issued |
| Evidence | `evidence_id`, provenance class, secure URI/key, content hash, timestamp, collector/source identity, purpose, retention, access scope | Original/reference class and missing metadata must be shown |
| Location | exact coordinate **or** registered camera zone, precision/confidence, asset match, localization reviewer | Zone-only input cannot display as a precise point |
| Candidate | type/taxonomy, inference model/version, confidence, quality/coverage/occlusion, observed-versus-inferred fields | Model result stays `candidate` until reviewed |
| Ticket | linked evidence/candidate, project/asset/zone, title, scope, impact factors, owner, contractor organization, due date, status | Contractor identity comes from authenticated project data only |
| Closure | contractor note, submitted time, closure proof IDs, stated limitation | Status becomes `contractor_closed`, not `fixed` |
| Verification | follow-up evidence IDs, match result, quality comparison, engineer identity/note, decision | Only an authorized engineer can choose fixed/rework/cannot-verify |
| RAG | document/version/section, project and role filters, retrieval run ID, chunk IDs/scores, cited answer | Project-specific statement requires at least one cited source |

## DSI Calculation Contract

DSI produces a factor card rather than a hidden score. Each implementation must expose the policy version and weights. The initial project configuration may calculate an advisory score only when all mandatory inputs pass their gates.

```text
advisory_priority =
  project_weighted_consequence(asset criticality, approved impact) +
  project_weighted_urgency(repeat/operational/safety context) +
  evidence_support(quality, coverage, provenance) +
  location_support(asset or zone match) +
  verification_state_modifier
```

| Factor | Default treatment | Missing / failed input |
|---|---|---|
| Project consequence | Project owner defines 1–5 criticality and its written rationale | No score; request asset governance data |
| Urgency | Engineer-approved rules can reflect repeat evidence, reported impact, and access restrictions | Display `not assessed`; do not invent impact |
| Evidence support | Confidence can contribute only if provenance, quality, and coverage are recorded | Demote to `insufficient evidence` |
| Location support | Exact location or registered camera-zone/asset match is required | Do not generate a field dispatch point |
| Verification state | Open and contractor-closed tickets remain priorities for human review | Never auto-transition to fixed |

## Ticket-State Transition Rules

| From | To | Required authority and evidence |
|---|---|---|
| Draft candidate | Open | Authorized engineer; source evidence, asset/zone, DSI factor card, required verification criterion |
| Open | Assigned | Authorized manager; authenticated contractor organization, user, due date |
| Assigned | Contractor closed | Assigned contractor; closure note and real proof references |
| Contractor closed | Verification pending | Engineer; confirmed follow-up capture target and comparison criterion |
| Verification pending | Fixed | Engineer; linked follow-up evidence supports the stated corrective outcome |
| Verification pending | Needs rework | Engineer; linked follow-up evidence contradicts closure or is insufficient |
| Verification pending | Cannot verify | Engineer; documented access, evidence-quality, or safety limitation |

## CCTV-to-UAV Recommendation Contract

The CCTV workflow may create a **localized review candidate** only after the camera is registered with owner, permitted purpose, retention deadline, access classification, and coverage zone. A candidate can be localized to a zone or an operator-confirmed point; no pixel-derived coordinate is treated as ground truth.

Before a UAV activity is suggested, DRIFT must show the source, camera zone, confidence/limitation, and required human review. A qualified human may prepare a preflight recommendation, but aircraft selection, airspace/legal checks, site authorization, arming, launch, navigation, and landing remain entirely outside DRIFT.

## RAG Answer Contract

Every contractor-knowledge response must include the following structure.

| Answer section | Requirement |
|---|---|
| Direct response | Concise answer limited to retrieved project sources and clearly identified field context |
| Observed evidence | Quote or summarize record-linked facts only |
| Advisory interpretation | State it as advisory and identify any assumptions |
| Uncertainty or refusal | Explain what is missing when sources cannot support the request |
| Citations | Document title, version, section/page, record link, and retrieval run identifier |
| Safety boundary | No compliance, safety, payment, repair, or flight approval without an authorized source record and human decision |

## Research Basis

The decision design follows the World Bank’s emphasis on transparent multi-criteria prioritization and upfront criteria/weight disclosure.[1] It follows image-based DSS research that connects visual information to a user-facing maintenance decision process rather than treating detection as the decision itself.[2] CCTV data controls use purpose, retention, restricted-access, and minimization principles documented by FHWA and the ICO.[3] [4] RAG controls address authoritative retrieval, citations, and permission-filtering benefits, while treating generated answers as risk-bearing and requiring governance, provenance, testing, and human oversight.[5] [6]

## References

[1] [World Bank, “Prioritizing Infrastructure Investment”](https://openknowledge.worldbank.org/entities/publication/d167b0f4-5075-51a7-8af1-ad61053905a1)

[2] [Landwehr et al., “Image-Based Decision Support Systems”](https://pmc.ncbi.nlm.nih.gov/articles/PMC8973684/)

[3] [FHWA, “Transportation Management Center Video Recording and Archiving Best General Practices”](https://ops.fhwa.dot.gov/publications/fhwahop16033/chap7.htm)

[4] [UK ICO, “Video surveillance data protection principles”](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/cctv-and-video-surveillance/guidance-on-video-surveillance-including-cctv/how-can-we-comply-with-the-data-protection-principles-when-using-surveillance-systems/)

[5] [AWS, “What is Retrieval-Augmented Generation?”](https://aws.amazon.com/what-is/retrieval-augmented-generation/)

[6] [NIST AI 600-1, “Generative AI Profile”](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)
