# DRIFT — Infrastructure Inspection and Accountability Platform

DRIFT is a full-stack inspection platform for collecting infrastructure evidence, correlating findings with location and telemetry, prioritising defects, and producing reviewable maintenance reports. It supports simulator data, operator-approved UAV or hardware ingestion, live annotated frames, optional external ML inference, map-based review, engineer accountability, and contractor handoff workflows.

> **Safety boundary:** DRIFT does not arm, launch, or control an aircraft. The hardware integration is an authenticated ingestion boundary for telemetry and media supplied by an operator-approved bridge.

## Live deployment

The repository is configured for a split deployment:

- **Frontend and application server:** [DRIFT production deployment](https://drift-ai-ml-platform.vercel.app/)
- **Node/tRPC API:** [Render API](https://drift-node-api.onrender.com/)
- **Repository:** [RidhimaKulashriz/DRIFT-AI-ML-Platform](https://github.com/RidhimaKulashriz/DRIFT-AI-ML-Platform)

The frontend uses the Render API origin in production. The current frontend fallback is `https://drift-node-api.onrender.com`; set `VITE_BACKEND_URL` explicitly when deploying another environment.

## What the application does

The single-page DRIFT console provides the following workspaces:

| Workspace | Purpose |
| --- | --- |
| **Operations** | Mission overview, telemetry, alerts, simulator runs, and overall inspection status. |
| **Defect control** | Filter and review findings by severity, type, domain, mission, asset, status, and engineer-review state. |
| **Evidence vault** | Inspect stored photos, videos, provenance, coordinates, timestamps, quality state, and finding associations. |
| **Reports** | Generate AI-assisted narratives and audit-oriented PDF reports with evidence and interpretation limits. |
| **Contractors** | Review readiness, work profiles, RAG handoff candidates, and controlled maintenance workflows. |
| **Rail monitoring** | Review rail-focused inspection context and track-fault findings. |
| **Traffic data** | View traffic context used alongside inspection and prioritisation data. |
| **Accountability** | Separate observed evidence, automated inference, engineer decisions, contractor actions, and closure evidence. |
| **Hardware bridge** | Inspect bridge status and the operator-approved ingestion boundary. |

The interface also includes live pipeline and live stream panels, detection overlays, an AI assistant, map views, public-reference imagery for demonstration, and a train-monitoring view.

## Typical demo flow

1. Open the production frontend or start the local app.
2. In **Operations**, run the simulator mission.
3. Review telemetry, alerts, map markers, and generated findings in **Defect control**.
4. Open **Evidence vault** to inspect media and provenance.
5. Use **Reports** to generate a narrative or PDF report.
6. Review accountability and contractor-readiness information before treating any recommendation as an operational action.

Simulator and public-dataset reference media are demonstrations only. They are not live UAV evidence, proof of damage, a safety determination, an approved work order, or an engineer’s conclusion.

## Architecture

```text
Operator / Engineer / Contractor
             |
             v
React + TypeScript console (Vite)
  Operations · Defects · Evidence · Reports
  Accountability · Contractors · Rail · Traffic
             |
             | tRPC / HTTP / Server-Sent Events
             v
Express + tRPC Node server
  Mission and finding workflows
  Evidence and report generation
  Auth, CORS, storage proxy, ingestion routes
             |
       +-----+------------------+------------------+
       |                        |                  |
       v                        v                  v
PostgreSQL + Drizzle      ML adapters        Maps / geospatial context
missions, findings,       local or external   Google Maps when configured,
telemetry, evidence,      inference, Gemini   OpenStreetMap fallback
reports, alerts           fallback
       |
       v
Engineer review -> controlled contractor handoff -> audit-ready report

Optional operator bridge -> authenticated telemetry and media ingestion
Optional ML service (Python/FastAPI) -> /detect-base64 or /detect
Optional MediaMTX/HLS -> browser live stream and annotated frames
```

## Repository layout

```text
client/                 React application and dashboard components
server/                 Express/tRPC API, services, persistence, tests
shared/                 Shared types, demo data, scoring, maps, and domains
ml-server/              Optional Python ML inference service and local YOLO models
scripts/                Media bridge, upload, frame-source, and verification scripts
tools/                  DJI export integration helper
docs/                   Deployment, integration, security, and validation guides
drizzle/                Database migrations and relations
render.yaml             Render service definition
vite.config.ts          Vite configuration
```

## Requirements

- Node.js 20+ (Node.js 22 is recommended)
- pnpm 10 (`corepack enable` can activate the project package manager)
- PostgreSQL for persistent local development
- Python 3.10+ only when running the optional ML service
- Optional: Supabase, Google Maps, OpenAI/Gemini-compatible credentials, SMTP/webhook delivery, MediaMTX, or an operator hardware bridge

## Local development

```bash
corepack enable
pnpm install
cp .env.example .env
# Edit .env with at least a usable DATABASE_URL for persistent operation
pnpm db:push
pnpm dev
```

The development server starts the Vite-powered frontend and Node API together. By default it looks for port `3000`; the server can select an available nearby port when necessary.

Useful commands:

```bash
pnpm check       # TypeScript validation
pnpm typecheck   # Alias for pnpm check
pnpm test        # Vitest test suite
pnpm build       # Vite frontend build plus bundled Node server
pnpm start       # Start the production bundle
pnpm test:bridge # Verify bridge routes without starting the full app
pnpm bridge:media # Start the media bridge helper
pnpm format      # Format the repository with Prettier
```

Run `pnpm check`, `pnpm test`, and `pnpm build` before pushing changes. The repository currently has no committed `.github/workflows` CI file, so these checks should be run locally or in the deployment pipeline.

## Configuration

Copying `.env.example` is the starting point; not every variable is required for every mode. Never commit `.env`, credentials, database URLs, tokens, or provider keys.

| Variable | Used for |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by Drizzle and the persistence layer. |
| `VITE_BACKEND_URL` | Browser-facing Node API origin; defaults in the frontend to the production Render API. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Optional authentication and object-storage integration. Keep service-role credentials server-side. |
| `ML_INFERENCE_URL` | Optional external inference endpoint. The Node service validates the response before creating a finding. |
| `ML_INFERENCE_TOKEN` | Private token for the external inference service. |
| `GEMINI_API_KEY`, `OPENAI_API_KEY` | Optional AI decision-support or inference fallback, depending on the configured adapter. |
| `VITE_GOOGLE_MAPS_API_KEY` | Optional browser-restricted Google Maps key. The UI retains an OpenStreetMap fallback when Maps is unavailable. |
| `DRIFT_INGEST_TOKEN` | Token required for telemetry and evidence bridge ingestion. Send it as a Bearer token or `x-drift-ingest-token`. |
| `DRIFT_HARDWARE_ENDPOINT` | Optional operator-approved hardware or media bridge health endpoint. This does not enable flight control. |
| `VITE_DRIFT_LIVE_STREAM_URL` | Optional browser-visible HLS stream URL for live viewing. |
| `DRIFT_ANNOTATED_RTMP_URL` | Optional RTMP destination for publishing annotated frames to MediaMTX. |
| `DRIFT_EMAIL_WEBHOOK_URL` or `DRIFT_SMTP_*` | Optional report and notification delivery. |

For a complete deployment variable list, see [`docs/external_hosting.md`](docs/external_hosting.md) and [`docs/deployment.md`](docs/deployment.md).

## Optional ML service

`ml-server/` contains a Python HTTP service that can run the checked-in local YOLO models and optional Roboflow-backed models:

| Model | Backend | Detection purpose |
| --- | --- | --- |
| CRACK | Local YOLO (`ml-server/cracks/main_crack.pt`) | Crack detection |
| ROAD | Local YOLO (`ml-server/road-ml/main_road.pt`) | Road damage and potholes |
| RAILWAY | Roboflow API | Track fault detection |
| RUST | Roboflow API | Corrosion detection |

Start it locally when the model dependencies and any required credentials are available:

```bash
cd ml-server
python -m pip install -r requirements.txt
python server.py
```

The service exposes:

- `GET /health`
- `POST /detect` for multipart file testing
- `POST /detect-base64` for the DRIFT backend integration

Example request:

```bash
curl -X POST http://localhost:8000/detect \
  -F 'file=@/path/to/inspection.jpg'
```

Configure the Node service with `ML_INFERENCE_URL` pointing to the appropriate endpoint. DRIFT uses the external ML service when configured, then applies its configured fallback adapter; unavailable inference must be represented as unavailable and is not treated as a detection. See [`ml-server/README.md`](ml-server/README.md) for the model-specific setup and response contract.

## Ingestion and live pipeline

Authenticated operator bridges can submit telemetry and evidence to the Node API:

- `POST /api/drift/telemetry` — validates and persists telemetry.
- `POST /api/drift/evidence` — accepts supported image/video base64 payloads, persists evidence, and can run inference.
- `GET /api/drift/live/events?missionId=<id>` — Server-Sent Events stream for live mission updates.
- `GET /api/drift/evidence-media/<encoded-key>` — backend proxy for protected evidence media.
- `POST /api/inspections` — runs the full inspection pipeline for an uploaded image, including metadata, inference, report, and optional email delivery.

Bridge requests are rate-limited and require `DRIFT_INGEST_TOKEN`. Evidence payloads are size- and MIME-validated, and live detections are marked for engineer review rather than being treated as verified findings.

The repository includes helpers for DJI exports, drone uploads, MediaMTX/HLS frame capture, annotated media bridging, and route verification. Review [`docs/hardware_adapter_contract.md`](docs/hardware_adapter_contract.md), [`docs/operator_uav_capture_guide.md`](docs/operator_uav_capture_guide.md), and [`docs/windows-live-workflow.md`](docs/windows-live-workflow.md) before connecting real equipment.

## Deployment

The included [`render.yaml`](render.yaml) defines the Node service on Render:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm drizzle-kit migrate && pnpm start
```

The documented external hosting path is:

1. Run validation locally: `pnpm check`, `pnpm test`, and `pnpm build`.
2. Configure PostgreSQL and server-side secrets in Render.
3. Set `VITE_BACKEND_URL` to the public Node API origin for the frontend build.
4. Configure frontend origin, CORS, OAuth, storage, ML, and bridge settings.
5. Deploy the frontend to Vercel and the Node API to Render.
6. Verify login boundaries, database persistence, evidence storage, report generation, map fallback, and authenticated telemetry/evidence ingestion.

Read [`docs/deployment.md`](docs/deployment.md), [`docs/external_hosting.md`](docs/external_hosting.md), and [`docs/security_lifecycle_audit.md`](docs/security_lifecycle_audit.md) before production deployment.

## Review and safety principles

- A model confidence value is not a probability of structural failure.
- A coordinate is a location reference, not a survey boundary.
- Simulator output and public-reference imagery are not live inspection evidence.
- Findings remain subject to evidence-quality checks and authorised engineer review.
- Repair estimates and contractor matches are planning or handoff inputs, not approved budgets or completed work.
- Hardware integration is ingestion only; DRIFT does not issue flight commands.
- Keep API keys, ingest tokens, database credentials, and service-role secrets out of frontend code and version control.

## Further documentation

- [`docs/deployment.md`](docs/deployment.md) — external hosting and deployment sequence
- [`docs/external_hosting.md`](docs/external_hosting.md) — hosting variables and service configuration
- [`docs/hardware_adapter_contract.md`](docs/hardware_adapter_contract.md) — authenticated telemetry/media contract
- [`docs/operator_uav_capture_guide.md`](docs/operator_uav_capture_guide.md) — operator capture workflow
- [`docs/industry_readiness_contract.md`](docs/industry_readiness_contract.md) — operational readiness boundaries
- [`docs/security_lifecycle_audit.md`](docs/security_lifecycle_audit.md) — security and lifecycle controls
- [`ml-server/README.md`](ml-server/README.md) — optional Python inference service

## License

This project is distributed under the MIT License. See [`package.json`](package.json) for the repository metadata.
