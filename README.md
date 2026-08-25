# DRIFT — Drone Based Reconnaissance & Infrastructure Fault Tracking

DRIFT is a full-stack infrastructure-inspection platform implementing the attached project brief: AI-assisted drone evidence review, defect prioritization, geospatial mission context, engineer overrides, repair estimates, audit history, and report-ready decision support.

## What is implemented

The application includes a React dashboard, a Node.js/tRPC API, MySQL/Drizzle persistence, secure S3-backed evidence storage, deterministic simulator mode, a configurable hardware-ingestion adapter, explainable vision-inference adapter, and server-side ZeroError AI decision support. Demo mode creates mission telemetry, defects, severity inputs, repair estimates, alerts, and report records without requiring a drone.

## Hardware boundary

DRIFT never arms, launches, or controls an aircraft. The hardware layer is a validated ingestion adapter for operator-approved telemetry and media bridges. Configure a compatible endpoint through `DRIFT_HARDWARE_ENDPOINT`, validate payloads through the integration route, and conduct an on-site integration test before any operational use.

## Development

```bash
pnpm install
pnpm db:push
pnpm dev
pnpm test
```

Copy `.env.example` only if you are operating an external hardware or CV service. Platform database, storage, authentication, map, and AI credentials are injected in the managed environment.

## Integration configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `DRIFT_HARDWARE_ENDPOINT` | No | The operator-approved HTTP, MAVLink bridge, or RTSP media endpoint used to ingest compatible telemetry or camera media. DRIFT remains in safe simulator mode when omitted. |
| `ML_INFERENCE_URL` | No | A compatible external vision service endpoint. The built-in explainable local adapter remains active when omitted. |

Configure production secret values through the hosting environment’s secret manager rather than committing environment files to the repository.

## Deployment

The repository is designed for the managed deployment environment. Create a project checkpoint after validation and use the Publish control in the project interface. The backend is Node-only and defaults to simulator fallback when no hardware endpoint is configured.

## Test coverage

`pnpm test` covers ZeroError scoring, simulator-safe hardware fallback, telemetry validation, and inference adapter behavior. Extend the documented payload-contract tests before connecting a specific drone bridge.

See [`docs/hardware_adapter_contract.md`](docs/hardware_adapter_contract.md) for the authenticated telemetry payload contract, media-ingestion boundary, and safe operator integration-test sequence. GitHub Actions runs type and test validation on pushes and pull requests through `.github/workflows/ci.yml`.
