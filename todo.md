# Project TODO

- [x] Define DRIFT domain schema for assets, missions, telemetry, defects, severity history, repair estimates, reviews, reports, audit events, and evidence metadata.
- [x] Apply database migration and add typed backend query helpers for the DRIFT data model.
- [x] Add secure S3-backed evidence upload and metadata persistence for photos, video clips, annotated outputs, and reports.
- [x] Implement a configurable drone hardware adapter with health, retry, safe fallback, and documented test endpoints.
- [x] Implement a reliable simulator that creates virtual missions, telemetry, evidence, detections, alerts, map positions, repair estimates, and reports without physical hardware.
- [x] Implement the ML inference adapter for pothole, crack, and structural-defect results with annotations, labels, confidence, and explainable severity inputs.
- [x] Implement AI decision support for ZeroError prioritization and engineering-ready report narratives with clear manual-review fallback.
- [x] Build tRPC procedures for mission operations, asset management, map filtering, evidence review, alerts, reports, role workspaces, and audit history.
- [x] Build the tactile industrial dashboard with live defect map, maintenance queue, mission monitoring, alerts, evidence, and reports.
- [x] Build dedicated administrator, engineer, and citizen views with appropriate actions and manual override controls.
- [x] Add upload/playback flows, validation states, error handling, and filtering by asset, mission, defect type, severity, status, and review state.
- [x] Write Vitest coverage for core scoring, simulator, hardware fallback, review override, and tRPC operations.
- [x] Write GitHub-ready setup documentation, environment-variable guidance, integration-test guidance, and production deployment documentation.
- [x] Verify responsive UI, backend flows, storage behavior, and demo-mode mission lifecycle in the browser.
- [x] Save a project checkpoint and provide publish guidance for the verified deployment.
- [x] Verify the exact DRIFT repository link embedded in the PDF and raise a pull request with the completed, verified DRIFT platform.
- [x] Use the GitHub browser upload flow on the DRIFT feature branch before opening the pull request.
- [x] Add endpoint health-check and retry behavior for the configured drone hardware adapter, with documented success and failure tests.
- [x] Persist simulator evidence and alert records, then surface alerts in the operations dashboard.
- [x] Add backend APIs for asset lifecycle, alert actions, filtered map queries, report retrieval, and audit-history retrieval.
- [x] Enforce administrator, engineer, and citizen role permissions server-side and expose distinct role-focused workspaces.
- [x] Add UI filters for asset, mission, defect type, status, and review state, and verify evidence storage persistence through the completed simulator lifecycle.
- [x] Extend Vitest coverage for simulator lifecycle, review override, hardware retry, and tRPC mission, evidence, report, and alert operations.
- [x] Add complete frontend, backend, and ML-adapter deployment documentation and a tracked environment-template document without committing secrets.
- [x] Document request-triggered hardware retry behavior and add success-path health-probe coverage.
- [x] Complete asset update and deletion APIs and add a dedicated filtered map-data query.
- [x] Add explicit administrator, engineer, and citizen application roles with server-authorized workspace access.
- [x] Verify persisted simulator-evidence retrieval in the Evidence Vault after a clean simulator run while retaining authenticated access for original uploads.
- [x] Add automated coverage for simulator creation, evidence-listing, report retrieval, alert listing, map-data retrieval, review override, and hardware retry behavior.
- [x] Bind frontend workspace controls and permissions to authenticated backend role data instead of local-only role state.
- [x] Add and verify distinct administrator, engineer, and citizen access flows with backend authorization coverage.
- [x] Add protected-route tests proving citizen and engineer restrictions for administrator actions and citizen review restrictions.
- [x] Browser-verify the administrator, engineer, and citizen workspace presentations, noting that authenticated deployment roles use the same backend permission matrix.
- [x] Upload/extract the actual DRIFT source files into the `feat/drift-platform` branch so the pull request contains reviewable code, docs, config, and workflows instead of only `drift-source.zip`.
- [x] Re-verify the DRIFT pull-request diff shows the expected source tree and key files before marking repository delivery complete.

თხოვ

# Industry-readiness hardening pass

- [x] Reconcile every PDF requirement against the current source and document any remaining gaps.
- [x] Remove immature placeholder behavior, unsafe claims, and incomplete operational states from the product surface.
- [ ] Harden authentication, role authorization, tenant/data boundaries, input validation, rate limits, audit trail, and error handling.
- [ ] Make asset, mission, telemetry, defect, evidence, alert, review, estimate, and report lifecycles complete and consistent.
- [x] Implement a concrete hardware integration contract for a supported drone/flight-controller path, including telemetry, GPS, media, health, retry, and safe fallback.
- [x] Add real geospatial map tiles and coordinate-aware evidence presentation with documented provider configuration and licensing requirements.
- [x] Provide a real-image ingestion path and a clearly labeled simulator dataset with reproducible coordinates and media provenance.
- [x] Make ML inference pluggable between the built-in adapter and a configured production CV service, with model/version/confidence/annotation provenance.
- [x] Make AI decision support structured, explainable, reviewable, and fail-safe when the AI service is unavailable.
- [x] Complete administrator, engineer, and citizen workflows with server-authorized actions and audit-ready review overrides.
- [x] Add end-to-end integration tests for hardware ingestion, real-map coordinates, ML/AI fallback, uploads, reports, and role restrictions.
- [ ] Re-verify production build, deployment configuration, security boundaries, and browser flows; update the correct DRIFT pull request with reviewable source.

- [x] Document DRIFT’s actual map provider setup and licensing requirements and add a coordinate-aware evidence map/review surface.
- [x] Update the inference API and evidence UI to send actual image data to the production CV adapter and persist model/source/confidence/annotation provenance with reviewable records.

- [x] Replace the nonfunctional playback/evidence placeholder surfaces with real evidence playback/review bound to stored evidence records, or clearly mark/remove unfinished actions from the UI.
- [x] Bind evidence review metadata to actual evidence fields such as capture time, camera, source, and media URL instead of hardcoded or telemetry-substituted values.
- [x] Persist and expose simulator evidence provenance metadata including reference URL, license/author, and generated-versus-reference classification for all simulator media.

- [x] Surface evidence source in the review panel alongside capture time, camera, and media details, with explicit unknown labels.
- [x] Render persisted simulator provenance in the Evidence Vault, including reference URL, license/author, and generated-versus-reference classification.
- [x] Add automated or browser verification notes proving evidence metadata and provenance are returned and displayed end to end.

- [x] Browser-verify a populated Evidence Vault session and confirm source, provenance classification, license/author, and reference URL are visibly rendered.
- [x] Add automated coverage for evidence records carrying source and provenance, proving the backend query result contract returns those fields to the UI layer.

- [x] Add route-level integration tests for `/api/drift/telemetry` and `/api/drift/evidence`, covering authentication, validation, persistence, and error paths.
- [x] Add an integration verification for upload flow proving stored evidence, inference provenance, and downstream defect/report visibility.
- [x] Add explicit automated coverage or verification notes for AI decision-support fallback and real-map coordinate rendering.

- [ ] Upload the remaining local source directories and files to GitHub and reconcile the exact local-versus-remote inventory.
- [x] Add route-level tests covering successful persistence and returned error paths for both telemetry and evidence ingress.
- [x] Add automated route-level error assertions for unauthorized and invalid telemetry/evidence ingress requests.
- [x] Run and document a true upload-to-evidence-to-defect/report verification using a real uploaded image payload.
- [x] Re-run the latest expanded-scope end-to-end verification after the current local changes.
- [x] Fix HTTP evidence validation to accept safe image/video data-URI prefixes while validating the encoded payload.
- [x] Verify report generation and visibility for the real uploaded image’s persisted defect flow.
- [x] Implement an application report-generation procedure for uploaded evidence and verify its returned content.
- [x] Re-run browser verification after the latest expanded-scope UI and bridge changes.
- [ ] Document detailed browser verification for domain filters, capture zones, quality/coverage, correlation, and report visibility.
- [ ] Browser-verify expanded infrastructure domain filtering and confirm filtered results in the UI.
- [ ] Browser-verify capture-zone, quality/coverage, and quality-gate metadata in Evidence Vault/review UI.
- [ ] Browser-verify correlation review and generated report visibility/sign-off state for the real uploaded image.
- [x] Generate and configure a secure DRIFT_INGEST_TOKEN for authenticated bridge verification.
- [x] Complete a security and lifecycle audit of tenant boundaries, authorization, validation, rate limits, and report/evidence state transitions.
- [ ] Synchronize the latest expanded local source to the DRIFT GitHub branch and verify the correct PR diff.

# Vercel frontend / Render backend split

- [x] Audit frontend API-base, OAuth callback, cookie/CORS, storage URL, map proxy, and backend-ingress assumptions for split hosting.
- [x] Fix split-host OAuth nonce/state handling and redirect to a configured Vercel frontend origin after backend session creation.
- [x] Add regression coverage for the cross-origin OAuth start/callback path.
- [x] Add Vercel frontend deployment configuration and documented Render API URL environment variable.
- [x] Add a Vercel-specific deployment artifact and verify the frontend build contract.
- [ ] Configure and validate backend CORS/origin handling for the deployed Vercel frontend.
- [x] Add automated CORS tests for allowed/rejected origins, preflight, credentials, and headers.
- [x] Validate the split deployment artifact and document required external provider secrets.
- [ ] Validate the built Vercel artifact against live Render backend URLs after required external secrets are configured.
- [ ] Run and document split-host verification for login, tRPC, storage, and bridge routes against deployed Vercel and Render URLs.

# External hosting preparation

- [ ] Create the Render free Node web service from the DRIFT repository with the validated build/start configuration.
- [x] Configure required Render environment variables or record the exact missing-secret blocker.
- [ ] Verify the deployed Render URL, frontend, backend health, database persistence, AI/ML fallback, storage, and bridge authentication.

- [x] Audit Vercel/Render compatibility for the current full-stack server, database, storage, auth, ML, AI, and drone-ingestion boundaries.
- [x] Add portable deployment configuration and environment documentation without committing secrets.
- [x] Validate the portable production artifact and record external-service prerequisites and limitations.

# Deployment release gate

- [x] Audit production environment variables and identify mandatory live-service configuration versus safe fallback mode.
- [x] Run frontend, backend, database, ML, AI, storage, and authenticated hardware-ingress release checks.
- [x] Document release-blocking configuration issues and save a deployment-prepared checkpoint.
- [ ] Publish through the Management UI after the validated checkpoint is ready.
- [x] Add explicit AI decision-support fallback test coverage when the AI service is unavailable.
- [ ] Re-verify the final PR/merge diff against the local file inventory and record the exact key files present.

# Expanded public-infrastructure inspection scope

- [x] Extend the defect taxonomy and inspection contracts for roads, bridges, railways, buildings, utilities, drainage, pavement, signage, barriers, lighting, and under-structure findings.
- [x] Add capture-zone and access metadata for above-deck, under-bridge, tunnel, confined, low-light, and oblique drone inspection media.
- [x] Add calibrated confidence, coverage completeness, image-quality gates, model/version provenance, and human-review requirements to every AI finding.
- [x] Add multi-pass evidence correlation so findings can be linked across images, video frames, GPS traces, assets, and missions without claiming universal detection.
- [x] Add report-generation coverage for domain-specific findings, evidence references, uncertainty, recommended next inspection, and engineer sign-off.
- [x] Add expanded hardware integration documentation for PX4/MAVLink telemetry, camera metadata, RTSP/media bridges, geofencing, lost-link behavior, and operator-controlled flight safety.
- [x] Add tests and browser verification for multi-domain filtering, capture zones, confidence/coverage states, evidence correlation, and report generation.
- [ ] Update the correct GitHub pull request from feat/drift-platform into main after the expanded scope is validated.
- [x] Fix protected telemetry ingress validation to pass missionId and speedMps into the adapter, then rerun route-level persistence tests.

# External-only hosting constraint

- [x] Do not publish or deploy DRIFT through Manus; use only Vercel for the frontend and Render for the backend/API.
- [ ] Keep the final handoff focused on external Vercel/Render URLs, provider secrets, and live verification status.

# Map and report quality upgrade

- [x] Make critical, high, medium, and low findings visibly render as color-coded markers on the live map with legend, counts, and filter state.
- [x] Add a clear selected-finding map detail panel showing defect type, severity, score, confidence, quality gate, coordinates, asset, mission, and review state.
- [x] Replace the weak report output with a polished engineer-ready PDF layout including cover, executive summary, severity breakdown, map/coordinate context, evidence images, finding details, recommendations, cost estimate, uncertainty, and sign-off.
- [x] Add an interactive report preview/download flow with clear empty/loading/error states; populated report records are browser-visible, while protected generation requires an authenticated engineer session.
- [x] Add Vitest coverage for severity aggregation, map marker data, report sections, and report-generation failure states.
- [ ] Complete authenticated browser verification of protected PDF generation and inline PDF preview after a valid engineer session is available; do not bypass authentication.

# Validation gaps to resolve before the next checkpoint

- [x] Remove or gate remaining Manus-specific publish/auth/deployment guidance so the checked-in app and docs clearly enforce the external-only Vercel + Render path.
- [x] Extend the selected-finding detail panel to explicitly display asset identity and quality-gate fields, then browser-verify those fields.
- [x] Add dedicated automated tests for severity-count aggregation, enriched getMapData marker fields, and report-generation failure/error handling paths.

# DRIFT AI and exact critical-map upgrade

- [x] Add DRIFT AI as an evidence-grounded infrastructure-inspection copilot with selected-finding, map, telemetry, evidence, and report context.
- [x] Keep DRIFT AI credentials server-side and never hardcode or expose them in frontend code.
- [ ] Revoke the OpenAI key exposed in chat and provide a newly rotated key for production DRIFT AI use.
- [x] Make critical findings open exact coordinate-centered map views with clear severity markers, labels, and selected context on real provider tiles or the coordinate fallback.
- [x] Add DRIFT AI tests for safe fallback, context binding, and unsupported-claim handling.
- [x] Add an explicit DRIFT AI test proving unsupported safety, repair, or certification claims remain qualified and engineer-review dependent.

# Final validation clarifications

- [x] Isolate or explicitly document Manus-specific OAuth/Forge runtime adapters as optional third-party integrations rather than hosting, and prove the Vercel + Render artifact path does not depend on Manus hosting.
- [x] Capture a fresh browser verification of the selected-finding asset name, capture zone, and quality-gate text after reload.
- [x] Add a deployment contract test proving Vercel frontend and Render backend artifacts are the external release path while provider adapters remain configurable.

# External deployment and in-map marker release

- [x] Prepare the final Vercel frontend and Render backend deployment contract without using Manus hosting.
- [x] Render every valid critical, high, medium, and low finding as an in-map marker/label with exact coordinates, not only as a separate locate action.
- [x] Verify marker click-through details and severity colors in the rendered map at populated simulator coordinates.
- [x] Document any missing provider login, database, OAuth, storage, or map credentials as an external release blocker rather than claiming deployment completion.

# DRIFT AI answer-quality upgrade

- [x] Replace free-form provider output with a structured inspection answer containing direct answer, observed evidence, inference, risk, exact location, recommended next action, confidence, and engineer-review requirement.
- [x] Improve DRIFT AI context binding so each answer explicitly names the selected finding and distinguishes missing evidence from available evidence.
- [x] Add deterministic intent handling for location, severity, evidence quality, next action, report, and unsupported questions before invoking the provider.
- [x] Improve assistant loading, provider-error, fallback, and response-source UI states.
- [x] Add tests proving structured answers are useful, context-bound, and safe when the provider returns vague or unsupported content.

# Complete map points and varied DRIFT AI behavior

- [x] Render every valid finding returned by the backend as its own visible map point, with no first-ten truncation in the in-map register.
- [x] Prevent coordinate overlap from hiding findings by offsetting coincident markers while preserving exact coordinates in the detail view.
- [x] Make DRIFT AI distinguish location, severity, evidence, quality, next action, report, comparison, and general questions with different grounded answers.
- [x] Add varied-question tests proving DRIFT AI does not return the same answer for different intents.

# Attached DRIFT AI specification

- [x] Add direct answers for most-critical defects, immediate repairs, severity reasoning, inspection summaries, manual inspection guidance, and engineer review boundaries.
- [x] Add derived infrastructure health score, deterioration-risk band, and transparent risk drivers from actual stored inspection data.
- [x] Add per-defect repair recommendation, priority, suggested verification, and persisted repair-cost context without inventing unsupported measurements.
- [x] Add historical inspection comparison using stored prior missions when available, with an explicit no-history state when unavailable.
- [x] Add natural-language dashboard actions for filtering/locating findings, while requiring confirmation before changing filters or operational state.
- [x] Add DRIFT AI dashboard summary showing analyzed evidence count, critical count, health, risk, and exposure from actual data.

# Final map visibility, interaction, and external deployment pass

- [x] Reposition or collapse map controls so the finding register and all real markers cannot be obscured by dropdowns or overlays.
- [x] Add explicit marker hit-area, label contrast, z-index, and selected-state styling for all severity points on provider and fallback maps.
- [x] Audit every visible application button and replace inert controls with a real action, navigation, confirmation, or truthful disabled state.
- [x] Add interaction tests for map selection, severity filters, AI filter confirmation, report controls, evidence actions, hardware controls, and role-gated review buttons.
- [x] Validate the final Vercel frontend and Render backend artifacts and document the exact remaining provider-access blockers for live deployment.

# In-map point visibility clarification

- [x] Keep every valid finding point rendered inside the map canvas itself on real provider tiles and fallback plot; helper registers and controls must never substitute for map points or obscure them.
- [x] Verify selected marker centering, click-through detail, and severity label visibility inside the map after reload with populated data.

# Connected browser authentication path

- [ ] Check the connected browser/GitHub session for Vercel authentication without requesting or exposing passwords or OTPs.
- [ ] Continue external Vercel and Render deployment only after the provider authorization flow is available and explicitly approved.


# Deployment scope correction — actual DRIFT repository

- [x] Verify actual GitHub DRIFT architecture, entrypoints, `.env.example`, `config.py`, requirements, Docker, and deployment files; do not assume the Manus Vite/tRPC project contract.
- [x] Map the actual DRIFT environment variables to Render and compatible frontend hosting.
- [ ] Generate a strong JWT secret without exposing it in source control or chat.
- [x] Configure the existing Render `drift-db` PostgreSQL/PostGIS database connection after verifying the required connection format.
- [ ] Configure only OAuth, OpenAI, CORS, and other provider variables that the actual DRIFT code requires.
- [x] Create and deploy the actual DRIFT backend/dashboard using a host compatible with FastAPI and Streamlit.
- [ ] Obtain the public frontend URL and apply `FRONTEND_APP_URL` / `DRIFT_ALLOWED_ORIGINS` only if the actual code uses them.
- [ ] Verify health, dashboard, database connectivity, AI inference, map/demo mode, WebSocket, and hardware-ingest flows where supported.
- [ ] Document final deployment URLs, environment requirements, and Jetson/drone connection steps.
- [x] Synchronize the corrected FastAPI/Streamlit hosting patch to GitHub; direct CLI push currently returns HTTP 403, so use the authenticated browser upload flow or obtain repository write permission.
- [x] Do not deploy the stale Node/Vite Render manifest; use the corrected Python FastAPI + Streamlit Render configuration.

- [x] Diagnose Render’s unresolved/404 API deployment and add an explicit compatible Python runtime plus prebuilt ML wheel strategy if required; validate locally before synchronizing and redeploying.
- [x] Urgent five-minute gate: synchronize `.python-version` using Render’s documented version-selection mechanism, trigger the fastest feasible redeploy, and report live reachability or the exact hard blocker.
- [x] Fix deployed Streamlit SyntaxError in `dashboard/utils.py` caused by an unterminated multiline `st.markdown` CSS string, validate syntax, synchronize, and redeploy.
- [ ] Make the user-facing DRIFT dashboard deploy on Vercel, with the FastAPI/ML/PostgreSQL backend remaining on Render; do not present the Render Streamlit service as the final frontend.
- [ ] Inspect the repository client/Vite frontend and determine its exact Render API-base configuration and deployment root.
- [ ] Deploy and verify the Vercel frontend against the live Render API, including CORS and user-facing dashboard flows.
- [ ] Verify deployed ML assets, model paths, imports, inference routes, and startup loading on the actual FastAPI Render service.
- [ ] Run a real demo-image inference against the live ML endpoint and verify a valid prediction or a documented model-asset blocker.
- [ ] Verify the Jetson/drone WebSocket path separately from CPU inference and document any Render Free limitation.
- [ ] Deploy the previously built React/tRPC DRIFT AI frontend on Vercel and its Node/tRPC backend on Render, separate from the FastAPI/ML service.
- [ ] Verify DRIFT AI’s server-side provider/fallback, map markers, reports, and API origin against the deployed Node backend.
- [x] Create private GitHub repository `DRIFT-AI-ML-Platform` and import the working preview source as the clean canonical project; repository is now public by explicit request.
- [x] Preserve and document real drone/Jetson connection, simulator fallback, telemetry, media, inference, geospatial, report, and audit workflows in the new repository.
- [ ] Harden DRIFT AI for typo-tolerant, short, varied, context-grounded questions with clarification and safe engineer-review boundaries.
- [ ] Run full validation and record deployment prerequisites and live hosting status for the new canonical repository.
- [x] Add and document safe drone connectivity options: MAVLink over UDP/Wi-Fi, USB/serial, Jetson companion bridge, optional supported Bluetooth telemetry adapter, RTSP/media, GPS, battery, health, retry, lost-link, and operator-confirmed actions.
- [x] Add hardware capability detection and explicit safe simulator fallback when no drone or companion computer is connected.
- [x] Add integration tests for telemetry validation, media correlation, GPS provenance, reconnect behavior, and unsafe-command rejection.
- [x] Audit the new canonical repository’s tracked files for `.env`, passwords, API keys, private keys, credential files, and other sensitive artifacts before making it public.
- [x] Change `DRIFT-AI-ML-Platform` visibility to public and verify anonymous access after the audit.
- [x] Push the complete working preview source into the currently empty public `DRIFT-AI-ML-Platform` repository and verify its canonical tree before claiming repository delivery.
- [ ] Reconcile the canonical public repository with the working preview and define explicit acceptance criteria for multi-domain infrastructure inspection, drone/Jetson ingestion, ML/AI, maps, evidence, reports, simulator, and safety.
- [ ] Implement or verify domain-aware detection contracts for roads, bridges, railways, buildings, utilities, drainage, tunnels, and under-structure inspection zones without claiming universal detection.
- [ ] Implement or verify safe hardware paths for MAVLink UDP/Wi-Fi, USB/serial, Jetson companion, camera/video, GPS, battery, reconnect, lost-link handling, and simulator fallback.
- [ ] Implement or verify grounded DRIFT AI question handling, evidence-linked answers, clarification, uncertainty, and engineer sign-off boundaries.
- [ ] Run complete validation and prepare a reviewable branch and pull request from the canonical repository before external deployment.
- [ ] Apply all remaining canonical DRIFT implementation and deployment changes directly to the public repository `main` branch; do not create a separate PR branch.
- [x] Add common typo normalization for short DRIFT AI questions and pass the dedicated regression test; synchronized directly to canonical public main.
- [x] Add and synchronize an explicit industry-readiness acceptance contract covering domains, drone paths, ML evidence, DRIFT AI safety, maps, reports, simulator, and security gates.
- [x] Fix DRIFT AI repeated-answer behavior by routing general questions to the server-side OpenAI provider when configured and returning distinct question-aware fallbacks when unavailable.
- [x] Add non-secret provider diagnostics and regression tests for provider success, missing key, provider failure, typo questions, and unsupported safety claims.
- [x] Document that the previously exposed OpenAI key must be revoked and that a newly rotated key belongs only in Render’s secure server environment.
- [x] Configure the user-supplied OpenAI credential only as a server-side test secret and verify provider connectivity without exposing it; require a newly rotated key for Render production.
- [ ] Await an actual operator/drone media upload for live evidence; external internet imagery is intentionally excluded from DRIFT’s detection and evidence surfaces.
- [x] Add working picture preview, open-source, download, locate, and evidence-navigation actions.
- [x] Audit and fix every nonresponsive dashboard control, including navigation, filters, demo, reports, hardware bridge, and DRIFT AI actions.
- [x] Add interaction regression coverage and browser-verify the repaired controls and Pictures/Evidence experience.
- [x] Replace remaining client-side canned DRIFT AI preview replies with a real provider-backed conversational path or an explicit unavailable state.
- [x] Send bounded conversation history and current inspection context to DRIFT AI so follow-up questions are answered in context.
- [x] Expose provider/fallback status in the AI panel and add varied-question regression coverage.
- [x] Surface OpenAI quota/auth/provider status distinctly in DRIFT AI so a 429 quota failure is never presented as a normal answer.
- [x] Add Gemini as the server-side DRIFT AI provider, with bounded context/history and no client or repository key exposure.
- [x] Validate the supplied Gemini credential with a minimal live request and make Gemini provider/quota status explicit in the AI panel.
- [ ] Rotate the chat-exposed Gemini key before configuring the external Render production environment.
- [x] Add a truthful UAV operations workspace with a selectable aircraft profile, MAVLink-compatible telemetry/media bridge contract, camera/RTSP capture configuration, and an explicit simulator mode.
- [x] Require drone-captured or operator-uploaded original media to be labelled with capture source, GPS, timestamp, camera, mission, and inference provenance; keep internet reference images visibly non-live and outside detected-defect claims.
- [x] Bind captured media and resulting ML detections to map locations and PDF reports with evidence provenance and review boundaries.
- [x] Audit every dashboard button and navigation control, implement missing actions or clearly disabled states, and add interaction regression coverage.
- [x] Inventory existing uploaded dataset media and classify each asset as original operator media, simulator, public reference, or unknown before displaying it in DRIFT.
- [ ] Add only approved, provenance-classified uploaded dataset media to the Evidence Vault with an explicit source label and no unsupported real-drone claim.
- [ ] Bind approved uploaded dataset media to an evidence record, coordinate metadata where available, map review, and generated report evidence register.
- [x] Source licence-compatible public infrastructure-defect dataset samples for DRIFT demo inference.
- [x] Display public-dataset samples with dataset, licence, source URL, and explicit non-field/non-drone evidence labels.
- [x] Keep public-dataset samples out of real UAV evidence claims while allowing them to exercise demo inference, maps, and report workflows.
- [ ] Confirm the canonical public repository contains the latest validated DRIFT release before external deployment.
- [x] Create/update the Vercel frontend project from `RidhimaKulashriz/DRIFT-AI-ML-Platform` and capture its deployment URL.
- [x] Create/update the Render Node/tRPC backend from `RidhimaKulashriz/DRIFT-AI-ML-Platform` using secure server-only environment variables.
- [ ] Configure frontend API origin and backend CORS, then validate map, AI, simulator, evidence, and report paths across the live Vercel/Render deployment.
- [x] Surface clearly labelled public-dataset demo media in Operations and Reports in addition to the Evidence Vault, without using it as real-UAV/site evidence.
- [x] Verify cross-workspace public-dataset media actions, labels, and exclusion from site-specific map markers and report findings.
- [x] Verify the Vercel production frontend at its assigned external URL and record the exact origin for backend CORS.
- [x] Configure the canonical Node/tRPC backend as a Render web service with production-safe build and start commands.
- [ ] Add the Vercel production origin to the Render backend CORS allowlist, set the Vercel API base, and validate live cross-origin application flows.
- [x] Deploy and externally verify the Vercel frontend at `https://drift-ai-ml-platform.vercel.app` with the latest public-dataset visuals.
- [x] Resume the free Render Node/tRPC service creation after the account’s mandatory card-verification gate is cleared; do not enter payment details on the user’s behalf.
- [ ] Set `VITE_BACKEND_URL` in Vercel and verify CORS, live map data, AI, simulator, evidence, and report flows after the Render API URL exists.
- [ ] Deploy the canonical DRIFT frontend from `DRIFT-AI-ML-Platform` to Vercel and record the production URL.
- [ ] Deploy the canonical DRIFT Node/tRPC backend to Render with server-only provider and ingress secrets, then record the API URL.
- [ ] Configure Vercel-to-Render CORS, frontend API origin, and secure production environment variables without committing credentials.
- [ ] Verify the deployed map, DRIFT AI provider status, simulator, original-media upload route, and report flow against the live external services.
- [ ] Keep real photo/video evidence limited to operator/drone-original uploads or authenticated bridge capture, with simulator-only demo labels and no external internet images.
- [x] Replace public-dataset image and crack-mask references that use internal storage paths with externally hosted, licence-attributed source URLs and verify they load from the Vercel deployment.
- [x] Configure the Vercel production `VITE_BACKEND_URL` and confirm browser tRPC traffic plus CORS reach `https://drift-node-api.onrender.com`.
- [ ] Provision a compatible external MySQL/TiDB database with TLS for the Node/Drizzle MySQL driver, or deliberately port the persistence layer to PostgreSQL; do not connect the incompatible existing Render PostgreSQL URL.
- [ ] Replace Manus-backed dynamic evidence/report storage with an external S3/R2/Vercel Blob-compatible object store before treating uploaded media and PDF evidence as externally portable production data.
- [x] Expose persistence readiness to the deployed operator UI and disable only storage-dependent actions with an actionable external-database message when no compatible database is configured.
- [x] Remove the hard requirement for Manus `OAUTH_SERVER_URL` in external Vercel/Render mode, retaining protected-action safeguards while an external authentication provider is not configured.
- [x] Remove the Manus Forge Google Maps proxy from the external Vercel release path, retain a reliable coordinate-map fallback, and serve a valid favicon without 404 errors.
- [ ] Assess and, if safe, port the Node/Drizzle persistence layer from MySQL to the existing external PostgreSQL service without committing database credentials or bypassing migration review.
- [x] Port the DRIFT schema, Drizzle driver, insert/upsert semantics, migration configuration, and regression contract from MySQL to PostgreSQL; validate without storing or using an external database credential.
- [ ] Rotate the previously exposed Render PostgreSQL credential, configure it only in Render, apply the reviewed clean PostgreSQL migration, and verify persisted simulator/evidence/report workflows.
- [x] Define contractor-facing USP, primary user roles, evidence-to-decision workflow, and measurable demo outcomes for DRIFT.
- [x] Add a secure contractor knowledge base and RAG workflow that retrieves only approved project documents, evidence metadata, standards excerpts, and reports with visible source citations and no fabricated engineering claims.
- [ ] Build a contractor demo experience that shows capture or dataset input, evidence provenance, AI/RAG guidance, action queue, accountable approval, and report handoff as one traceable workflow.
- [ ] Add permissioned CCTV/video intake with source, retention, camera-zone, and consent metadata; localize review candidates to approved camera zones; require human authorization before preparing any UAV preflight recommendation and never issue flight commands.
- [ ] Add contractor maintenance tickets linked to evidence, location, impact priority, owner, due date, closure proof, and follow-up verification; require engineer review to mark a ticket Fixed, Needs Rework, or Cannot Verify.
- [ ] Ensure contractor identities, assignments, completion claims, and closure proof are created only from authenticated project data; do not seed or hardcode fake contractor records, reviews, or outcomes.
- [x] Add clearly labelled licensed prototype/reference visuals to contractor workflow surfaces without representing them as real contractor, CCTV, drone, or site evidence.
- [ ] Add Decision Support Intelligence (DSI) that transparently combines evidence quality, location confidence, impact, urgency, ticket state, and verification status into advisory contractor priorities with mandatory engineer approval.
- [ ] Add a jurisdictional ownership and routing registry that resolves a reviewed issue to an approved asset owner, responsible team or contractor, SLA rule, and auditable escalation draft without claiming ownership when GIS/contract data is missing.
- [ ] Expand DSI from generic priority to a transparent Defect Severity Index that shows evidence quality, location confidence, asset criticality, approved traffic/operational impact, repeat history, and verification state; do not infer depth, load-bearing risk, or traffic volume without a validated data source.
- [ ] Add low-friction government handoff records with expiring review links and approved-system export adapters, keeping work-order approval explicitly human-authorized and integration credentials server-only.
- [ ] Add contractor SLA tracking and evidence-based reinspection verification so contractor closure remains distinct from engineer-verified repair.
- [ ] Add a controlled public-trust view that publishes only approved, privacy-safe, non-sensitive ticket status information after owner authorization; never expose raw CCTV, personal data, restricted evidence, or unverified AI candidates.
- [ ] Diagnose and fix all currently failing Vercel production assets and HTTP/2 resource-load errors, then verify the public frontend directly.
- [x] Remove or conditionally configure the unresolved Vercel analytics script placeholder so production never requests `/%VITE_ANALYTICS_ENDPOINT%/umami`.
- [ ] Verify and repair every public DRIFT frontend asset, visible control, Vercel-to-Render API flow, simulator, AI, map, evidence, report, authentication, storage, and safe drone-ingress boundary; label any unavoidable external-provider prerequisite rather than simulating success.
- [x] Repair the public dataset preview action so it opens its modal from Operations, Defect Control, Reports, and Hardware Bridge, not only from Evidence Vault.
- [x] Render a dedicated Accountability workspace with DSI factors, ownership/SLA safeguards, real-data-only ticket controls, closure-versus-verification boundary, and controlled-publication messaging.
- [x] Add accountability regression coverage for safe read-only empty states and citizen ticket-creation rejection before any persistence mutation.
- [x] Add deterministic, role-scoped approved-source RAG retrieval with query-hash audit records, explicit no-source refusal, citation display, and reviewed PostgreSQL migration `0002_perfect_speedball.sql`.
- [ ] Apply the reviewed PostgreSQL accountability/RAG migrations only after rotating the Render database credential in the provider UI; then register and independently approve real project knowledge documents before enabling contractor answers.
- [x] Return a truthful empty Accountability readiness state when the deployed PostgreSQL schema has not yet been migrated, without exposing failed SQL queries to public clients.
- [x] Document the safe Render PostgreSQL credential-rotation, migration-verification, and real-data onboarding sequence without collecting credentials in chat or committing them.
- [x] Repair Render-to-Vercel CORS for batched public tRPC reads so browser requests receive an allowed-origin response.
- [x] Route database-backed attachment previews and downloads through Render instead of resolving their relative URLs against Vercel; external object storage remains the future production portability gate.
- [x] Replace the OpenStreetMap fallback with a Google Maps-only surface using a Vercel Production browser configuration, exact coordinate marker support, an explicit missing-key readiness state, no Forge proxy, and live Google tile verification.
- [x] Add contractor role assignment, contractor-only accept/start/note/closure transitions, and audit records without seeding any organization, ticket, proof, or completion data.
- [x] Add permissioned CCTV candidate validation with authorized-camera, purpose, retention, camera-identity, duplicate, evidence-quality, temporal-observation, and engineer-review gates.
- [x] Add a prepared-only UAV follow-up recommendation requiring contractor closure proof, optional reviewed CCTV linkage, expiry, operator/site/airspace/legal/aircraft checks, and audit logging; it does not dispatch, arm, navigate, or command an aircraft.
- [ ] Rotate the previously exposed Render PostgreSQL credential in the provider UI, inspect the actual schema and migration history, and apply the reviewed canonical migration only after clean-schema confirmation; do not provide credentials in chat.
- [ ] Configure real external identity, approved object storage, and authorized contractor/camera records before enabling closure-proof uploads or contractor/CCTV actions in production.
- [x] Add seven contractor-ready public control surfaces for provenance, quality, duplicate suppression, transparent DSI, SLA readiness, closure separation, and audit/RAG handover; each button opens an existing workspace rather than simulating success.
- [x] Add two authentic public-domain issue-class reference visuals with in-product attribution/source controls and an explicit exclusion from DRIFT assets, maps, tickets, reports, model claims, and closure verification.
- [x] Add a direct Google Maps-only public NBI context layer with three bounded 2025 USDOT/BTS public inventory locations, separate marker treatment, linked source, and explicit non-live/non-DRIFT/non-ticket limits.
- [x] Add configuration-required states for missing or failed Google Maps loading so the deployed surface does not silently show a fallback map or invented issue location.
- [ ] Complete a browser-level audit of remaining pre-existing public controls and remove any residual ambiguous simulated-success behavior before production rollout.
