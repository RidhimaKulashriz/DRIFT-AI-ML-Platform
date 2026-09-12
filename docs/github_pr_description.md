## DRIFT — AI infrastructure inspection platform

This pull request delivers the industry-readiness hardening pass for DRIFT (Drone Based Reconnaissance & Infrastructure Fault Tracking), covering the PDF brief’s AI-assisted inspection, geospatial mission context, ZeroError prioritization, evidence review, repair estimation, alerts, reports, and no-hardware simulator workflow.

### Included

- React 19 industrial operations console with Admin, Engineer, and Citizen workspaces.
- Node.js/tRPC API with Drizzle/MySQL persistence for assets, missions, telemetry, evidence, defects, alerts, estimates, reports, reviews, and audit state.
- Authenticated hardware-ingestion boundary for operator-approved telemetry and media bridges with strict coordinate/timestamp validation, MIME allowlisting, base64 checks, bounded rate limiting, and safe error paths.
- PX4/MAVLink companion-computer integration guide with explicit safe boundary: DRIFT ingests approved telemetry/media and never arms or launches an aircraft.
- Provider-backed Google Maps workbench with real coordinate markers, telemetry traces, evidence focus, attribution guidance, and explicit provider-failure fallback.
- Real-image simulator evidence with persisted source, license, author, reference URL, and generated-versus-reference classification so demo media cannot be mistaken for live inspection evidence.
- Pluggable ML adapter supporting a configured production CV endpoint with strict response validation, model/version/confidence/annotation provenance, timeout handling, and safe local fallback.
- Structured ZeroError AI decision support that remains explainable and always requires human engineer review.
- Evidence upload flow that hashes media, persists S3-backed records, invokes inference, links resulting defects, and exposes provenance in the Evidence Vault.
- Repeatable bridge verification harness, Vitest coverage, production build validation, and browser-verified simulator/evidence flows.

### Validation

- TypeScript validation: passed.
- Vitest suite: 17 checks passed.
- Native bridge-route harness: passed authentication and invalid-input checks.
- Production build: passed.
- Browser verification: populated Evidence Vault confirmed source, coordinates, provenance classification, attribution, and reference link.

### Operational configuration

Configure map, hardware bridge, and optional production-CV secrets through the managed environment secret manager. Without a configured drone bridge, DRIFT remains in an explicitly labeled simulator mode. Before live operations, validate the exact aircraft, flight controller, camera/media bridge, network path, credentials, geofence, and operator safety procedures on-site.
