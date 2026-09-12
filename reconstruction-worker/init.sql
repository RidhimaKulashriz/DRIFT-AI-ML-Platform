CREATE TABLE IF NOT EXISTS "reconstruction_jobs" (
  "id" serial PRIMARY KEY,
  "jobKey" varchar(80) NOT NULL UNIQUE,
  "name" varchar(220) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'queued',
  "inputFileName" varchar(260) NOT NULL,
  "inputMimeType" varchar(120) NOT NULL,
  "inputSizeBytes" integer NOT NULL,
  "latitude" varchar(32) NOT NULL,
  "longitude" varchar(32) NOT NULL,
  "altitudeMeters" integer NOT NULL,
  "inputMetadata" jsonb NOT NULL,
  "qualityReport" jsonb NOT NULL,
  "stages" jsonb NOT NULL,
  "artifactManifest" jsonb,
  "errorMessage" text,
  "createdBy" integer,
  "startedAt" timestamptz,
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reconstruction_jobs_status_idx ON "reconstruction_jobs"("status");
CREATE INDEX IF NOT EXISTS reconstruction_jobs_created_at_idx ON "reconstruction_jobs"("createdAt");
