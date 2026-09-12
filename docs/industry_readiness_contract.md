# DRIFT industry-readiness contract

DRIFT is an inspection decision-support platform, not an autonomous flight controller or a universal defect oracle. Every finding must retain evidence provenance, coordinates when available, model/version metadata, confidence, image-quality and coverage gates, review state, and an accountable engineer disposition.

| Capability | Required behavior | Release gate |
| --- | --- | --- |
| Infrastructure domains | Roads, bridges, railways, buildings, utilities, drainage, pavement, signage, barriers, lighting, tunnels, and under-structure capture zones are represented as explicit inspection domains. | Domain filter and representative evidence reviewed by an engineer. |
| Drone connection | PX4/ArduPilot MAVLink telemetry arrives through a Jetson/companion bridge over serial or UDP/Wi-Fi; camera media and GPS are correlated by mission and capture timestamp. | Bench test with a real flight controller or approved simulator; no flight commands are issued by DRIFT AI. |
| Optional Bluetooth | Bluetooth may be used only by a supported companion/telemetry adapter for low-bandwidth status. Primary video and long-range telemetry use a secure network or MAVLink radio path. | Adapter capability and lost-link behavior are tested before field use. |
| ML inference | Model predictions include label, bounding/segmentation annotation, confidence, model/version, source, quality gate, and human-review requirement. | A held-out, domain-specific validation set and field acceptance test are required; no universal accuracy claim. |
| DRIFT AI | Answers are grounded in supplied mission/evidence context, handle short or typo-filled questions, state missing context, distinguish observation from inference, and never certify safety or issue flight commands. | Provider and deterministic fallback tests pass; safety-critical decisions require qualified engineer sign-off. |
| Maps and reports | Findings and telemetry render with exact coordinates where available; reports reference evidence, uncertainty, recommendations, cost rules, and sign-off state. | Coordinate/evidence correlation and generated report are reviewed end to end. |
| No-drone mode | Simulator creates clearly labelled reproducible missions, telemetry, evidence, findings, and reports without implying live aircraft data. | Simulator provenance is visible and every demo record is marked as simulated. |
| Security and operations | Ingress is authenticated and rate-limited, input is validated, audit events are persisted, CORS is allow-listed, and secrets remain server-side. | Automated tests plus a deployment security review pass. |

Render Free is suitable for demonstrations and low-duty API orchestration, but sustained real-time video processing or GPU inference should run on Jetson or a dedicated CV service. A production field deployment also requires hardware bench testing, domain-specific model validation, operator training, regulatory compliance, and a recovery plan.

## OpenAI provider configuration

The backend reads `OPENAI_API_KEY` only on the server. Configure it as a secret environment variable on the Render Node/API service and redeploy that service; do not place it in Vercel client variables, source control, browser code, or chat messages. The key previously posted in chat must be revoked in the OpenAI dashboard and replaced with a newly generated key. DRIFT exposes only non-secret provider outcome metadata (`openai`, `deterministic-fallback`, HTTP status, or `network-error`) to support diagnostics.
