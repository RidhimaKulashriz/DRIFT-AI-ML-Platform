# DJI Mini 3 Pro integration with DRIFT

## Executive answer

The DJI Mini 3 Pro shown in the supplied video can feed **original inspection media** into the deployed DRIFT application today through an operator-controlled export/upload workflow. It should not be connected directly from a browser by Bluetooth, and it should not be treated as a MAVLink aircraft. DJI’s current compatibility table lists Mini 3 Pro as **Mobile SDK compatible** but with no Onboard SDK; DJI’s Mobile SDK page also lists Mini 3 Pro as a supported product.[1] [2]

The deployed topology remains:

```text
DJI Mini 3 Pro + DJI RC/RC-N1 + DJI Fly
                    │
                    ├── fastest safe path: export original photo/video
                    │                         │
                    │                         ▼
                    │                  operator uploader / DRIFT UI
                    │
                    └── real-time path: approved Android DJI Mobile SDK app
                                              │ receive-only telemetry/media
                                              ▼
                                  authenticated local gateway
                                              │ HTTPS
                                              ▼
                         Render DRIFT backend → Vercel DRIFT frontend
```

DRIFT is an **inspection ingestion and decision-support platform**, not a flight controller. The operator remains responsible for take-off, navigation, camera operation, geofence, failsafe, airspace, and landing. DRIFT never arms, launches, navigates, or sends a corrective flight command.

## What can be used immediately

The fastest route works with either the DJI RC controller or RC-N1 controller. Fly the aircraft using DJI Fly, preserve the original photo/video, create a persistent DRIFT mission as an authorised engineer or administrator, and upload the original file through **Hardware Bridge → Upload Original Drone Media**. The backend stores the original file and provenance, and the Vercel frontend can then display the evidence, map location, model result where configured, review state, and report linkage.

DJI documents four export methods for Mini 3 Pro footage: QuickTransfer to a smartphone, DJI Fly download, USB-C to a computer, and microSD card reader.[3] Prefer the microSD or USB-C original file for a controlled evidence chain. Do not upload a screenshot of a preview when an original file is available.

Before upload, record the mission ID, capture timestamp, camera identifier, GPS source/lock state, capture zone, inspection domain, aircraft profile, and a correlation key. If the file has no trusted GPS or timestamp, mark the missing field explicitly; do not infer a coordinate from a nearby map point.

## Step-by-step operator workflow

| Step | Operator action | DRIFT result |
|---|---|---|
| 1 | Configure Vercel `VITE_BACKEND_URL` to `https://drift-node-api.onrender.com` and keep Render CORS restricted to the Vercel origin. | Browser tRPC requests go to the deployed backend. |
| 2 | Sign in with an approved DRIFT engineer/administrator account. A personal email may be used for the sign-in attempt, but protected role approval is separate. | Persistent mission/evidence actions become available only when authorised. |
| 3 | In Hardware Bridge, select **DJI export / operator upload**. Create a hardware-mode inspection mission. | A mission is created with no flight-command capability. |
| 4 | Fly only through DJI Fly under the operator’s approved procedure. Capture original photos/video and preserve the card or downloaded original. | The flight remains outside DRIFT’s control boundary. |
| 5 | In Hardware Bridge, select the original file and enter mission ID, source `operator-uav-capture`, aircraft profile `DJI Mini 3 Pro`, camera ID, capture zone, domain, timestamp, and GPS if available. | The authenticated backend validates and records provenance. |
| 6 | Review the evidence record, map coordinate, image quality, model/version, uncertainty, and any candidate defect. | Findings remain advisory and engineer-review dependent. |
| 7 | Generate or approve a report only after human review. | The report keeps source, uncertainty, evidence, coordinates, and sign-off boundaries together. |

The no-hardware demo remains separate. **Run Transient Demo** creates clearly labelled browser-session-only synthetic advisories and telemetry; it is not linked to the DJI mission and cannot create real evidence, tickets, reports, CCTV records, security observations, or UAV actions.

## Optional command-line export uploader

For an original file already exported from DJI Fly, the following local uploader can send a single evidence item to the existing Render endpoint. It is deliberately an operator tool, not frontend code. Set `DRIFT_INGEST_TOKEN` only in the local shell or a protected secret manager; never put it in Vercel, a browser bundle, the Android APK, GitHub, or a screenshot.

```bash
export DRIFT_BASE_URL="https://drift-node-api.onrender.com"
export DRIFT_INGEST_TOKEN="<retrieve and rotate this in Render; never commit it>"
node tools/dji-export-to-drift.mjs \
  --file ./original-frame.jpg \
  --mission-id 123 \
  --latitude 28.6139 \
  --longitude 77.2090 \
  --capture-zone oblique \
  --inspection-domain bridge \
  --camera-id dji-mini-3-pro-camera \
  --captured-at 2026-09-01T10:30:00Z \
  --correlation-key mission-123-frame-0001
```

The uploader sends a base64 payload to `POST /api/drift/evidence` with the server-to-server bearer token. It does not create a mission, execute a flight action, or claim that a photo proves a defect. A real upload should be performed only after the user has an approved account, a real mission ID, and an authorised test image; no real upload was performed while preparing this guide.

## Real-time telemetry and media option

If the user needs a live aircraft status panel rather than post-flight evidence upload, the correct route is a separate **Android DJI Mobile SDK V5 companion application**. DJI lists Mini 3 Pro support in Mobile SDK V5 and its compatibility table marks Mobile SDK support.[1] [2] The companion app would receive approved read-only telemetry from the DJI SDK, associate it with the operator-created DRIFT mission, and send normalized HTTPS requests through a trusted local gateway.

The gateway must send only validated telemetry to `POST /api/drift/telemetry` using `Authorization: Bearer <DRIFT_INGEST_TOKEN>`. It must retain the DJI source timestamp, device/aircraft identity, GPS lock state, battery, altitude, speed, heading, mission association, and correlation key. For media, the gateway should send selected original stills or bounded clips to `POST /api/drift/evidence`; it should not expose an unauthenticated RTSP listener or continuously upload unreviewed frames.

This real-time path requires a DJI developer account, a registered Android application and DJI app key, a supported Android device/controller arrangement, implementation against the current DJI Mobile SDK terms/API, local gateway networking, and bench testing with the motors disarmed. The DJI RC built-in-screen controller may not be interchangeable with a normal Android phone for installing and running a custom companion application; confirm the exact controller model and supported deployment arrangement before purchasing or building around it. The RC-N1 plus a compatible Android phone is the clearer development target, but it still requires DJI SDK validation.

The current DRIFT backend contract is designed around receive-only MAVLink/Jetson integrations. Do **not** send DJI vendor messages to the existing MAVLink endpoint, and do not claim that Mini 3 Pro telemetry is MAVLink. Add a DJI adapter only after the native SDK has produced a tested payload mapping. Flight safety, geofence, return-to-home, lost-link, pilot takeover, and camera controls remain in DJI Fly/the aircraft’s approved control stack; DRIFT must not issue commands.

## What the user needs to provide before a live SDK integration

The exact controller must be confirmed as **DJI RC** or **DJI RC-N1**. The operator must also choose whether the first milestone is post-flight original upload or live telemetry. A real-time implementation additionally needs a compatible Android test device, DJI developer registration/app key, a local gateway machine that stays online during the mission, an approved Render ingest token, and a non-production bench test mission. No credentials, app keys, or live flight data should be placed in this repository or sent in chat.

## Acceptance gates

A live DJI integration is not ready merely because a DJI Fly connection works. The acceptance test must prove: the operator can create an authorised mission; the bridge authenticates without exposing its token; telemetry has valid GPS/timestamp/battery bounds; original media retains checksum and provenance; the Vercel UI shows the evidence and coordinates; inference output identifies model/version/confidence/uncertainty; failures stop or quarantine ingestion without issuing flight commands; and an engineer can approve, reject, or request a site visit. The simulator must continue to work when the drone, phone, gateway, or provider is unavailable.

## References

[1]: https://support.dji.com/help/content?customId=01700000763&documentType&lang=en&paperDocType=ARTICLE&re=US&spaceId=17 "DJI Product SDK Compatibility"
[2]: https://developer.dji.com/mobile-sdk "DJI Mobile SDK V5"
[3]: https://support.dji.com/help/content?customId=en-us03400006743&spaceId=34&re=us&lang=en "DJI Drone Photo or Video Files Export Guide"
