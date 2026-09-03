# DRIFT laptop media bridge

The DRIFT backend cannot discover a drone merely because a USB or Wi-Fi connection exists. A trusted process on the laptop or companion computer must receive the vendor-approved camera output, preserve its original file, and upload it to the authenticated DRIFT evidence endpoint. This repository includes a minimal folder bridge for that handoff.

## Start the bridge

From the repository root, set the backend URL, ingest token, and persisted mission identifier in the laptop environment:

```bash
export DRIFT_BASE_URL=https://drift-node-api.onrender.com
export DRIFT_INGEST_TOKEN='use-the-secret-from-the-deployment-secret-manager'
export DRIFT_MISSION_ID=42
export DRIFT_MEDIA_DIR="$HOME/drift-media-inbox"
pnpm run bridge:media
```

The bridge watches `DRIFT_MEDIA_DIR` and uploads supported `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, `.mp4`, `.webm`, and `.mov` files. It does not arm, launch, navigate, or command the aircraft. DJI, PX4, ArduPilot, RTSP, and MAVLink capture software must be configured separately to write approved media into the inbox.

## Required GPS sidecar

Every file must have a same-name JSON sidecar before it is uploaded. For example, `frame-0001.jpg.json`:

```json
{
  "latitude": 28.6876,
  "longitude": 77.2100,
  "cameraId": "uav-front",
  "captureZone": "elevated-facade",
  "headingDegrees": 182,
  "inspectionDomain": "bridges",
  "correlationKey": "flight-2026-09-03-frame-0001",
  "runInference": true,
  "assetId": 23,
  "assetCriticality": 5,
  "priorOpenDefects": 0
}
```

The bridge refuses media without finite GPS coordinates and refuses files larger than the backend's JSON-upload limit. Images with `runInference: true` are sent through the backend inference path. Videos are stored as original evidence; automatic video-frame extraction requires a vendor-approved capture worker/FFmpeg pipeline and is intentionally not guessed or fabricated by this utility.

## Operational boundary

Successful upload means only that the backend accepted the evidence. It does not certify that a defect exists, that the coordinate is correct, or that a repair order is safe. The dashboard marks ML outputs as advisory and keeps engineer review in the workflow. Configure the flight controller's own geofence and lost-link failsafe independently before any live flight.
