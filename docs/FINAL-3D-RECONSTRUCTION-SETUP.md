# DRIFT AI — Final 3D Reconstruction Setup

## What is already implemented

The repository already contains the main web workflow:

```text
Live/video upload
  → crack/defect detection
  → reconstruction job creation
  → queued job ledger
  → persistent reconstruction worker
  → GLB/LAS/OBJ/GeoTIFF artifacts
  → browser WebGL viewer
```

The current web app can create a `queued` reconstruction job. A real 3D model is published only after the reconstruction worker processes that job and produces validated artifacts.

## Why a job remains queued

The web server and the photogrammetry worker are separate processes. The worker is not part of the normal browser request because 4K photogrammetry requires persistent CPU, RAM, disk, Docker, and a database connection.

The worker must claim the job and run OpenDroneMap or COLMAP. Without the worker, the correct status is:

```text
queued
```

The worker then advances it to:

```text
processing → review_required
```

A successful job must contain at least a checksummed GLB/GLTF mesh and a LAS/LAZ/PLY point cloud. DRIFT does not publish placeholder geometry.

## Files that should exist or be updated

The following files implement the current workflow:

| File | Purpose |
|---|---|
| `client/src/components/ReconstructionWorkspace.tsx` | Upload form, live reconstruction panel, job ledger, progress stages |
| `client/src/components/LiveReconstructionTriggerPanel.tsx` | Detects a live crack event and opens the reconstruction workflow |
| `client/src/pages/accountability.css` | Reconstruction UI, progressive model map, upload preview styles |
| `client/src/const.ts` | Same-origin API routing for `manus.computer` previews |
| `server/routers.ts` | Upload, job creation, job listing, and manifest procedures |
| `server/services/reconstruction.ts` | Validation, quality scoring, stages, artifact contract |
| `server/services/mlInference.ts` | ML inference adapter and fallback behavior |
| `reconstruction-worker/worker.py` | Real photogrammetry processor |
| `reconstruction-worker/docker-compose.yml` | Persistent worker deployment |
| `drizzle-postgres/0006_reconstruction_jobs.sql` | Reconstruction job table |

No Gemini code change is required for reconstruction. Gemini is optional AI decision support; it is not the photogrammetry engine.

## Windows local setup

Open PowerShell in the folder containing `package.json`:

```powershell
cd "C:\Users\offic\Downloads\DRIFT-AI-ML-Platform-main (1)\DRIFT-AI-ML-Platform-main"
```

Install dependencies:

```powershell
npm install -g pnpm
pnpm install
```

Create the environment file only if it does not already exist:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
code .env
```

Minimum `.env` values:

```env
NODE_ENV=development
PORT=3000
VITE_BACKEND_URL=
GEMINI_API_KEY=your_gemini_key_if_ai_summaries_are_needed
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/drift
```

Keep `VITE_BACKEND_URL` blank for same-origin local development. Never place `GEMINI_API_KEY` in a `VITE_` variable or frontend source file.

Create the database if using local PostgreSQL:

```powershell
psql -U postgres -c "CREATE DATABASE drift;"
```

Start the web application:

```powershell
pnpm dev
```

Open:

```text
http://localhost:3000/?workspace=reconstruction
```

## Worker setup on Windows

The recommended Windows path is Docker Desktop with WSL 2 enabled. Install Docker Desktop, then verify:

```powershell
docker --version
docker compose version
```

The worker needs access to the same PostgreSQL database as the web app and a persistent artifact directory. In the `reconstruction-worker` directory, create a `.env` file:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@host.docker.internal:5432/drift
RECONSTRUCTION_POLL_SECONDS=10
RECONSTRUCTION_ARTIFACT_ROOT=/var/lib/drift/reconstruction
ODM_IMAGE=opendronemap/odm:latest
```

Start it:

```powershell
cd reconstruction-worker
docker compose --env-file .env up --build
```

The worker uses the Docker socket to launch OpenDroneMap. Docker socket access is administrator-level access, so use this only on a controlled development or deployment machine.

## Important source-video requirement

The worker must be able to download the original video from `inputMetadata.sourceUrl` or `sourceStorageUrl`. A URL such as this will not work from another container or host:

```text
http://localhost:3000/video.mp4
```

Use an HTTPS object-storage URL reachable by the worker. If the upload is performed by the deployed backend, configure object storage and ensure the returned storage URL is HTTPS.

## Worker behavior

The existing worker performs these stages:

```text
ingest
metadata_validation
frame_sampling
visual_odometry
sparse_cloud
dense_cloud
mesh_texturing
semantic_layers
georeference
quality_gate
publish_artifacts
```

It downloads the source, probes the video with FFprobe, samples overlapping frames, runs OpenDroneMap, checks for GLB/GLTF and LAS/LAZ/PLY outputs, calculates quality metadata, copies artifacts to the artifact root, and updates the job manifest.

## Testing a real job

Use a short MP4 under the browser upload limit for the first test. The capture should have:

- At least 20 usable overlapping frames
- Camera movement around the target
- GPS origin
- IMU or camera trajectory if available
- Adequate lighting and texture
- Forward and side overlap
- No excessive motion blur

In the browser:

1. Open the reconstruction workspace.
2. Choose the original video.
3. Confirm `VIDEO SELECTED`, filename, preview, and `Upload ready`.
4. Enter latitude, longitude, altitude, duration, and resolution.
5. Click `START LIVE RECONSTRUCTION NOW`.
6. Confirm the job appears as `queued`.
7. Keep the worker running.
8. Wait for `processing` and then `review_required`.
9. Select the job in the ledger.
10. Open the published GLB artifact in the WebGL viewer.

## Verification commands

Web server:

```powershell
curl http://localhost:3000/
```

Database job status:

```sql
SELECT "jobKey", name, status, "errorMessage", "createdAt", "completedAt"
FROM reconstruction_jobs
ORDER BY "createdAt" DESC;
```

Worker logs:

```powershell
docker compose logs -f drift-reconstruction-worker
```

A failed job should be investigated using `errorMessage`. Common causes are an inaccessible source URL, insufficient frames, missing Docker socket, unavailable OpenDroneMap image, inadequate disk, or absent GLB/point-cloud outputs.

## Current public demo link

The temporary sandbox web app is available at:

[Open DRIFT web app](https://3001-i6q07h6kti5zzkj5a6f2d-4cf8760c.sg2.manus.computer/)

[Open reconstruction workspace](https://3001-i6q07h6kti5zzkj5a6f2d-4cf8760c.sg2.manus.computer/?workspace=reconstruction)

This link demonstrates the UI and can create queued jobs when its backend/database are available. It is **not a guaranteed real-model processing service** because the sandbox does not have the persistent OpenDroneMap worker required to complete photogrammetry. A link that always returns a real model requires deploying both the web app and the worker on persistent infrastructure with shared database and object storage.

## Production deployment requirement

For a reliable public model-processing link, deploy:

1. The React/Express web application.
2. PostgreSQL.
3. HTTPS object storage.
4. A persistent Linux worker with Docker and OpenDroneMap.
5. Shared `DATABASE_URL` and storage configuration.
6. A public artifact route or object-storage URLs for GLB/LAS outputs.

A Vercel/Render web request process alone is not sufficient for 4K reconstruction.

## Honest capability boundary

Gemini can summarize and explain inspection evidence. It does not replace a crack detector, camera-pose estimator, OpenDroneMap, COLMAP, or an engineering accuracy validation process. A single frame cannot produce a reliable 3D model. The reconstruction worker requires overlapping views and spatial metadata, and the final output remains `review_required` until independent checkpoints or GCPs validate accuracy.
