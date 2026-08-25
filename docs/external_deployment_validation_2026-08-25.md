# External Deployment Validation — 2026-08-25

## Live external endpoints

| Component | URL | Verified state |
| --- | --- | --- |
| Public frontend | `https://drift-ai-ml-platform.vercel.app` | HTTP 200; production Vercel deployment for commit `5f78920` is Ready. |
| Node/tRPC API | `https://drift-node-api.onrender.com` | Render Free service is live for commit `5f78920`. |
| Public dataset sample | `https://raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset/master/PreviewImages/1097248_DF_070_070BDF0010_04158_RAW.jpg` | HTTP 200 and visibly rendered on the Vercel frontend. |
| Public crack mask | `https://raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset/master/PreviewImages/1097248_DF_070_070BDF0010_04158_CRACK.png` | Publicly resolvable and linked from the Vercel frontend. |

## Split-host checks

The Vercel Production configuration exposes only `VITE_BACKEND_URL=https://drift-node-api.onrender.com`. Browser resource entries confirmed that `auth.me`, `drift.overview`, and `drift.hardwareStatus` requests use the Render origin. An OPTIONS preflight from `https://drift-ai-ml-platform.vercel.app` to the public overview procedure returned `204` with the Vercel origin in `Access-Control-Allow-Origin`; the overview request returned `200`.

An unauthenticated POST to `https://drift-node-api.onrender.com/api/drift/telemetry` returned `401` with `Bridge authentication required.`, confirming that the receive-only drone bridge is not publicly writable.

## Persistence and storage readiness

The Render API currently has no compatible MySQL/TiDB `DATABASE_URL`. It therefore returns a read-only empty overview and cannot persist simulator missions, operator uploads, review decisions, or PDF reports. Commit `5f78920` adds an explicit `persistence` status to `drift.overview` and disables these dependent actions with an actionable MySQL/TiDB message rather than allowing a long-running failed mutation.

The existing Render PostgreSQL service must not be attached to this Node backend because the persistence layer uses Drizzle's `mysql2` driver and a MySQL-style schema. Real operator media and generated PDF report bytes also still need an external object-storage implementation; internal storage paths are not an external-production data store.

## Security follow-up

The previously chat-exposed Gemini and OpenAI keys must be revoked and replaced before live AI use. A rotated `GEMINI_API_KEY`, an unexposed `DRIFT_INGEST_TOKEN`, and a compatible database connection belong only in Render server environment variables, never in Vercel client configuration or GitHub. External OAuth is deliberately disabled by default; do not set `DRIFT_EXTERNAL_OAUTH_ENABLED=true` until a non-Manus identity provider, its server-side endpoint, and the corresponding portal/app values are configured and tested.
