# DRIFT Contractor USP and Evidence-Grounded RAG Design

## Product Position

**DRIFT is an evidence-to-action control room for infrastructure contractors.** It turns field capture, including operator-controlled drone media where available, into a traceable maintenance decision package rather than merely showing an AI detection. The package keeps the original evidence, location and capture provenance, confidence and quality context, review decision, action owner, and contractor-ready handoff in one inspection record.

> DRIFT does **not** certify structural safety, issue flight commands, or replace a competent engineer. It prioritizes evidence for review and makes the decision trail inspectable.

| Contractor problem | DRIFT response | Proof visible in the product |
|---|---|---|
| Field photographs, notes, and observations are fragmented | One evidence record connects media, GPS when supplied, time, camera, mission, inference, and reviewer state | Evidence Vault provenance panel and immutable links |
| Drone/AI output is hard to trust or defend | Each candidate is visibly separated from accepted work; confidence, coverage, uncertainty, source, and review state are retained | Defect detail, AI status, and engineer checkpoint |
| Site teams need an actionable handoff, not a model score | ZeroError queue translates reviewed candidates into urgency, verification step, and report-ready action package | Maintenance queue and evidence-linked PDF report |
| Contractors need to answer project-document questions quickly | RAG retrieves only approved project content and presents source passages with every answer | Contractor Knowledge Desk with cited sources |
| A demo must remain honest before real field data exists | Public data and simulator outputs are unmistakably labelled, excluded from site findings, and cannot be passed off as UAV evidence | Dataset labels, no-GPS status, and read-only demo state |

## Contractor Demo Story

The demo is not a claim that a public dataset image is a field inspection. It demonstrates the **workflow** a contractor will use after original evidence is available.

| Step | Actor | What DRIFT shows | Acceptance outcome |
|---|---|---|---|
| 1. Capture plan | Site engineer | Asset, inspection zone, mission profile, bridge/RTSP/MAVLink contract, and safe no-command boundary | A planned inspection with accountable owner |
| 2. Evidence intake | Operator or companion bridge | Original media, source classification, location/time/camera metadata, hash/storage reference | Evidence provenance is explicit; missing fields are visible, not invented |
| 3. Candidate triage | AI plus engineer | CV candidate, confidence, quality/coverage, uncertainty, severity rationale, and map reference | Candidate is queued for—not promoted past—human review |
| 4. Contractor Knowledge Desk | Project engineer | Answer grounded in approved inspection method statements, drawings/specification excerpts, prior reports, and current evidence metadata | Answer includes source citations and a statement when the knowledge base lacks support |
| 5. Decision and handoff | Authorized engineer | Accept, override, request site visit, assign next verification, and generate a report package | Auditable responsibility, status, and report attachment |

## RAG Guardrails

Retrieval-augmented generation augments an LLM prompt with relevant content from an authoritative, externally maintained knowledge base. It is useful here because contractor documentation changes between projects and RAG can show sources, but retrieval quality and permission boundaries remain crucial.[1]

| Design decision | Requirement |
|---|---|
| Approved sources only | Knowledge administrators publish controlled documents, standards excerpts with permitted use, method statements, inspection plans, change notices, accepted reports, and evidence metadata. Public web content is not queried at answer time. |
| Project and role isolation | Every knowledge chunk carries project, asset, document version, classification, and permitted-role metadata. Retrieval is filtered before the LLM receives any text. |
| Cited answer contract | Each answer returns a direct response, observed facts, advisory inference, uncertainty, source title/version/page or section, and a source URL/record reference. No citation means no asserted project-specific fact. |
| Human decision boundary | The RAG assistant can explain a method statement or summarize evidence; it cannot approve work, certify compliance, classify a defect as safe, authorize payment, or command an aircraft. |
| Evidence separation | Field evidence, simulator output, and public datasets retain separate provenance classes. Retrieval never upgrades a public training image into project evidence. |
| Change control | Documents are versioned, superseded sources are marked, and every answer logs the source chunk identifiers and model/provider status for later review. |

## Permissioned CCTV-to-Localized-UAV Triage

Traffic CCTV can improve coverage by identifying an **inspection candidate** at a known road segment or camera zone. It is not a substitute for a site inspection, a law-enforcement tool, or authority to fly. DRIFT will accept only footage that the organization is permitted to use, preserves the camera source and retention basis, and passes through a human review gate before a UAV preflight recommendation is made.

| Stage | DRIFT control | Contractor outcome |
|---|---|---|
| Register source | Camera owner, camera ID, approved zone polygon/road segment, permitted purpose, retention deadline, intake method, and access scope are recorded | A reviewer can determine whether the footage is approved for infrastructure triage |
| Minimize intake | A short operator-selected clip or approved frame range is linked; audio is off by default; personal identifiers are not used as detection targets | The inspection use remains purpose-limited rather than general surveillance |
| Localize candidate | DRIFT records the camera zone and an optional operator-confirmed map point. It never invents GPS from pixels or identifies people/vehicle occupants | A contractor can route a site review to the correct road segment with uncertainty shown |
| Review candidate | CV/AI output is labelled as a CCTV candidate with quality, visibility, occlusion, and source limitations. An engineer can reject, request a ground check, or request UAV inspection | AI output cannot become an accepted defect without accountable review |
| Prepare, do not command | A permitted engineer may prepare a UAV preflight recommendation with location, capture zone, safety checklist, and purpose. The operator must separately conduct legal/airspace/site checks and manually launch/control the aircraft | CCTV informs a safer field task; DRIFT never arms, launches, navigates, or controls the UAV |
| Audit and expiry | The intake, retrieval, review, recommendation, viewer role, source chunks, and retention action are logged. Expired footage is withheld from retrieval | A contractor can demonstrate provenance and governance at handover |

The policy requirements are deliberate. FHWA guidance describes written agreements, purpose limitations, restricted access for recorded material, minimum necessary retention, and avoidance of personal identifier collection in traffic CCTV settings.[4] The ICO likewise stresses lawful basis, purpose limitation, data minimization, secure handling, and—where risk is high—a documented impact assessment for surveillance uses.[5] Local privacy, traffic-authority, drone, airspace, and contract rules must be confirmed by the contractor before production rollout.

## Contractor Ticket and Fix-Verification Loop

The contractor-facing output is a **maintenance ticket**, not an AI verdict. A ticket combines the location, evidence record, observed limitation, priority rationale, responsible contractor, due date, and required closure proof. Closure is a contractor claim. Only follow-up evidence plus engineer review can move the issue to a verified outcome.

| Ticket stage | Required data | Who can act | Result |
|---|---|---|---|
| Open | Source evidence, asset/camera zone, candidate type, impact priority, required verification step, uncertainty | Engineer or authorized manager | Contractor receives an accountable work item |
| Assigned | Contractor/company, owner, due date, scope note | Manager | Ownership and delivery expectation are visible |
| Contractor closed | Closure note, completion time, proof photo/video/document reference, any access limitation | Contractor | The claim is frozen for review; it is not yet marked fixed |
| Verification pending | Original location/evidence plus follow-up capture target and comparison criteria | Engineer | DRIFT creates a localized site/CCTV/UAV follow-up checklist |
| Fixed | Follow-up evidence supports the required verification; engineer identity and note recorded | Engineer | Verified closure with evidence trail |
| Needs rework | Follow-up evidence contradicts closure or is insufficient | Engineer | Ticket reopens with explicit reason and new verification requirement |
| Cannot verify | Access, lighting, camera coverage, weather, evidence quality, or safety conditions prevent a conclusion | Engineer | Honest unresolved state; no false “fixed” claim |

The product should always show two clearly different phrases: **“contractor reported closed”** and **“engineer verified fixed.”** A location match alone does not prove repair. DRIFT’s comparison must check the same asset/zone, nearby coordinate or registered camera zone, evidence quality, capture time, and the defect-specific verification criterion. Any mismatch produces `Cannot Verify` or `Needs Rework`, not an automated acceptance.

## Minimum Knowledge Model

The first production RAG implementation should store small, reviewable chunks rather than opaque full files. Each chunk is linked to its source record and retrieval filter.

| Entity | Core fields | Purpose |
|---|---|---|
| Knowledge document | project, title, document type, version, owner, approval state, source URL/key, classification, superseded-at | Controlled unit of contractor knowledge |
| Knowledge chunk | document ID, section/page, normalized text, content hash, embedding/vector reference, role/project/asset filters | Retrievable cited passage |
| Retrieval run | user role, project/asset scope, query, chunk IDs, scores, timestamp | Traceability of what the system used |
| RAG answer | answer text, observed/inferred boundary, citations, provider state, refusal/uncertainty state | Reviewable decision-support output |

## Contractor Acceptance Criteria

The contractor should accept a DRIFT rollout only when the following statements can be demonstrated with their own non-sensitive project material.

| Criterion | Demonstration |
|---|---|
| Traceability | A reviewer can travel from action queue item to original evidence, capture metadata, AI candidate, review decision, and report reference. |
| Retrieval discipline | A knowledge answer contains citations to approved current documents; changing the project scope changes the retrieval set. |
| Honest uncertainty | Missing GPS, missing evidence, weak image quality, no document source, and unavailable provider states are displayed plainly. |
| Permission safety | A public/demo user cannot upload official evidence, approve a defect, view restricted knowledge, or invoke drone controls. |
| Operational handoff | A signed-off report identifies the reviewed evidence, action priority, recommended verification, owner, and outstanding uncertainty. |

## References

[1] [AWS, “What is Retrieval-Augmented Generation (RAG)?”](https://aws.amazon.com/what-is/retrieval-augmented-generation/)

[2] [Transportation Research Board, “Guide for Integrating Digital Construction Inspection Technologies”](https://rip.trb.org/View/2381754)

[3] [OverIT, “Increasing the lifetime of infrastructure with Digital Inspection Reports”](https://www.overit.ai/blog/increasing-the-lifetime-of-infrastructure-with-digital-inspection-reports/)

[4] [Federal Highway Administration, “Transportation Management Center Video Recording and Archiving Best General Practices”](https://ops.fhwa.dot.gov/publications/fhwahop16033/chap7.htm)

[5] [UK Information Commissioner’s Office, “Video surveillance data protection principles”](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/cctv-and-video-surveillance/guidance-on-video-surveillance-including-cctv/how-can-we-comply-with-the-data-protection-principles-when-using-surveillance-systems/)
