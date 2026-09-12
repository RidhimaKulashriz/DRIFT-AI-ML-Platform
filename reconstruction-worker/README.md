# DRIFT reconstruction worker

This is the real heavy-compute boundary for the public reconstruction queue. It must run on a persistent Linux host with Docker, PostgreSQL access, object storage access, and enough CPU/RAM/disk for the capture. A Vercel/Render web request process is not suitable for 4K multi-gigabyte photogrammetry.

## Run

```bash
export DATABASE_URL='postgresql://...'
export RECONSTRUCTION_ARTIFACT_ROOT=/var/lib/drift/reconstruction
python -m pip install -r requirements.txt
python worker.py
```

The worker claims `queued` jobs, requires `inputMetadata.sourceUrl` or `sourceStorageUrl`, downloads the original capture, probes it with FFmpeg, extracts timestamped and checksummed frames, runs `opendronemap/odm:latest`, validates that both GLB and LAS/LAZ outputs exist, discovers any pose metadata exported by ODM, and copies checksummed artifacts to the artifact root. It always publishes a `frame-manifest.json` and `reconstruction-metadata.json` provenance artifact. Missing source media, missing outputs, or missing conversion tooling mark the job `failed`; no placeholders are published.

## Detection adapter

Real detections are opt-in. Set `DRIFT_DETECTION_COMMAND` to a command that reads the `DRIFT_FRAME_MANIFEST` environment variable and writes a JSON array to `DRIFT_DETECTION_OUTPUT`. Each item must include a valid `frameId`, `label`, and confidence in `[0, 1]`; optional fields include `boundingBox`, `timestampSeconds`, `worldPosition`, and `evidence`. The worker rejects malformed records, preserves frame provenance, marks records without a world position as `frame_only_uncertain`, and never creates a fabricated detection when the adapter is absent. A production adapter must perform the 2D detection plus pose/depth/reconstruction association before supplying `worldPosition`.

## Docker access

The worker image includes Docker CLI and expects the host Docker socket to be mounted if it runs ODM as a sibling container. Treat Docker socket access as administrator-level access and isolate this host.

## Accuracy

No software can guarantee 100% spatial accuracy from a single video. Accuracy depends on camera calibration, frame overlap, motion blur, rolling shutter, GPS/IMU quality, RTK/PPK, ground-control points, scene texture, and independent checkpoints. DRIFT therefore reports an accuracy status and requires control-point validation before engineering use.

For deployments without Docker, replace the ODM invocation with a COLMAP pipeline: feature extraction, exhaustive/sequential matching, mapper, image undistortion, dense stereo, fused point cloud, surface reconstruction, and glTF/LAS conversion. Keep the same job status and artifact contract.
