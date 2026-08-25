# DRIFT Security and Lifecycle Audit

## Scope

This audit covers the authenticated bridge endpoints, tRPC procedures, role authorization, evidence storage, inference review state, report state, validation, rate limiting, and audit events in the current single-operator DRIFT deployment.

## Controls verified

| Area | Current control | Result |
|---|---|---|
| Bridge authentication | Bearer or `x-drift-ingest-token`, constant-time comparison, managed secret | Pass |
| Bridge abuse control | Per-token 120-request/minute in-memory rate window | Pass for single instance; use shared limiter for multi-instance deployment |
| Input validation | Geographic bounds, finite telemetry values, timestamps, MIME allow-list, base64 checks, 50 MB body limit | Pass |
| Object storage | Evidence bytes stored in managed object storage; database stores references and provenance | Pass |
| Role authorization | Server-side admin/engineer/citizen checks and protected review operations | Pass |
| AI safety | Model response schema validation, confidence calibration, quality-gate escalation, mandatory review | Pass |
| Auditability | Telemetry, evidence, inference, review, and simulator actions generate audit records | Pass |
| Lifecycle | Evidence remains reviewable; defects carry pending review state; reports carry sign-off state | Pass for current workflows |

## Tenant boundary finding

The current schema has user ownership and role authorization but does not yet define an organisation or tenant identifier on every mission, asset, evidence, defect, report, alert, review, and telemetry row. This is acceptable for the current single-operator deployment and simulator, but it is **not sufficient for a shared multi-organisation SaaS deployment**. Before onboarding multiple independent customers, add an organisation table, membership table, organisation IDs on all operational rows, and server-side scoped queries with cross-tenant regression tests.

## Operational release gate

DRIFT is an inspection decision-support platform. It must not be used as the sole basis for structural certification, traffic closure, flight safety, or maintenance release. A qualified engineer or inspector must review the source evidence, quality gate, uncertainty, repeat-pass context, and report sign-off. Production deployments must replace the in-memory rate window with a shared limiter and configure a production CV service calibrated on held-out data for each domain, sensor, and capture zone.
