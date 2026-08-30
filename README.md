# DRIFT — Drone Based Reconnaissance & Infrastructure Fault Tracking

> **Public interactive demo:** [Open DRIFT](https://drift-ai-ml-platform.vercel.app/)

DRIFT is an AI-assisted infrastructure-inspection platform for reviewing drone and operator-captured evidence, prioritising defects, correlating findings with coordinates and telemetry, generating audit-ready reports, and supporting accountable engineer review. The public demo is designed to be explored without sign-in.

## Interactive demo

Use the links below to open each live workspace directly.

| Workspace | Open live demo |
| --- | --- |
| Operations overview | [Open Operations](https://drift-ai-ml-platform.vercel.app/?workspace=operations) |
| Defect control | [Open Defect Control](https://drift-ai-ml-platform.vercel.app/?workspace=defects) |
| Evidence vault | [Open Evidence Vault](https://drift-ai-ml-platform.vercel.app/?workspace=evidence) |
| Reports and PDF generation | [Open Reports](https://drift-ai-ml-platform.vercel.app/?workspace=reports) |
| Hardware bridge boundary | [Open Hardware Bridge](https://drift-ai-ml-platform.vercel.app/?workspace=hardware) |

### Recommended public demo flow

Open **Operations**, select **RUN DEMO**, and wait for the simulator mission to persist. The mission creates telemetry, evidence-linked findings, severity scores, repair estimates, and maintenance alerts. Open **Defect Control** to inspect findings and map markers, then use **Evidence Vault** to review stored media. Finally, open **Reports**, choose **AI NARRATIVE** or **GENERATE PDF REPORT**, and use **OPEN PDF** to view the generated report.

The map uses Google Maps when the configured provider is available. If the provider is unavailable because of key restrictions or billing configuration, the dashboard automatically presents a visible OpenStreetMap fallback so coordinate context remains usable. Marker buttons remain available for selecting findings.

## Verified production endpoints

| Endpoint | Link |
| --- | --- |
| Frontend | [drift-ai-ml-platform.vercel.app](https://drift-ai-ml-platform.vercel.app/) |
| Render backend | [drift-node-api.onrender.com](https://drift-node-api.onrender.com/) |
| Live overview API | [Open overview response](https://drift-node-api.onrender.com/api/trpc/drift.overview) |
| Latest verified PDF attachment | [Open verified report](https://drift-node-api.onrender.com/api/drift/attachments/db:1b2b3c0b-e1fa-44f5-9e18-6bb0382685ec) |
| Google Maps credentials | [Open Google Cloud Maps credentials](https://console.cloud.google.com/google/maps-apis/credentials) |

The report endpoint above is a durable PostgreSQL-backed attachment URL served by the Node backend. It is included as a verification sample; newly generated reports expose their own backend URL in the Reports workspace.

## What is implemented

The application includes a React dashboard, a Node.js/tRPC API, PostgreSQL-compatible Drizzle persistence, durable database-backed evidence and report attachments, simulator mode, a validated hardware-ingestion boundary, explainable defect-inference adapters, geospatial mission context, severity and repair rules, AI decision-support narratives, and engineer-review state.

The public demo permits monitoring, simulator execution, report generation, map exploration, and report downloads without requiring sign-in. Authentication remains an integration boundary for protected operational actions such as engineer approvals, original-media uploads, and hardware-bridge operations.

## Safety boundary

> DRIFT never arms, launches, or controls an aircraft.

The hardware layer is an authenticated ingestion adapter for operator-approved telemetry and media bridges. Configure a compatible endpoint through `DRIFT_HARDWARE_ENDPOINT`, validate payloads through the integration route, and complete an on-site integration test before operational use. Simulator mode does not issue flight commands.

## Local development

```bash
pnpm install
pnpm db:push
pnpm dev
pnpm check
pnpm test
pnpm build
```

Copy `.env.example` only when operating an external hardware or computer-vision service. Do not commit environment files, API keys, database URLs, or provider credentials.

## Integration configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `DRIFT_HARDWARE_ENDPOINT` | No | Operator-approved HTTP, MAVLink bridge, or RTSP media endpoint. |
| `ML_INFERENCE_URL` | No | Optional external vision-service endpoint. |
| `VITE_BACKEND_URL` | Production | Public Node API origin used by the frontend for tRPC and stored assets. |
| `VITE_GOOGLE_MAPS_API_KEY` | Optional | Browser-restricted Google Maps JavaScript API key. OpenStreetMap fallback remains available. |

Configure production secrets through Vercel and Render environment settings rather than committing them to GitHub. Restrict browser map keys by allowed domains and API product before using them in production.

## Deployment

The frontend is deployed on Vercel and the Node API is deployed on Render. GitHub pushes to `main` trigger the configured deployment pipelines.

- [GitHub repository](https://github.com/RidhimaKulashriz/DRIFT-AI-ML-Platform)
- [Latest production fix commit](https://github.com/RidhimaKulashriz/DRIFT-AI-ML-Platform/commit/4197d6e)
- [Render service definition](render.yaml)
- [Deployment documentation](docs/deployment.md)

## Test coverage

`pnpm test` covers ZeroError scoring, simulator-safe hardware fallback, telemetry validation, inference adapters, authentication boundaries, and report-generation behavior. Run `pnpm check` and `pnpm build` before pushing changes. The CI workflow is defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

See [`docs/hardware_adapter_contract.md`](docs/hardware_adapter_contract.md) for the authenticated telemetry payload contract, media-ingestion boundary, and safe operator integration-test sequence.

## System Architecture
                         ┌─────────────────────┐
                         │       USER          │
                         │ Engineer / Operator  │
                         └──────────┬──────────┘
                                    │
                                    ▼
                  ┌─────────────────────────────────┐
                  │       REACT DASHBOARD            │
                  │                                  │
                  │ Operations │ Defects │ Evidence │
                  │ Maps       │ Reports  │ Alerts   │
                  └────────────────┬────────────────┘
                                   │
                              tRPC / HTTP
                                   │
                                   ▼
                  ┌─────────────────────────────────┐
                  │       NODE.JS + tRPC API         │
                  │                                  │
                  │ Mission Management               │
                  │ Telemetry Validation             │
                  │ Finding Management               │
                  │ Auth Boundaries                  │
                  │ Report Generation                │
                  └───────┬──────────────┬──────────┘
                          │              │
              ┌───────────▼──────┐   ┌──▼────────────────┐
              │   AI / ML ENGINE │   │ POSTGRESQL        │
              │                  │   │ + DRIZZLE ORM     │
              │ Computer Vision  │   │                  │
              │ Defect Detection │   │ Missions         │
              │ Classification   │   │ Findings         │
              │ Severity         │   │ Telemetry        │
              │ Repair Estimate  │   │ Evidence         │
              │ AI Narrative     │   │ Reports          │
              └────────┬─────────┘   └───────────────────┘
                       │
                       ▼
              ┌────────────────────┐
              │ DECISION ENGINE    │
              │                    │
              │ Severity           │
              │ Priority           │
              │ Maintenance Alert  │
              │ Repair Estimate     │
              └─────────┬──────────┘
                        │
                        ▼
              ┌────────────────────┐
              │ GEO-SPATIAL ENGINE │
              │                    │
              │ GPS + Telemetry    │
              │ Maps               │
              │ Defect Markers     │
              └─────────┬──────────┘
                        │
                        ▼
              ┌────────────────────┐
              │ REPORTING ENGINE   │
              │                    │
              │ AI Narrative       │
              │ Audit Report       │
              │ PDF Generation     │
              └────────────────────┘


     ───────────── EXTERNAL INPUT ─────────────

       ┌─────────────────────────────────────┐
       │ DRONE / OPERATOR HARDWARE            │
       │                                     │
       │ Camera │ Telemetry │ RTSP │ MAVLink │
       └──────────────────┬──────────────────┘
                          │
                          ▼
                ┌───────────────────┐
                │ HARDWARE ADAPTER  │
                │ AUTHENTICATED     │
                │ INGESTION         │
                └─────────┬─────────┘
                          │
                          └──────────────► BACKEND

## References

[1]: https://drift-ai-ml-platform.vercel.app/ "DRIFT public interactive demo"
[2]: https://drift-node-api.onrender.com/ "DRIFT Render Node API"
[3]: https://github.com/RidhimaKulashriz/DRIFT-AI-ML-Platform "DRIFT GitHub repository"
[4]: https://console.cloud.google.com/google/maps-apis/credentials "Google Cloud Maps credentials"
