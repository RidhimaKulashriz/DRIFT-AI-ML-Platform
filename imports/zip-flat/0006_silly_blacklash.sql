CREATE TYPE "public"."security_observation_source" AS ENUM('authorized_bridge_health', 'approved_security_adapter');--> statement-breakpoint
CREATE TYPE "public"."security_observation_status" AS ENUM('pending_review', 'validated', 'rejected', 'expired');--> statement-breakpoint
CREATE TABLE "securityObservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"assetId" integer,
	"cameraSourceId" integer,
	"source" "security_observation_source" NOT NULL,
	"integrationName" varchar(160) NOT NULL,
	"sourceRecordReference" varchar(240) NOT NULL,
	"observationType" varchar(120) NOT NULL,
	"observationSummary" text NOT NULL,
	"authorizedScope" text NOT NULL,
	"retentionUntil" timestamp with time zone NOT NULL,
	"observedAt" timestamp with time zone NOT NULL,
	"integrityMetadata" jsonb NOT NULL,
	"status" "security_observation_status" DEFAULT 'pending_review' NOT NULL,
	"reviewedBy" integer,
	"reviewedAt" timestamp with time zone,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "securityObservations_sourceRecordReference_unique" UNIQUE("sourceRecordReference")
);
