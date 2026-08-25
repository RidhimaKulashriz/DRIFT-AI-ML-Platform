# DRIFT Environment Template

Do not commit an `.env` file. Configure sensitive values through the deployment environment’s secret manager.

| Setting | Required | Example format | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Managed | Platform-injected | Persistent MySQL/TiDB mission, defect, alert, audit, and report records. |
| `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` | Managed | Platform-injected | Secure server-side AI, storage, map, and notification integrations. |
| `VITE_FRONTEND_FORGE_API_URL` / `VITE_FRONTEND_FORGE_API_KEY` | Managed | Platform-injected | Provider-backed Google Maps JavaScript loading through the managed frontend proxy. |
| `DRIFT_HARDWARE_ENDPOINT` | Optional | `https://bridge.example.org/health` | Operator-approved health endpoint for a compatible telemetry or media bridge. When omitted, DRIFT stays in simulator mode. |
| `DRIFT_INGEST_TOKEN` | Required for live bridge ingress | Long random bearer token | Shared secret accepted only by `/api/drift/telemetry` and `/api/drift/evidence`; rotate through the secret manager. |
| `ML_INFERENCE_URL` | Optional | `https://vision.example.org/infer` | Compatible external vision inference endpoint for non-demo photo uploads. |
| `ML_INFERENCE_TOKEN` | Optional | Long random bearer token | Bearer credential for the external vision inference endpoint. |

The hardware bridge must be set only after bench validation and documented operator approval. DRIFT does not send any aircraft control commands. The map provider’s attribution and controls must remain visible; consult `docs/map_provider.md` before public deployment. A missing external CV service does not silently become a live claim: DRIFT labels the deterministic path as fallback or simulator inference and requires human review.
