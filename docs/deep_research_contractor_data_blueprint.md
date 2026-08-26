# DRIFT Deep Research: Contractor Data, DSI, and Evidence Blueprint

## Research Purpose

This document translates research on digital infrastructure inspection, image-based decision support, CCTV governance, and retrieval-augmented generation into an implementation blueprint for DRIFT. It does not prescribe engineering standards or override site, contract, privacy, aviation, or safety rules. Its purpose is to define what data DRIFT must retain so a contractor’s maintenance decision can be reviewed, repeated, and challenged.

## Core Finding: Data Acquisition Is Not the Decision

The relevant inspection workflow is a chain: **data acquisition → data processing → maintenance decision-making → work-order planning → closure verification**. Image-based inspection research identifies a recurring gap between visual detection and the user-facing decision process; a system needs both the model output and an interface that lets practitioners evaluate supporting information.[1] DRIFT therefore treats every CV or AI output as a candidate with source, quality, uncertainty, and human-review status rather than as a completed maintenance decision.

The Transportation Research Board similarly frames digital inspection as a lifecycle integration problem involving interoperability, training, and achievable implementation milestones, not merely tool adoption.[2] Contractor workflows must consequently include who can create, review, assign, close, and verify each record.

| Data layer | Why it is required | Minimum DRIFT record |
|---|---|---|
| Asset identity | A visual candidate cannot be acted on without knowing which asset/segment it concerns | Asset ID, asset type, owner, corridor/zone, geometry, criticality, current state |
| Capture provenance | A reviewer needs to know how and when evidence was obtained | Source type, original file/hash or secure URI, capture time, collector/camera/UAV identity, camera zone, location confidence |
| Observation | Detection must be distinguishable from field fact | Candidate type, model/version, confidence, annotation, quality gate, occlusion/coverage limits, observed-versus-inferred tags |
| Decision context | Priority depends on more than model confidence | Asset criticality, safety/traffic/operations impact, exposure, access constraint, repeat history, contractor SLA/due date |
| Work execution | A ticket needs a real accountable party, not a simulated name | Authenticated contractor organization, individual owner, scope, status, due date, closure claim, proof references |
| Verification | Closure does not prove risk reduction | Original record, follow-up evidence, location/zone match, comparable quality, engineer identity, outcome and note |

## DSI: Transparent Multi-Criteria Priority, Not an Opaque Score

The World Bank’s Infrastructure Prioritization Framework describes multi-criteria decision support and emphasizes that criteria, weights, and sensitivity analysis should be set transparently and be open to review.[3] DRIFT’s DSI must follow that principle. It must show its inputs, never conceal an automatic pass/fail decision, and permit project-specific thresholds approved by the responsible organization.

| DSI factor | Data source | Example scale | Guardrail |
|---|---|---|---|
| Evidence quality | Blur/coverage/occlusion, source chain, capture integrity | 0–100 | Low quality reduces confidence; it must not raise severity by itself |
| Location confidence | GPS precision, verified asset match, registered CCTV zone, operator confirmation | 0–100 | Camera-zone-only records are not represented as exact GPS |
| Candidate confidence | CV score or engineer observation confidence | 0–100 | Model confidence is not a probability of failure or repair need |
| Asset consequence | Contractor/owner-approved criticality, traffic/service/safety impact | 1–5 | Weight is visible and project-configurable |
| Exposure and urgency | Access restrictions, repeat count, observed spread, reported operational impact | 0–100 | Inputs must be documented; no invented traffic or safety measures |
| Verification state | New, contractor-closed, follow-up pending, fixed, rework, cannot verify | Categorical | A closed ticket is not treated as fixed |

The first implementation should produce an **advisory priority band** and a factor breakdown. It should display `insufficient evidence` whenever mandatory evidence-quality, location, or authorization requirements fail. An engineer remains responsible for acceptance, escalation, work release, and final verification.

## Ticket Closure Verification Data

Contractor ticket closure must be divided into a contractor claim and a verification result. This distinction keeps the system useful in real projects without fabricating contractor performance or repair completion.

| Status | Meaning | Required record |
|---|---|---|
| `open` | Candidate has been accepted for contractor action | Evidence links, DSI factor breakdown, scope, project/asset zone |
| `assigned` | A real contractor organization and authenticated owner have accepted responsibility | Contractor identity, assignee, due date, work-order reference |
| `contractor_closed` | Contractor reports work is complete | Closure note, date/time, proof image/video/document references, limitations |
| `verification_pending` | Follow-up inspection target is set | Required capture zone, comparison criterion, preferred source, verifier |
| `fixed` | Engineer found follow-up evidence supports the stated correction | Follow-up evidence links, comparison outcome, engineer identity/note |
| `needs_rework` | Follow-up does not support closure or issue persists | Rework reason, reopening date, revised target |
| `cannot_verify` | Evidence, access, site conditions, or safety do not permit a conclusion | Reason, next safe verification step; no silent closure |

## CCTV and Traffic Video Governance

Traffic CCTV can provide a broad-coverage trigger for a localized inspection, but it is privacy-sensitive. FHWA guidance on transportation video policies describes purpose restrictions, written sharing agreements, avoiding unnecessary personal identifier collection, secure restricted access, and retaining recorded material only for the minimum time necessary.[4] The UK ICO also emphasizes lawful basis, data minimization, secure storage, purpose limitation, transparency, and high-risk impact assessment considerations for surveillance systems.[5]

| CCTV intake field | Reason |
|---|---|
| Source owner and authorized purpose | Proves the contractor is entitled to ingest footage for infrastructure triage |
| Camera identifier and registered coverage zone | Localizes the issue without inventing coordinates from a video frame |
| Retention deadline and access classification | Supports deletion/withholding from future retrieval when footage expires |
| Clip/frame range and source integrity reference | Identifies what was actually reviewed |
| Privacy processing declaration | States whether audio is disabled, identifiers are redacted, and viewing is limited |
| Candidate localization confidence | Distinguishes a known camera zone from a precise field coordinate |
| Engineer disposition | Captures reject, ground check, or UAV-preflight recommendation |

DRIFT must not use CCTV for personal identification, behavioural surveillance, automatic enforcement, or drone command. It should use authorized footage to create a review candidate and only prepare an operator-controlled UAV preflight recommendation after an authorized person has reviewed the localization.

## RAG Knowledge Base Requirements

RAG supplies the LLM with retrieved authoritative passages before answer generation. It can improve currentness and source attribution but only if retrieval sources and permission boundaries are controlled.[6] DRIFT should start with project-controlled documents, not open web search.

| Allowed first-stage source | Retrieval metadata |
|---|---|
| Approved inspection method statement | Project, version, effective date, approver, permitted roles, section/page |
| Client-approved technical specification excerpt | Contract/project scope, licence/use permission, version, section/page |
| Issued drawing or asset register excerpt | Asset/zone scope, revision, document control ID |
| Accepted prior inspection report | Asset, date, engineer sign-off state, evidence links |
| Ticket/work-order procedure | Project, contractor role, SLA, approved status |
| Evidence metadata and review notes | Evidence source, provenance class, quality state, permission scope |

Each answer must return: direct response; observed facts; advisory inference; uncertainty/refusal when evidence is missing; source title/version/section; and a retrieval-run identifier. It must never claim compliance, structural safety, payment entitlement, repair completion, or flight approval unless a properly authorized human record explicitly supports that status.

## Prototype Visual Policy

Licensed or generated visual references can explain the DRIFT workflow, but they must carry a persistent label such as `PROTOTYPE REFERENCE — NOT PROJECT EVIDENCE`. Public defect-dataset images may demonstrate UI functionality only when their licence, source, and non-field/non-drone classification remain visible. Real contractor images, CCTV clips, closure proof, or UAV captures must be original permitted uploads tied to the actual project record.

## Public Data Catalogue for Prototype and Model Evaluation

Public data can help validate ingestion, mapping, and model-evaluation workflows, but it must not be presented as a contractor’s asset register or project evidence. The following sources are viable references because their scope and limitations can be displayed directly in DRIFT.

| Source | Verified data capability | Suitable DRIFT use | Prohibited DRIFT use |
|---|---|---|---|
| National Bridge Inventory (NBI) | Public U.S. bridge inventory with location, description, classification, and general condition; annual updates and a documented coding guide.[7] | Optional jurisdiction-specific asset import prototype; research on asset-table mappings | Live condition certification, contractor assignment, or evidence for any non-NBI project |
| FHWA InfoBridge | Filtered NBI records, multi-year selection, bridge performance history and data export interfaces.[8] | Explore a historical condition-data connector design and compare asset-data fields | Automated condition trend claim for an unverified site or asset |
| RDD2022 / RoadDamageDetector | International road-damage research dataset with annotations; the repository describes categories and country-specific data, including an India subset.[9] | Offline model evaluation, taxonomy alignment, and clearly labelled dataset visuals after licence/terms review | Field evidence, real repair ticket closure proof, or location-specific claims without original project capture |
| Iowa DOT traffic-camera inventory | Public, authoritative ITS CCTV registry with camera locations, static image URLs, and motion-video URLs where available; listed CC BY 4.0.[10] | Demonstrate a camera-registry adapter and governed source metadata | Bulk surveillance ingestion, personal identification, or reusing video outside the stated terms/authorized purpose |

The initial importer should work from a small approved project-scoped extract, retain source URL/version/import date/licence, and map into `external_reference` records. It must never co-mingle these references with `field_evidence` or `contractor_ticket` records.

## India-Relevant Research Data

RDD2022 provides a useful road-damage research reference because it includes an India subset covering local roads, state highways, and national highways in Delhi, Gurugram, and areas of Haryana, while retaining a four-class taxonomy for longitudinal crack, transverse crack, alligator crack, and pothole.[11] The paper also reports that performance degraded when models trained on one country were applied elsewhere, reinforcing DRIFT’s requirement to record source context and prevent generic model scores from being treated as field truth.[11]

DATS_2022 is a separate Indian traffic-scene dataset with more than 10,000 images and 45 object classes, captured across rural and urban contexts in Maharashtra. Its imagery and annotations can help test traffic-scene localization and privacy-safe pre-processing concepts, but it is not road-defect evidence and must not be used to create contractor tickets.[12]

| Dataset | Appropriate DRIFT research use | Explicit limitation |
|---|---|---|
| RDD2022 India subset | Compare road-damage labels, test country-aware training/evaluation splits, design a permitted training-data registry | Research imagery has no authority to establish an actual contractor site defect or repair completion |
| RDD2022 China drone subset | Compare aerial versus vehicle-view data acquisition metadata and assess visual domain shift | It is a research subset and cannot represent an operator’s original UAV evidence |
| DATS_2022 | Test detection of traffic-scene classes and assess CCTV/roadside-video input quality conditions | It is not a defect/structural condition dataset; do not infer asset damage from its labels |

## Initial Data Collection Checklist for a Contractor Pilot

| Pilot input | Minimum required | Why it matters |
|---|---|---|
| Asset register | Stable asset ID, type, owner, zone/geometry, criticality | Enables accountable routing and avoids ambiguous findings |
| Contractor directory | Organization and users from authenticated project data | Prevents fictional assignments and creates an accountable audit trail |
| Ticket taxonomy | Defect types, priority definitions, required closure proof, SLAs | Aligns DSI outputs with contractual workflow |
| Approved documents | Current method statements, selected specifications, work-order process | Establishes a permissioned RAG corpus |
| Camera registry | Owner, purpose, zones, retention/access terms, feed method | Allows lawful CCTV intake and localization |
| UAV operating process | Operator, equipment, site/airspace approval process, capture checklist | Keeps DRIFT advisory and operator-controlled |
| Evidence storage policy | Object storage, retention, hash/provenance, access rules | Supports reviewable closure verification |

## References

[1] [Landwehr et al., “Design Knowledge for Deep-Learning-Enabled Image-Based Decision Support Systems”](https://pmc.ncbi.nlm.nih.gov/articles/PMC8973684/)

[2] [Transportation Research Board, “Guide for Integrating Digital Construction Inspection Technologies”](https://rip.trb.org/View/2381754)

[3] [World Bank, “Prioritizing Infrastructure Investment: A Framework for Government Decision Making”](https://openknowledge.worldbank.org/entities/publication/d167b0f4-5075-51a7-8af1-ad61053905a1)

[4] [Federal Highway Administration, “Transportation Management Center Video Recording and Archiving Best General Practices”](https://ops.fhwa.dot.gov/publications/fhwahop16033/chap7.htm)

[5] [UK Information Commissioner’s Office, “Video surveillance data protection principles”](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/cctv-and-video-surveillance/guidance-on-video-surveillance-including-cctv/how-can-we-comply-with-the-data-protection-principles-when-using-surveillance-systems/)

[6] [AWS, “What is Retrieval-Augmented Generation (RAG)?”](https://aws.amazon.com/what-is/retrieval-augmented-generation/)

[7] [USDOT/BTS, “National Bridge Inventory”](https://geodata.bts.gov/datasets/usdot::national-bridge-inventory/about)

[8] [Federal Highway Administration, “InfoBridge Data”](https://infobridge.fhwa.dot.gov/data)

[9] [Sekilab, “RoadDamageDetector / RDD2022”](https://github.com/sekilab/RoadDamageDetector)

[10] [Iowa Department of Transportation, “Traffic Cameras”](https://data.iowadot.gov/datasets/IowaDOT::traffic-cameras-3/about)

[11] [Arya et al., “RDD2022: A multi-national image dataset for automatic Road Damage Detection”](https://arxiv.org/pdf/2209.08538)

[12] [Paranjape and Naik, “DATS_2022: A versatile Indian dataset for object detection in unstructured traffic conditions”](https://pmc.ncbi.nlm.nih.gov/articles/PMC9309657/)
