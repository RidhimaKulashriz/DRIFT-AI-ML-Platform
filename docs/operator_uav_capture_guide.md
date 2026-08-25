# DRIFT Operator UAV Capture Guide

## Purpose and operating boundary

DRIFT is an **inspection evidence platform**, not a flight controller. It does not arm, launch, navigate, change modes, move a gimbal, or trigger a camera. A flight crew remains responsible for aircraft configuration, airworthiness, regulatory compliance, and all flight decisions. DRIFT only receives operator-approved telemetry and original media after a capture mission is created.

> **Evidence rule:** A finding may only be described as drone-captured when its stored record identifies a hardware or operator-UAV source and retains capture metadata. Simulator annotations are visibly labelled as synthetic; external internet images are excluded from DRIFT’s evidence and detection surfaces.

## Recommended hardware architecture

| Layer | Recommended responsibility | DRIFT boundary |
|---|---|---|
| Flight controller | PX4 or ArduPilot flight control, geofence, failsafe, pilot commands | Never controlled by DRIFT |
| Companion computer | Jetson, Raspberry Pi, or similar Linux device that receives MAVLink and camera metadata | Runs the operator-approved bridge |
| Telemetry transport | MAVLink over serial, UDP/Wi-Fi, or Ethernet | Bridge normalizes receive-only data to DRIFT |
| Optional Bluetooth telemetry | A vendor-supported Bluetooth/serial adapter terminating on the companion computer | The companion gateway normalizes it to the authenticated HTTP bridge; DRIFT does not pair with or command the aircraft directly |
| Media path | Camera export, RTSP gateway, or operator-uploaded original photo/video | Original bytes and capture metadata become evidence |
| DRIFT backend | Authenticates, validates, stores, correlates, runs configured inference, maps, and reports | Rejects invalid or unauthenticated ingress |

MAVLink supports continuous telemetry streams such as position and velocity.[1] PX4 documents companion computers as separate on-vehicle computers connected to the flight controller through serial or Ethernet, commonly using MAVLink, with traffic often routed to ground/cloud through that companion device.[2] ArduPilot likewise documents companion computers that receive autopilot MAVLink data, including GPS, for processing and integration.[3]

## DRIFT capture workflow

| Step | Operator action | DRIFT outcome |
|---|---|---|
| 1. Select profile | Open **Hardware Bridge**, choose a generic PX4/ArduPilot, custom HTTP, DJI export, or RTSP profile and select the bridge contract. | Records the intended integration profile; it does not connect or command the aircraft. |
| 2. Create preflight mission | Sign in as an engineer/administrator, enter mission label and capture coordinates, then create the UAV preflight mission. | Creates a `hardware`-mode mission with a preflight audit event and no flight command capability. |
| 3. Start the bridge | On the companion computer, route receive-only MAVLink telemetry to the authenticated endpoint and maintain the mission ID. | Validates latitude, longitude, altitude, speed, battery, timestamp, and mission identity. |
| 4. Capture originals | Save original camera photo/video or export it from the aircraft/ground station. Do not screenshot a preview. | Stores original bytes, SHA-256, source, GPS, camera, capture time, mission, and aircraft profile. |
| 5. Upload or bridge media | Use **Upload Original Drone Media** or the authenticated evidence endpoint. | Creates `hardware` evidence; configured image inference may create a linked candidate finding. |
| 6. Review and report | Verify map position, original file, model output, quality gate, and capture zone. Generate the PDF only after review. | Report binds evidence source, camera, coordinates, provenance, mapped findings, uncertainty, and engineer sign-off boundary. |

## Authenticated ingress contract

The bridge uses the configured `DRIFT_INGEST_TOKEN` only in the server-to-server request header. Never expose it in the browser, a mobile app bundle, a repository, or a screenshot.

### Telemetry payload

```json
{
  "missionId": 123,
  "latitude": 28.6139,
  "longitude": 77.2090,
  "altitude": 42.0,
  "speedMps": 8.2,
  "batteryPercent": 86,
  "timestamp": 1760000000000
}
```

Send this to `POST /api/drift/telemetry` with `Authorization: Bearer <DRIFT_INGEST_TOKEN>`. DRIFT rejects missing fields, geographic values outside valid bounds, negative altitude/speed, invalid battery percentage, and timestamp skew.

### Original media payload

Send `POST /api/drift/evidence` with `Authorization: Bearer <DRIFT_INGEST_TOKEN>`. Required values are `missionId`, `fileName`, `mimeType`, `base64`, and `mediaKind`. For an inference-linked image, additionally provide `assetId`, `assetCriticality`, `latitude`, `longitude`, `cameraId`, `captureZone`, `inspectionDomain`, `correlationKey`, and `aircraftProfile`.

DRIFT marks this ingress as `hardware` and records `operator-uav-capture` provenance. It accepts photos and videos up to 50 MB. The bridge should retry only after a transient failure and must not replay data as a new capture without retaining the original correlation key.

## Safe companion-computer implementation

Use a companion computer to receive MAVLink from the flight controller over serial, Ethernet, or a local UDP route. PX4 lists MAVLink Router as a recommended routing option where traffic must be bridged to another connection.[2] The companion process should be receive-only for DRIFT integration: read telemetry, associate camera metadata, buffer locally while offline, then send authenticated HTTPS requests when connectivity returns.

The bridge must not forward DRIFT requests into MAVLink command messages. Lost link, geofence, return-to-home, battery failsafe, pilot takeover, and camera control remain in the flight-controller, ground-control-station, or manufacturer-approved camera stack.

Bluetooth is an optional local transport, not a direct browser control path. If an aircraft or telemetry adapter exposes Bluetooth serial data, terminate that link at a vendor-supported companion gateway, validate the device identity locally, then normalize the receive-only telemetry into the same authenticated DRIFT bridge contract. Do not grant the web application direct Bluetooth flight-control access.

## Evidence and report acceptance checklist

| Verify before sign-off | Required state |
|---|---|
| Original media | Stored image/video opens and its checksum is present |
| Capture provenance | `hardware` source, camera ID, timestamp, GPS, aircraft profile, mission ID, and correlation key recorded |
| Location | Evidence coordinates and associated finding marker agree with the inspected asset |
| Inference | Model/version/confidence/annotation are advisory and quality gate is reviewed |
| Report | PDF includes the evidence register and its provenance; no simulator/reference media is described as field capture |
| Engineer decision | An authorised engineer approves, overrides, or requests a site visit |

## Simulator mode

When no aircraft or companion computer is connected, **Run Clearly Labelled Demo** remains available. It creates synthetic annotation evidence and simulated telemetry only. It is useful for validating maps, reports, role boundaries, and DRIFT AI, but it must not be used to claim a live inspection or defect detection from a physical UAV.

## References

[1]: https://mavlink.io/en/guide/general_telemetry.html "MAVLink Guide — General Telemetry"
[2]: https://docs.px4.io/main/en/companion_computer/ "PX4 Guide — Companion Computers"
[3]: https://ardupilot.org/dev/docs/companion-computers.html "ArduPilot Developer Documentation — Companion Computers"
