# Supabase Integration Setup Status

DRIFT is using the Supabase path selected by the project owner for production identity and portable evidence storage. The owner has authenticated to the Supabase organization and the isolated `drift-production-controls` project is provisioned and healthy in West US (Oregon). No GitHub provider integration, real user, contractor, asset, CCTV source, ticket, report, evidence artifact, security observation, or UAV activity has been created.

Data API remains enabled. Automatic table exposure has been disabled and automatic Row Level Security enabled. Provider-generated database passwords, API keys, service-role keys, and connection strings must remain inside provider configuration screens and must never be copied into chat or source control. Deployment configuration must use secure provider environment controls.

Supabase Auth Site URL and the only approved redirect URL have been set to the DRIFT production Vercel origin. This limits authentication returns to the deployed application. Supabase’s JWT documentation specifies using project access tokens for authenticated API access and using verified JWT claims rather than trusting unverified client input: <https://supabase.com/docs/guides/auth/jwts>.

The project now has a private `drift-evidence` bucket with a 50 MB maximum object size. It permits only JPEG, PNG, WebP, MP4, and PDF MIME types. There are no bucket policies or uploaded objects yet; access policies must be defined and verified before DRIFT claims portable production evidence storage.

The application adapter is deliberately fail-closed until the server-only Render environment flag `DRIFT_SUPABASE_STORAGE_ENABLED=true` is set alongside the secure Supabase values. Supplying credentials alone does not activate uploads or report artifact storage; this prevents test and staging processes from writing to the production evidence bucket by accident.

Supabase documentation states that private-bucket operations are controlled by Row Level Security policies and that uploads are denied without an applicable policy: <https://supabase.com/docs/guides/storage/security/access-control>. The selected DRIFT model will use server-side service access for validated application operations and short-lived signed download URLs; the service-role key must never reach browser code.

No real user, contractor, asset, CCTV source, ticket, report, evidence artifact, security observation, or UAV activity may be created during provider setup.
