# DRIFT Deployment Audit

## Release configuration matrix

| Stack area | Configuration | Required to boot | Production requirement | Safe fallback when absent |
|---|---|---:|---:|---|
| Frontend | `VITE_APP_TITLE`, `VITE_APP_LOGO`, `VITE_BACKEND_URL` | No for public monitoring | Set the Render API origin as a Vercel build-time value; never commit secrets | The public workspace remains readable; protected actions are clearly unavailable without an external identity provider |
| Frontend/maps | `MapView` with configured Google Maps provider | No separate key for coordinate fallback | Configure a Vercel-safe Google Maps browser key with domain restrictions; do not commit it | Coordinates remain visible in mission/evidence records and the workbench shows a truthful provider-unavailable state |
| Backend/auth | `JWT_SECRET`, optional external OAuth provider values, owner identity, Forge URL/key | No for public monitoring | Configure a supported external OAuth provider before enabling protected engineering operations | No safe anonymous access to protected operations; the backend returns an actionable `503` for sign-in attempts while public read procedures remain available |
| Database | `DATABASE_URL` | Yes for persistence | Enable SSL where supported and apply Drizzle migrations before release | Server refuses persistent mission/evidence operations rather than fabricating data |
| Storage | S3-compatible storage helpers and Forge credentials | Yes for evidence/report artifacts | Configure Render-side object storage; store references and hashes, not file bytes in MySQL | Upload/report operations fail explicitly; existing metadata remains queryable |
| ML/CV | `ML_INFERENCE_URL`, optional `ML_INFERENCE_TOKEN` | No | Configure a calibrated, domain-specific CV service and validate its response schema | Deterministic fallback labels findings as advisory, applies server calibration, records provenance, and requires human review |
| AI decision support | Built-in Forge/LLM configuration | No for core operations | Review model output and retain structured narrative/audit state | Deterministic narrative fallback is used when the AI service is unavailable |
| Drone bridge | `DRIFT_INGEST_TOKEN`, optional `DRIFT_HARDWARE_ENDPOINT` | Token required only for live bridge calls | Use a long random token; connect PX4/ArduPilot through an operator-controlled companion computer and authenticated HTTPS bridge | Hardware status is offline/degraded and simulator mode remains available; DRIFT never controls flight |
| Media bridge | RTSP source handled by the approved companion bridge, then bounded still/clip uploads | No for simulator | Preserve stream/frame IDs, timestamps, camera IDs, checksums, and capture zones | No live media is fabricated; evidence remains unavailable until a trusted upload arrives |
| Runtime safety | PX4/ArduPilot geofence and lost-link failsafe | External flight-system responsibility | Configure and bench-test hold/RTL/land/operator-defined failsafe before live missions | DRIFT marks bridge degraded/offline and rejects stale telemetry; it does not send corrective commands |

## Verification status

The public Vercel and Render services are live. `ML_INFERENCE_URL` and `DRIFT_HARDWARE_ENDPOINT` remain optional for simulator/fallback mode. Configure a restricted Google Maps browser key on Vercel if real tiles are required; the coordinate fallback remains available when tiles are unavailable. Manus OAuth variables are not required for public monitoring; configure a separate external provider before enabling protected engineering actions.

The latest local release gate passed TypeScript validation, 27 Vitest tests, the production build, authenticated real-image evidence upload, fallback inference persistence, correlation persistence, and application-generated report creation. Remaining field gates are organisation-specific: deploy a calibrated production CV endpoint, bench-test the chosen PX4/ArduPilot hardware and camera bridge, and complete flight/airspace and engineering approvals.

## External deployment action

Create the Render Node service from `render.yaml`, configure the documented Render secrets, deploy the backend, then create the Vercel project from `vercel.json` and set `VITE_API_BASE_URL` to the deployed Render origin. Do not use Manus hosting or a managed Publish control. If the project will serve multiple organisations, add organisation membership and tenant IDs to every operational table before onboarding independent customers.

## Remaining external gates and release classification

The current checkpoint is **deployment-prepared, not field-certified**. The local application and release checks are green, but the following gates remain external: the latest expanded local source cannot be pushed through the current GitHub integration because all write endpoints return `Resource not accessible by integration`; the existing correct source PR #7 is already merged, but it does not contain this latest local checkpoint. The browser preview can be rendered and documented, but this session does not expose click-level panel navigation for individually selecting every filter and review surface. Live CV calibration, PX4/ArduPilot bench testing, camera/RTSP integration, airspace approval, and qualified engineering sign-off must occur in the target organisation’s environment.

The current checkpoint is a local recovery artifact only. Public release must occur through Vercel and Render after the external gates above are accepted.
