# External Hosting Guide for DRIFT

## Recommended architecture

For the current React/Vite + Express/tRPC + Drizzle application, deploy the complete application as one Node web service on Render. The service runs `pnpm build` and `pnpm start`, serves the compiled frontend, exposes the backend routes, and connects to the managed MySQL/TiDB database and object storage. Render documents Node web services and free deployment options [1].

Vercel can host the frontend and Node/Express functions, but the current DRIFT server is a long-lived monolithic Express process with database, storage, authenticated bridge ingestion, and 50 MB evidence-request handling. Vercel’s function model has serverless execution and request/body limits [2], so a Vercel-only deployment would require a deliberate adapter split: static frontend on Vercel, API functions adapted per route, external database/object storage, and a separately hosted bridge/media ingress service. Do not place the current server bundle on Vercel without that adaptation.

## Render deployment

1. Push the repository to a GitHub branch that contains `render.yaml`.
2. In Render, choose **New → Blueprint**, select the repository, and review the generated `drift-inspection-platform` web service.
3. Add every `sync: false` value from `render.yaml` through Render’s secret/environment UI. Never commit `.env` files or secret values.
4. Use a production MySQL/TiDB connection with SSL where supported. Run the generated Drizzle migrations against that database before accepting live evidence.
5. Configure `DRIFT_INGEST_TOKEN` with a new random value and place the same value only in the approved companion-computer bridge.
6. Leave `DRIFT_HARDWARE_ENDPOINT` and `ML_INFERENCE_URL` unset for simulator/fallback mode, or configure approved production endpoints before field use. The deterministic ML fallback is advisory and requires engineer review; it is not a substitute for a calibrated production CV model.
7. After deployment, verify `/`, authenticated OAuth, `/api/drift/telemetry`, `/api/drift/evidence`, report generation, storage retrieval, and database persistence from the Render URL.

Render free services may sleep or have resource limits; that is acceptable for a demo but not for continuous drone operations. For field operations, use an always-on plan and a shared rate limiter rather than the current in-memory single-instance limiter.

## Vercel alternative

Use Vercel only if the team is willing to split the application. Keep the Vite frontend on Vercel, move the API into compatible Vercel functions or retain the backend on Render, and configure the frontend API base URL and CORS/session-cookie policy accordingly. The hardware bridge should call the stable backend ingress URL, not a frontend route. The current Manus-managed map proxy and storage/auth integrations may also require platform-specific replacements when leaving WebDev.

## Limitations and safety

External deployment does not make the inspection model universally accurate. Production release still requires held-out CV validation per asset domain and sensor, image-quality and coverage thresholds, field calibration, airspace compliance, PX4/ArduPilot geofence and lost-link bench tests, and qualified engineer sign-off. DRIFT never arms, launches, or controls the aircraft.

## References

[1]: https://render.com/docs/deploy-node-express-app "Render: Deploy a Node Express App"
[2]: https://vercel.com/docs/functions "Vercel Functions"

## Vercel frontend and Render backend split

Set `VITE_BACKEND_URL` on the Vercel project to the public Render service origin without a trailing slash. The frontend then sends tRPC traffic to `${VITE_BACKEND_URL}/api/trpc` and OAuth callbacks to `${VITE_BACKEND_URL}/api/oauth/callback`. Set `DRIFT_ALLOWED_ORIGINS` on Render to the exact Vercel origin, such as `https://drift.example.com`; do not use `*` with credentialed requests. The server also accepts the project-scoped immutable Vercel preview hostname (`drift-ai-ml-platform-<deployment>-sckulashri-7163s-projects.vercel.app`) so preview deployments do not fail CORS, while unrelated Vercel domains remain blocked. Evidence media served through the Manus storage proxy must remain addressed through the backend origin unless storage is migrated to an external S3-compatible provider.

The split-host changes are portable and validated locally, but a fully working external deployment still requires a Render backend URL, compatible external database, OAuth provider configuration, storage credentials, and any production CV endpoint credentials. The current Manus-managed OAuth, Forge, and storage values are not assumed to be portable to Render.

## Render session verification record

The authenticated Render workspace can see `RidhimaKulashriz/DRIFT`. The Blueprint flow reported that `render.yaml` is not present on the remote `main` or `feat/drift-platform` branches, so the manual Web Service flow was used for configuration review. Render detected Node after selection, and the reviewed service settings are `main`, Oregon, Free plan, `pnpm install --frozen-lockfile && pnpm build`, and `pnpm start`. No deployment was submitted because the external database, OAuth, storage/Forge replacement, and bridge secrets were not available in Render.

The local split-host implementation now supports `VITE_BACKEND_URL`, `FRONTEND_APP_URL`, and `DRIFT_ALLOWED_ORIGINS`. Its CORS middleware has automated allowlist/preflight tests, and the Vercel artifact publishes `dist/public` after the standard production build.

## GitHub synchronization blocker

The local deployment-ready commit is `c658e2ac923a8227de931a17623cff355a43f705`. The DRIFT remote feature branch remains at `c6a53dc8c2805c4b233af6e8cccdf0665ff7a021`. A direct push was attempted and rejected by GitHub with HTTP 403 (`Permission to RidhimaKulashriz/DRIFT.git denied`). The exact binary-capable delta is preserved at `docs/latest_local_delta.patch` for manual application or upload through a GitHub-authenticated browser session.

## Complete split-host secret and configuration matrix

| Variable | Host | Required | Purpose |
|---|---|---:|---|
| `DATABASE_URL` | Render | Yes | SSL-enabled production MySQL/TiDB connection used by Drizzle persistence. |
| `JWT_SECRET` | Render | Yes | Production session signing secret. |
| `VITE_APP_ID` | Render and Vercel | Yes | OAuth application identifier. |
| `VITE_OAUTH_PORTAL_URL` | Render and Vercel | Yes | OAuth login portal base URL. |
| `OAUTH_SERVER_URL` | Render | Yes | OAuth token/session backend base URL. |
| `FRONTEND_APP_URL` | Render | Yes | Exact public Vercel origin for post-callback redirect allowlisting. |
| `VITE_BACKEND_URL` | Vercel | Yes | Exact public Render origin used for tRPC and backend OAuth start. |
| `DRIFT_ALLOWED_ORIGINS` | Render | Yes | Comma-separated Vercel origin allowlist for credentialed CORS. |
| `DRIFT_INGEST_TOKEN` | Render and bridge | Yes | Shared secret for authenticated PX4/MAVLink telemetry and evidence ingress. |
| `BUILT_IN_FORGE_API_URL` / replacement | Render | Yes | AI, storage, or data API endpoint that is contract-compatible outside Manus. |
| `BUILT_IN_FORGE_API_KEY` / replacement | Render | Yes | Server credential for the configured AI/storage/data provider. |
| `VITE_FRONTEND_FORGE_API_URL` / replacement | Vercel | If used | Browser-safe frontend API endpoint for enabled built-in-compatible features. |
| `VITE_FRONTEND_FORGE_API_KEY` / replacement | Vercel | If used | Browser-safe public key only; never place a server secret here. |
| `ML_INFERENCE_URL` | Render | Optional | Approved production computer-vision inference service; unset uses deterministic review-required fallback. |
| `ML_INFERENCE_TOKEN` | Render | Optional | Credential for the production CV inference service. |
| `DRIFT_HARDWARE_ENDPOINT` | Render | Optional | Approved companion-computer/PX4 bridge health endpoint; unset keeps simulator mode available. |

`OWNER_OPEN_ID`, `OWNER_NAME`, and analytics variables are optional product/observability configuration. Never commit any value, `.env` file, or provider export to GitHub. Before field use, operators must validate model performance on held-out data for each infrastructure domain and sensor, and must complete flight-safety, geofence, lost-link, and engineer sign-off procedures.

## External dashboard check

The authenticated Render dashboard is reachable and currently lists other services, but no visible service named DRIFT was found. No service creation, environment-variable submission, or deployment action was performed. This confirms that the external-only release still requires an authorized repository/service setup and production secret configuration.

## Provider adapters versus hosting

Vercel and Render are the only public hosting targets for this release. The remaining `VITE_OAUTH_PORTAL_URL`, `OAUTH_SERVER_URL`, `BUILT_IN_FORGE_API_URL`, and `BUILT_IN_FORGE_API_KEY` names describe provider adapters inherited from the application runtime; they are not deployment destinations. In an external release, Render may point those adapters at the organisation’s compatible OAuth, AI, storage, and map services, while Vercel only receives browser-safe values. If the organisation does not use the compatible provider, replace the adapter implementation and environment names before field deployment rather than routing the application through Manus hosting.

The checked-in `vercel.json` builds only the frontend into `dist/public`. The checked-in `render.yaml` builds and starts the Node API service. This separation is the release boundary: no Manus Publish action, Manus-hosted web service, or sandbox URL is required for the Vercel + Render deployment.

## Supabase Auth and private evidence storage

The optional Supabase integration uses **Vercel only for browser-safe Auth configuration** and **Render only for server-side Auth verification and private Storage operations**. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel. Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_EVIDENCE_BUCKET=drift-evidence` only in Render. Never copy `SUPABASE_SERVICE_ROLE_KEY` to Vercel, browser code, logs, source control, or chat.

After those server variables are present, setting `DRIFT_SUPABASE_STORAGE_ENABLED=true` in Render deliberately enables portable uploads and short-lived signed download URLs. Until that explicit flag is set, real evidence uploads fail closed and no report artifact should be treated as portable storage. Public walkthroughs remain browser-session-only; Supabase Auth users are created as DRIFT `citizen` users until an approved administrator explicitly assigns a higher role.
