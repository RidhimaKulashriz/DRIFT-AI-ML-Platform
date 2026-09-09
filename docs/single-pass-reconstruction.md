# Single-pass 3D reconstruction

DRIFT now includes a first-class **3D Reconstruction Lab** aligned to SIH problem statement 17. The workflow accepts one operator-provided drone video, mandatory geolocation and flight metadata, optional IMU/barometric/intrinsic/RTK corrections, and records a quality-gated reconstruction job.

## Implemented contract

The backend validates MP4/MOV/AVI/WebM inputs, GPS bounds, altitude, duration, and file-size limits. It calculates a reproducible capture-quality score from resolution, duration, and sensor completeness. Each job stores its original metadata, ordered pipeline stages, quality report, operator identity, and status in `reconstruction_jobs`.

The pipeline contract covers frame sampling, visual odometry, sparse and dense point clouds, mesh texturing, semantic layers for terrain/structures/roads/vegetation/obstacles, georeferencing, quality gating, and publication. The export manifest reserves GLB, LAS, GeoTIFF, OBJ, and FBX outputs and exposes WGS84/local ENU origin metadata for downstream viewers and GIS tooling.

## Important operating boundary

This change does **not** fabricate 3D geometry when a photogrammetry runtime is unavailable. A submitted job is explicitly queued and remains traceable until a licensed/approved reconstruction worker is connected. RTK absence produces a GCP-review warning; missing camera intrinsics produces a self-calibration warning. The UI communicates this state instead of presenting simulated geometry as a survey result.

## API surface

- `drift.reconstruction.validate`: validate metadata and preview the quality gate.
- `drift.reconstruction.create`: persist an authenticated reconstruction job.
- `drift.reconstruction.list`: list recent jobs for the operator ledger.
- `drift.reconstruction.manifest`: return the georeference and export contract for a job.

The database migration is `drizzle-postgres/0006_reconstruction_jobs.sql`. The frontend workspace is available at `/?workspace=reconstruction`.
