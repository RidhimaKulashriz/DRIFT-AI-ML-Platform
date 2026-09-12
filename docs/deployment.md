# DRIFT Deployment Guide

## External deployment: Vercel + Render

DRIFT’s public hosting path is intentionally external. Deploy the React frontend to Vercel and the Express/tRPC API to Render; do not use Manus hosting or a managed Publish control. The frontend must receive the Render API origin through `VITE_API_BASE_URL`, while the Render service owns OAuth callbacks, database access, object storage, AI/ML adapters, report generation, and authenticated drone-ingress routes.

1. Run `pnpm check`, `pnpm test`, and `pnpm build`.
2. Run the demo mission from the browser and verify defects, alerts, evidence, map markers, and report records.
3. Create the Render Node web service from the repository using the commands in `render.yaml`.
4. Configure the Render secrets in `docs/external_hosting.md`, including database, OAuth, storage/Forge, and `DRIFT_INGEST_TOKEN` values.
5. Deploy the Vercel frontend with `VITE_API_BASE_URL=https://<render-service>.onrender.com` and the public Vercel origin in the Render CORS/OAuth settings.
6. Verify login, tRPC calls, storage URLs, PDF report generation, and authenticated telemetry/evidence ingress against the deployed origins.

## Hardware deployment

Configure `DRIFT_HARDWARE_ENDPOINT` through the secret manager only after completing the documented bench test in `hardware_adapter_contract.md`. The endpoint is health-probed with a 3-second timeout and returns a retry state when unreachable. This setting does not add drone flight control.

## ML deployment

Keep the built-in inference adapter for demo and fallback operation. For an external model service, deploy a HTTPS endpoint separately that accepts inspection media and returns a validated label, confidence, bounding box, and explainable severity inputs. Store its endpoint in `ML_INFERENCE_URL`; never place credentials in frontend code.

## CI

`.github/workflows/ci.yml` installs dependencies with a frozen lockfile, runs TypeScript validation, and executes Vitest for pushes and pull requests.

