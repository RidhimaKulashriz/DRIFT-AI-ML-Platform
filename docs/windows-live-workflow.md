# DRIFT Windows Live-Inspection Runbook

This runbook describes the supported path from a DJI/operator video source to MediaMTX, browser playback, DRIFT evidence persistence, report generation, and contractor notification. It is written for Windows PowerShell with the repository located at `C:\ml models\DRIFT-AI-ML-Platform`.

> **Important architecture distinction:** RTMP is the publishing protocol into MediaMTX. The DRIFT browser dashboard reads the same stream through HLS or WebRTC. A browser-visible stream does not, by itself, create database evidence or reports. Evidence persistence requires an authenticated upload or an ingestion worker that samples frames, attaches GPS/timestamps, and calls the DRIFT backend.

## 1. Required software and accounts

Install Node.js 20 or newer, pnpm, Python 3.11 or newer, Git, FFmpeg, PostgreSQL, and MediaMTX. The repository already contains the Node backend, React frontend, Drizzle schema, PDF generator, contractor geo-routing, and email delivery code. MediaMTX and FFmpeg are local infrastructure and are not currently bundled in the repository.

Download MediaMTX from the official [MediaMTX releases](https://github.com/bluenviron/mediamtx/releases), extract it to a path such as `C:\tools\mediamtx`, and confirm that `mediamtx.exe` is present. Install FFmpeg from a trusted Windows distribution and ensure `ffmpeg.exe` is on `PATH`.

For email, choose one of the following delivery methods. A webhook relay such as Make, n8n, or Zapier is easiest to test. Direct SMTP is also supported. For Gmail, use a dedicated sender account with two-step verification and a Google **App Password**; do not use the normal account password and do not commit the app password to Git.

| Method | Required configuration | Best use |
|---|---|---|
| Webhook relay | `DRIFT_EMAIL_WEBHOOK_URL` | Production-friendly routing and template control |
| Direct SMTP | `DRIFT_SMTP_HOST`, `DRIFT_SMTP_PORT`, `DRIFT_SMTP_USER`, `DRIFT_SMTP_PASS` | Local testing or a managed SMTP provider |
| Gmail SMTP | `smtp.gmail.com`, port `465`, secure connection, App Password | Small controlled deployment |

## 2. Configure PostgreSQL locally

Start a local PostgreSQL database named `drift`, then create the local environment file. In PowerShell:

```powershell
Set-Location 'C:\ml models\DRIFT-AI-ML-Platform'
Copy-Item .env.example .env
notepad .env
```

At minimum, set the following values in `.env`. Replace the example database credentials with your local PostgreSQL values. Keep secrets only in `.env`; `.env` is ignored by Git.

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/drift
ML_INFERENCE_URL=http://127.0.0.1:8000/predict
VITE_BACKEND_URL=http://127.0.0.1:3000
VITE_DRIFT_LIVE_STREAM_URL=http://127.0.0.1:8888/drift-annotated/index.m3u8
DRIFT_ANNOTATED_RTMP_URL=rtmp://127.0.0.1:1935/drift-annotated
```

If you use direct SMTP locally, add the following and remove or leave the webhook URL blank:

```dotenv
DRIFT_SMTP_HOST=smtp.gmail.com
DRIFT_SMTP_PORT=465
DRIFT_SMTP_SECURE=true
DRIFT_SMTP_USER=drift-sender@your-domain.example
DRIFT_SMTP_PASS=YOUR_GOOGLE_APP_PASSWORD
```

If you use a webhook relay, add only the relay URL. The DRIFT server posts the resolved contractor email, ticket number, location, severity, repair cost, deadline, report URL, and optional PDF attachment metadata to this endpoint.

```dotenv
DRIFT_EMAIL_WEBHOOK_URL=https://hook.example.com/your-private-endpoint
```

Run the database migration and install packages:

```powershell
pnpm install --frozen-lockfile
pnpm db:push
```

If `pnpm db:push` reports that PostgreSQL is unavailable, fix the `DATABASE_URL` or start PostgreSQL before continuing. Do not proceed with a fake database URL because the dashboard may appear functional while records are not being persisted.

## 3. Configure MediaMTX for local RTMP and HLS

Create `C:\tools\mediamtx\mediamtx.yml` with this minimal configuration:

```yaml
logLevel: info
rtmp: true
rtmpAddress: :1935
hls: true
hlsAddress: :8888
webrtc: true
webrtcAddress: :8889
paths:
  drift-annotated:
    source: publisher
```

Start MediaMTX in its own PowerShell window:

```powershell
Set-Location 'C:\tools\mediamtx'
.\mediamtx.exe .\mediamtx.yml
```

The expected local endpoints are:

| Purpose | URL |
|---|---|
| RTMP publish target | `rtmp://127.0.0.1:1935/drift-annotated` |
| HLS playlist | `http://127.0.0.1:8888/drift-annotated/index.m3u8` |
| HLS browser page | `http://127.0.0.1:8888/drift-annotated` |
| WebRTC browser page | `http://127.0.0.1:8889/drift-annotated` |

MediaMTX documents FFmpeg publishing with an RTMP URL using the FLV format and HLS reading through the HTTP playlist URL [1] [2].

## 4. Start the DRIFT services locally

Use separate PowerShell windows so each service’s logs remain visible.

### Window A: ML inference service

```powershell
Set-Location 'C:\ml models\DRIFT-AI-ML-Platform'
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r ml-server\requirements.txt
$env:ML_PORT='8000'
python ml-server\server.py
```

The ML service should answer on `http://127.0.0.1:8000`. If the repository’s configured endpoint is `/predict`, verify the route exposed by the ML service before changing `ML_INFERENCE_URL`; the service documentation is the authoritative source for its route.

### Window B: DRIFT backend and frontend

```powershell
Set-Location 'C:\ml models\DRIFT-AI-ML-Platform'
pnpm dev
```

The development server should expose the dashboard at `http://127.0.0.1:3000` unless the local environment chooses another port. Confirm the backend before opening the browser:

```powershell
Invoke-WebRequest http://127.0.0.1:3000/ -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:8000/ -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:8888/drift-annotated/index.m3u8 -UseBasicParsing
```

Open `http://127.0.0.1:3000/?workspace=operations`. The stream panel should load the HLS feed after a publisher is connected. If the page was already open before MediaMTX started, reload the page after the playlist becomes available.

## 5. Publish an RTMP test stream

Before using the drone, verify the entire media path with a known local MP4 file. This isolates RTMP and MediaMTX problems from DJI and network problems.

```powershell
Set-Location 'C:\ml models\DRIFT-AI-ML-Platform'
ffmpeg -re -stream_loop -1 -i .\sample-inspection.mp4 -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -f flv rtmp://127.0.0.1:1935/drift-annotated
```

Open `http://127.0.0.1:8888/drift-annotated` in a browser or VLC. Stop FFmpeg with `Ctrl+C`, then confirm that MediaMTX logs the publisher disconnect. The official MediaMTX examples use the same RTMP-to-FLV pattern [1].

For a drone/operator source, configure the approved DJI/phone/OBS source to publish to `rtmp://<laptop-LAN-IP>:1935/drift-annotated`. The source must be on the same LAN or otherwise able to reach the laptop firewall port. The DJI Mini 3 Pro itself should remain operator-controlled; DRIFT only receives approved telemetry and media and does not arm, launch, navigate, or control the aircraft.

To find the laptop’s LAN address:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown'} | Format-Table IPAddress,InterfaceAlias
```

If a phone or controller cannot publish, use OBS or FFmpeg as the approved bridge. Create a Windows Firewall rule only for the required private-network port:

```powershell
New-NetFirewallRule -DisplayName 'DRIFT MediaMTX RTMP' -Direction Inbound -Protocol TCP -LocalPort 1935 -Action Allow -Profile Private
```

Do not expose port `1935` directly to the public Internet. For production, place MediaMTX behind a controlled network boundary, use authentication, terminate HTTPS for browser playback, and restrict publish/read permissions.

## 6. Persist frames, GPS, and timestamps into DRIFT

This is the step that turns a video stream into database records. **MediaMTX only transports media.** It does not know DRIFT mission IDs, contractor assignments, defect metadata, or engineer identity.

The current repository supports authenticated evidence uploads through the DRIFT backend and stores GPS, capture time, source, camera, quality, and provenance metadata. For a local proof run, use the dashboard’s Evidence Vault upload after creating a persisted hardware capture mission. Enter the mission’s GPS and upload original images or a post-flight video. The upload mutation persists the evidence and can invoke inference for photo evidence when an asset and coordinates are supplied.

For automated live sampling, add a dedicated worker that reads the RTMP or HLS stream, samples frames, and calls the authenticated DRIFT evidence endpoint with:

```text
missionId
fileName
mimeType
base64
mediaKind
latitude
longitude
capturedAt
cameraId
captureZone
inspectionDomain
captureSource=hardware
aircraftProfile
assetId
assetCriticality
priorOpenDefects
runInference=true
```

The worker must obtain GPS and capture timestamps from the authorised telemetry bridge or the operator’s mission log; it must not invent coordinates from the video alone. It should keep the DRIFT ingest token in a local environment variable such as `$env:DRIFT_INGEST_TOKEN`, never in the browser or source code.

A practical first implementation is post-flight frame sampling. Save the original recording, run an FFmpeg frame extraction command, associate each frame with the telemetry timestamp/GPS record, upload the frames, and then generate the report. Near-real-time inference can be added later once the authenticated mission and telemetry correlation contract is stable.

## 7. Close the stream and update reports

Stopping FFmpeg or the DJI/operator publisher closes the MediaMTX session, but it does not currently finalize a DRIFT mission automatically. The safe supported sequence is:

1. Stop the publisher with `Ctrl+C`.
2. Confirm the original recording and telemetry log are saved.
3. Upload the original media or sampled evidence to the active authenticated mission.
4. Open **Reports** in the dashboard and select **GENERATE PDF REPORT**.
5. Confirm that the report appears in the Reports workspace and that the Evidence Vault contains the mission-linked records.
6. Confirm that the PDF includes findings, coordinates, timestamps, repair-cost exposure, estimated repair window, contractor routing, ticket metadata when a ticket exists, and the CSV/JSON audit appendix.
7. Open the Accountability workspace, verify the contractor ticket, and use **SEND REPORT EMAIL** only after engineer review and recipient verification.
8. Refresh the dashboard or wait for its normal query refresh. The frontend reads the updated report, evidence, defect, alert, and ticket data from the backend.

The current code links an existing contractor ticket to a newly generated mission report when the ticket’s defect belongs to that mission. It does not silently create a maintenance ticket solely because a stream ended. That guard is intentional because issuing a contractor work order without engineer review could create an unsafe production action. If automatic close-out is required, implement an authenticated `finalizeMission` endpoint with idempotency, engineer approval, mission ownership checks, and an explicit `autoCreateTicket` policy before enabling it in production.

## 8. Test email sending without sending to a real contractor

Use a private test recipient or a relay capture mailbox first. Do not test against the registered IGDTUW or IIIT-Delhi recipients until the payload and report URL have been verified.

For a webhook relay, create a private webhook and point `DRIFT_EMAIL_WEBHOOK_URL` to it. The relay should accept JSON, verify a shared secret or signature, and send using a transactional provider. The relay payload contains the resolved `to` email, contractor name, ticket, location, severity, cost, deadline, report URL, evidence URL, and optional PDF attachment metadata.

For SMTP, use a dedicated test account:

```powershell
$env:DRIFT_SMTP_HOST='smtp.gmail.com'
$env:DRIFT_SMTP_PORT='465'
$env:DRIFT_SMTP_SECURE='true'
$env:DRIFT_SMTP_USER='drift-test@your-domain.example'
$env:DRIFT_SMTP_PASS='YOUR_APP_PASSWORD'
pnpm dev
```

Then sign in as an engineer, generate a report, create or select the associated accountability ticket, and use **SEND REPORT EMAIL**. A successful response should identify the resolved recipient and delivery mechanism. If no email configuration is present, the server must return a clear precondition error and must not claim that an email was sent.

For production email, verify SPF, DKIM, and DMARC for the sender domain, use a provider with delivery logs, configure retry and bounce handling in the relay, and avoid putting contractor email addresses in frontend code. The registered campus recipients currently come from the shared geo-contractor registry; verify those records before enabling real delivery.

## 9. Production architecture for a live website

A Vercel-hosted frontend cannot read `127.0.0.1` on an operator’s laptop. The local HLS URL is valid only for a browser on the same machine. A live production website therefore needs a reachable HTTPS HLS or WebRTC endpoint, such as a secured MediaMTX instance on a controlled server or an approved streaming gateway. Set `VITE_DRIFT_LIVE_STREAM_URL` in the frontend deployment to that public HTTPS URL and configure CORS, authentication, TLS, and publish/read permissions.

The production path should be:

```text
DJI/operator source
  → authenticated private RTMP publish
  → MediaMTX on a controlled media host
  → HTTPS HLS/WebRTC for the dashboard
  → authenticated frame/telemetry worker
  → DRIFT Node API
  → PostgreSQL + durable evidence/report storage
  → engineer review
  → contractor ticket
  → configured email relay/SMTP
```

Keep the Node API and PostgreSQL on Render as configured by the repository, the frontend on Vercel, and the media server/worker on infrastructure that can accept the operator stream continuously. Do not put PostgreSQL credentials, SMTP passwords, or the DRIFT ingest token in Vercel client-side variables. Only browser-safe values such as `VITE_BACKEND_URL`, `VITE_API_BASE_URL`, and a browser-restricted Maps key belong in the frontend environment.

## 10. Complete local and production checks

Run the following from PowerShell before pushing changes:

```powershell
Set-Location 'C:\ml models\DRIFT-AI-ML-Platform'
pnpm check
pnpm test -- --run
pnpm build
git diff --check
git status
```

Then perform these smoke checks in order:

| Check | Expected result |
|---|---|
| PostgreSQL connection | `pnpm db:push` completes and records persist after restart |
| ML health | ML service responds locally and the configured inference route matches `ML_INFERENCE_URL` |
| MediaMTX publish | FFmpeg or approved operator source publishes to RTMP without disconnect loops |
| MediaMTX playback | HLS playlist opens at `/drift-annotated/index.m3u8` and the dashboard video plays |
| Authentication | After the email link returns, the dashboard shows the signed-in welcome state and protected queries succeed |
| Evidence | Original media is visible in Evidence Vault with GPS and capture timestamp |
| Inference | Findings show confidence, severity, coordinates, and evidence linkage |
| Report | Reports tab shows a generated PDF with the audit appendix |
| Ticket | Accountability tab shows the geo-routed ticket and due/check timing |
| Email | Test relay/mailbox receives the ticket and report package, or the server reports a clear configuration error |
| Restart durability | Restart backend and frontend, reload dashboard, and confirm records remain in PostgreSQL/storage |
| Production origins | Vercel frontend calls the Render API, report URLs are reachable, and no browser request points to `127.0.0.1` |

The repository’s standard checks are `pnpm check`, `pnpm test`, and `pnpm build`, and the deployment documentation requires these before deployment [3].

## References

[1]: https://mediamtx.org/docs/publish/ffmpeg "MediaMTX: Publish with FFmpeg"

[2]: https://mediamtx.org/docs/read/web-browsers "MediaMTX: Read with web browsers"

[3]: https://github.com/RidhimaKulashriz/DRIFT-AI-ML-Platform/blob/main/docs/deployment.md "DRIFT deployment documentation"
