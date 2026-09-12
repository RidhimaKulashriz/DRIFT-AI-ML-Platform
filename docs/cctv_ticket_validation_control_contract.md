# DRIFT CCTV-to-Accountability Control Contract

## Purpose

This contract converts the proposed **CCTV detection → contractor ticket → closure proof → drone verification** workflow into an accountable control plane for DRIFT. It applies only to authorized project cameras, authenticated project users, and original evidence supplied under a recorded purpose, retention policy, and access model. It does not treat public camera feeds, demo imagery, or open-web material as project evidence.

> A CCTV candidate is a **decision-support signal**, not a defect finding, a repair order, a malware diagnosis, or a flight command. A named engineer must review the evidence and authorize the next business step.

## Non-Negotiable Boundaries

| Requested behavior | DRIFT implementation boundary |
|---|---|
| Periodic CCTV frame analysis | Only an approved on-site or project-controlled ingestion bridge may submit frame-derived candidate metadata. DRIFT does not fetch, scrape, or silently record third-party CCTV streams. |
| High-confidence automatic ticket | A high-confidence candidate can be queued for rapid engineer review, but a ticket is created only after evidence, asset/location, applicable route, and verification criterion are present. |
| Malware or firmware scanner | DRIFT can record an authorized camera/bridge health observation. It must not claim malware detection, firmware checksum validation, or network-intrusion analysis until a named security product supplies the relevant signed telemetry. |
| Automatic drone dispatch | Never permitted. A closure request may produce a **UAV follow-up recommendation** with candidate coordinates and required evidence. A named operator must independently complete legal, airspace, aircraft, site, and safety checks before preparing or flying a mission. |
| Contractor closure | A contractor can request closure with original proof. This is never “fixed” until an engineer records a follow-up decision based on independent evidence. |

## 1. Authorized Camera Registration

Before any automated analysis is accepted, an administrator registers a `cameraSource` with the project, accountable organization, asset/zone relation, permitted purpose, retention window, access roles, source bridge identity, and optional no-audio rule. The bridge must identify the camera source on every submission and retain enough integrity data to associate a candidate with its original frame or clip reference.

Video imagery that identifies people can constitute personal data. DRIFT therefore requires a documented purpose, access boundary, security controls, and retention rule before accepting camera material. The data-controller guidance used as a design reference calls for a clear purpose, lawfulness, necessity, proportionality, security, retention, and transparency assessment. [1]

## 2. Candidate Validation Pipeline

Each candidate is stored as an immutable observation with a validation state. The platform never transforms a model score into an asserted crack, structural failure, tamper event, or malware incident without the associated source and human review.

| Stage | Required input | Result |
|---|---|---|
| Authorization gate | Active camera registration, permitted purpose, non-expired retention policy, valid bridge identity | Reject if any condition is missing. |
| Source integrity | Camera ID, capture timestamp, zone-level location, frame/clip reference, hash when available | Mark incomplete rather than inventing evidence. |
| Quality gate | Blur, exposure, rain/fog, camera movement, occlusion, or scene-change indicators from the approved edge model | Lower confidence or require manual review; do not silently suppress the raw record. |
| Temporal consistency | At least the policy-required consecutive observations with matching zone and candidate class | Keep as `needs_review` until the rule is met. |
| Duplicate/routing gate | Existing open candidate/ticket for the same asset or approved camera zone, issue family, and configured time window | Link or update the existing case; never create a duplicate ticket by default. |
| Engineer review | Original/reference media, location support, asset mapping, impact input, and policy evidence | Mark as dismissed, needs site review, or eligible for a real maintenance case. |

The confidence threshold is versioned policy metadata, not a universal safety guarantee. For example, a project may configure `>=80` as expedited review and `50–79` as ordinary review, but neither threshold alone authorizes a ticket, closure, payment, outage declaration, or drone flight.

## 3. Ticket Creation and Routing

A real contractor ticket requires an authenticated project record. Its minimum contract is: project/asset/site reference, issue class, candidate/evidence links, DSI or insufficient-evidence result, title/scope, requested verification criterion, approved ownership route, assigned real contractor, applicable SLA rule, and audit actor/timestamp.

If location, ownership, contractor, SLA, or evidence is absent or ambiguous, DRIFT keeps the request in an **unresolved** state. It must never fabricate the owner, send a ticket to a guessed contractor, or claim a notification was delivered.

Routing separates civil/structural, security, and IT domains through administrator-maintained rules. A multiple-match result stays unresolved and is surfaced to the engineer; an approved routing decision is required before any handoff package is prepared.

## 4. Contractor and Engineer State Machine

| Actor | Allowed action | Required proof / guard |
|---|---|---|
| Engineer | Create or approve a case | Evidence, route, verification criterion, and appropriate role. |
| Assigned contractor | Accept ticket; mark in progress; add timestamped note | Ticket assignment and contractor role. |
| Assigned contractor | Upload completion proof; request closure | Original proof reference required; `request_closure` does not close the ticket. |
| Engineer | Verify fixed; mark needs rework; cannot verify | Independent follow-up evidence and a signed review note. |
| Administrator | Change registry/SLA/routing policy | Named organization/admin role and audit log. |

Every transition records an append-only audit event: actor, UTC time, prior state, next state, reason, evidence references, and applicable policy version. Contractor scorecards may summarize verified, reopened, and time-to-response metrics only after sufficient real records exist; they must not manufacture ratings.

## 5. Closure Re-Verification and UAV Recommendation

On closure request, DRIFT can generate a **prepared follow-up recommendation** containing the asset/zone, unresolved risk factors, evidence gap, suggested capture objective, and the engineer who must approve it. It does not connect this event to an arm, takeoff, navigation, payload, or flight-control command.

An authorized operator supplies any follow-up UAV capture through the existing receive-only bridge. The engineer then chooses one of three explicit outcomes: `fixed`, `needs_rework`, or `cannot_verify`. A `needs_rework` result can return the ticket to the assigned contractor and flag the SLA/escalation policy for review; it does not autonomously notify external parties unless an approved notification connector and policy are configured.

The design follows a human-authorization posture because video-surveillance systems can be intrusive, and regulator guidance emphasizes lawful, necessary, proportionate, transparent use with accountable governance. [1] [2]

## 6. Buttons and UI Truthfulness

Every visible action must invoke a real role-checked procedure or be disabled with its dependency shown. Examples include `Accept ticket`, `Mark in progress`, `Add note`, `Upload proof`, `Request closure`, `Review candidate`, `Prepare UAV follow-up`, `Verify fixed`, `Needs rework`, `Cannot verify`, and `Prepare handoff`.

Until PostgreSQL migration, external identity, storage, camera authorization, and real project records are active, these controls remain visibly disabled or return a configuration-required state. They must not simulate assignment, contractor acceptance, delivery, camera access, malware detection, flight, repair, or verification.

## References

[1] [Information Commissioner’s Office, *Video surveillance (including guidance for organisations using CCTV)*](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/cctv-and-video-surveillance/guidance-on-video-surveillance-including-cctv/)

[2] [Data Protection Commission, *Guidance on the use of CCTV*](https://www.dataprotection.ie/en/dpc-guidance/guidance-on-the-use-of-cctv)
