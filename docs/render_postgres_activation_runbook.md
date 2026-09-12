# DRIFT Render PostgreSQL Activation Runbook

## Purpose and Safety Boundary

This runbook activates DRIFT's PostgreSQL-backed contractor, DSI, CCTV-governance, routing, handoff, and approved-source RAG features **only after** the Render database credential has been rotated. It contains no password, connection string, API key, or copied production output.

> Do not paste a replacement database URL into chat, source control, a client-side variable, or a Vercel environment variable. Enter it only through Render's authenticated environment-variable interface.

## Preconditions

| Check | Required state | Stop condition |
|---|---|---|
| Credential hygiene | The previously exposed database credential has been rotated in Render. | A prior credential remains active or has been copied into a message or file. |
| Source revision | Render is deploying public `main` with the PostgreSQL schema and `drizzle-postgres` history. | A service is deploying another repository, branch, or commit. |
| Schema assessment | A read-only schema inventory has been reviewed in authenticated Render. | Existing tables or migration history are unknown. |
| Scope authorization | A project owner approved the first real organization, asset, SLA, and evidence records. | Only reference or demo values are available. |
| Storage/auth | External object storage and project-role identity design are accepted for real evidence and role actions. | Real actions would fall back to public-demo access or non-portable storage. |

## 1. Rotate and Set the Database Credential

In the authenticated Render dashboard, open **drift-db** and use **Credential Rotation** to create a new default credential. In the Render Node service environment settings, replace server-side `DATABASE_URL` with the newly generated **internal** PostgreSQL connection URL, save it, and wait for redeploy. The browser must never receive this value; Vercel should retain only the Render API origin in `VITE_BACKEND_URL`.

## 2. Read-Only Schema Assessment

Before applying SQL, inspect the target database through Render's secure service shell or another approved operator workflow. Record the outcome, not the secret. Confirm `__drizzle_migrations`, base DRIFT tables (`assets`, `missions`, `evidence`, and `reports`), attachment columns on `evidence` and `reports`, and accountability tables (`contractors`, `contractorTickets`, `knowledgeDocuments`, and `knowledgeRetrievalRuns`).

> If application tables exist but migration history is not trustworthy, stop. Do not replay the baseline migration or invent history; reconcile it in a backup-aware maintenance window.

## 3. Apply Only Required Reviewed SQL

| Order | Migration | Purpose | Safety review |
|---|---|---|---|
| 0000 | `0000_light_queen_noir.sql` | Base DRIFT PostgreSQL schema | Create-only baseline; apply only to a verified empty schema. |
| 0001 | `0001_known_rocket_racer.sql` | Adds server-side evidence/report attachment columns | Additive alteration. |
| 0002 | `0002_perfect_speedball.sql` | Accountability, CCTV governance, DSI, ticket, routing, handoff, publication, and RAG tables | Create-only/additive feature migration; no `DROP`, `DELETE`, or `TRUNCATE`. |

Apply only steps supported by the inventory and record the revision and operator in the approved change log. Do not use a public browser form, fabricate migration history, or create sample contractors or tickets as a test.

## 4. Post-Deploy Verification

After Render deploys, verify the following from the public Vercel application and authenticated project accounts:

1. `drift.accountability.overview` returns normally; before migration it shows **configuration required**, and after migration it may show empty ready arrays.
2. The Accountability workspace shows zero contractor, ticket, routing, handoff, and publication records until authorized project data exists.
3. An unauthenticated visitor cannot create tickets or retrieve RAG content.
4. An administrator can register knowledge only as a draft; independent approval is required before role-scoped retrieval.
5. An engineer cannot mark contractor closure as fixed without linked follow-up evidence and an explicit verification decision.
6. A CCTV candidate stays permissioned and zone-level; it never triggers autonomous drone operation.

## 5. Real Data Onboarding Order

Add live records only in this order: approved project and asset registry, authenticated contractor organization, authority/ownership boundary and SLA rule, original permitted evidence, engineer-reviewed DSI factor card, ticket with verification criterion, contractor closure proof, then engineer follow-up decision. Any missing dependency must stay visibly unresolved rather than being replaced with demo data.

## Remaining Production Gates

Database activation alone does not make original evidence or contractor actions production-ready. Live UAV, CCTV, report, and contractor data still require approved external object storage, an external identity provider with project roles, named data-retention rules, and client-authorized data-processing arrangements.
