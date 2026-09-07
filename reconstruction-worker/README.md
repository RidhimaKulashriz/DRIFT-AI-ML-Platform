# DRIFT reconstruction worker

This is the real heavy-compute boundary for the public reconstruction queue. It must run on a persistent Linux host with Docker, PostgreSQL access, object storage access, and enough CPU/RAM/disk for the capture. A Vercel/Render web request process is not suitable for 4K multi-gigabyte photogrammetry.

## Run

```bash
export DATABASE_URL='postgresql://...'
export RECONSTRUCTION_ARTIFACT_ROOT=/var/lib/drift/reconstruction
python -m pip install -r requirements.txt
python worker.py
```

The worker claims `queued` jobs, requires `inputMetadata.sourceUrl` or `sourceStorageUrl`, downloads the original capture, runs `opendronemap/odm:latest`, validates that both GLB and LAS/LAZ outputs exist, copies artifacts to the artifact root, and marks the job `completed`. Missing source media, missing outputs, or missing conversion tooling mark the job `failed`; no placeholders are published.

## Docker access

The worker image includes Docker CLI and expects the host Docker socket to be mounted if it runs ODM as a sibling container. Treat Docker socket access as administrator-level access and isolate this host.

## Accuracy

No software can guarantee 100% spatial accuracy from a single video. Accuracy depends on camera calibration, frame overlap, motion blur, rolling shutter, GPS/IMU quality, RTK/PPK, ground-control points, scene texture, and independent checkpoints. DRIFT therefore reports an accuracy status and requires control-point validation before engineering use.

For deployments without Docker, replace the ODM invocation with a COLMAP pipeline: feature extraction, exhaustive/sequential matching, mapper, image undistortion, dense stereo, fused point cloud, surface reconstruction, and glTF/LAS conversion. Keep the same job status and artifact contract.
