# Supabase Live Verification Ledger

## Verified external configuration

On 2026-08-27, the authenticated Vercel project `drift-ai-ml-platform` accepted two Production-only browser configuration names: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The Render-only `SUPABASE_SERVICE_ROLE_KEY` was not added to Vercel.

Vercel redeployed canonical commit `48f5f8b` after the browser values were saved. The deployment completed with status **Ready** in 44 seconds. The public production console then showed record-free mission, finding, cost, and telemetry metrics and a functioning Google Maps surface with clearly labelled public NBI context rather than DRIFT operational findings.

During that live check, the console had no visible sign-in button even though the Supabase launch helper was present. Canonical commit `c1618c1` adds a visible unauthenticated `SIGN IN` control that calls the existing magic-link launcher. Vercel completed the automatic Production deployment in 30 seconds, and browser verification confirmed the accessible `SIGN IN` control, record-free public metrics, transient-demo control, and Google Maps context surface.

## Render server configuration and live boundaries

On 2026-08-27, the authenticated Render service accepted the five intended server-only configuration names: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_EVIDENCE_BUCKET`, and `DRIFT_SUPABASE_STORAGE_ENABLED`. The value for the latter flag is explicitly `true`; the bucket identifier is `drift-evidence`. Credential values remained masked and were neither logged nor committed. The resulting Render deploy of canonical commit `c1618c1` completed successfully, including its migration step and health check.

Record-free live checks against the deployed API then confirmed: public mission overview returns empty operational collections and sign-in guidance; public accountability overview returns no contractor, ticket, camera, or candidate data; the browser-only stateless simulator succeeds with its explicit no-storage boundary; and an unauthenticated persistent-simulator call receives `401` before any creation path can run.

No real evidence upload, report artifact, authenticated user, role promotion, contractor record, camera, CCTV candidate, security observation, ticket, closure, or UAV action was created during this verification. A private storage write/read check is deliberately still pending a real approved administrator or engineer and real authorised source evidence; test data must not be fabricated for that purpose. The server-only Supabase credential must never be added to Vercel or browser code.

Following a user report that the transient demo disappeared after sign-in, canonical commit `a6d0143` makes the browser-only walkthrough visible for every role, including the default `citizen` role. Vercel completed the Production build successfully. The updated production page visibly exposes `RUN TRANSIENT DEMO`; a live browser run completed with three temporary advisory candidates, twelve temporary telemetry points, visible temporary map markers, `PERSISTENT LINKAGE: NONE`, and a session-cleared boundary. No operational record was created.
