CREATE TYPE "public"."alert_status" AS ENUM('open', 'acknowledged', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('operational', 'watch', 'restricted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('bridge', 'road', 'rail', 'building', 'utility');--> statement-breakpoint
CREATE TYPE "public"."correlation_relation" AS ENUM('evidence', 'finding', 'telemetry');--> statement-breakpoint
CREATE TYPE "public"."defect_status" AS ENUM('detected', 'under_review', 'verified', 'scheduled', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."defect_type" AS ENUM('pothole', 'crack', 'structural', 'corrosion', 'spalling', 'exposed_rebar', 'water_intrusion', 'settlement', 'rail_alignment', 'obstruction', 'lighting_failure');--> statement-breakpoint
CREATE TYPE "public"."estimate_status" AS ENUM('draft', 'reviewed', 'approved');--> statement-breakpoint
CREATE TYPE "public"."evidence_source" AS ENUM('hardware', 'upload', 'simulator');--> statement-breakpoint
CREATE TYPE "public"."inference_source" AS ENUM('production-cv', 'deterministic-fallback');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('photo', 'video', 'annotation', 'report');--> statement-breakpoint
CREATE TYPE "public"."mission_mode" AS ENUM('demo', 'hardware');--> statement-breakpoint
CREATE TYPE "public"."mission_status" AS ENUM('planned', 'preflight', 'active', 'paused', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."quality_status" AS ENUM('pending', 'pass', 'review', 'fail');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('draft', 'ready', 'signed_off');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('approve', 'override', 'reject', 'needs_site_visit');--> statement-breakpoint
CREATE TYPE "public"."review_state" AS ENUM('pending', 'approved', 'overridden', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'engineer', 'citizen', 'user');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"missionId" integer NOT NULL,
	"defectId" integer NOT NULL,
	"severity" "severity" NOT NULL,
	"title" varchar(180) NOT NULL,
	"message" text NOT NULL,
	"status" "alert_status" DEFAULT 'open' NOT NULL,
	"acknowledgedBy" integer,
	"acknowledgedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"assetType" "asset_type" NOT NULL,
	"locality" varchar(160) NOT NULL,
	"latitude" varchar(32) NOT NULL,
	"longitude" varchar(32) NOT NULL,
	"criticality" integer DEFAULT 3 NOT NULL,
	"status" "asset_status" DEFAULT 'operational' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditEvents" (
	"id" serial PRIMARY KEY NOT NULL,
	"missionId" integer,
	"defectId" integer,
	"actorId" integer,
	"action" varchar(120) NOT NULL,
	"details" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "defects" (
	"id" serial PRIMARY KEY NOT NULL,
	"missionId" integer NOT NULL,
	"assetId" integer NOT NULL,
	"evidenceId" integer,
	"defectType" "defect_type" NOT NULL,
	"label" varchar(120) NOT NULL,
	"confidencePercent" integer NOT NULL,
	"zeroErrorScore" integer NOT NULL,
	"severity" "severity" NOT NULL,
	"status" "defect_status" DEFAULT 'detected' NOT NULL,
	"reviewState" "review_state" DEFAULT 'pending' NOT NULL,
	"latitude" varchar(32) NOT NULL,
	"longitude" varchar(32) NOT NULL,
	"boundingBox" jsonb,
	"explanation" jsonb,
	"inferenceModel" varchar(200),
	"inferenceSource" "inference_source",
	"inferenceAnnotation" text,
	"inferenceCapturedAt" timestamp with time zone,
	"inspectionDomain" varchar(80),
	"coveragePercent" integer,
	"uncertainty" jsonb,
	"correlationKey" varchar(160),
	"reviewRequired" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"missionId" integer NOT NULL,
	"uploadedBy" integer,
	"fileName" varchar(255) NOT NULL,
	"mimeType" varchar(120) NOT NULL,
	"storageKey" varchar(512) NOT NULL,
	"storageUrl" varchar(768) NOT NULL,
	"mediaKind" "media_kind" NOT NULL,
	"latitude" varchar(32),
	"longitude" varchar(32),
	"playbackSeconds" integer,
	"source" "evidence_source" DEFAULT 'upload' NOT NULL,
	"sha256" varchar(64),
	"capturedAt" timestamp with time zone,
	"cameraId" varchar(120),
	"provenance" jsonb,
	"captureZone" varchar(80),
	"headingDegrees" integer,
	"qualityStatus" "quality_status" DEFAULT 'pending',
	"imageQuality" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspectionCorrelations" (
	"id" serial PRIMARY KEY NOT NULL,
	"correlationKey" varchar(160) NOT NULL,
	"missionId" integer NOT NULL,
	"assetId" integer,
	"evidenceId" integer,
	"defectId" integer,
	"telemetryId" integer,
	"relationType" "correlation_relation" NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" serial PRIMARY KEY NOT NULL,
	"assetId" integer NOT NULL,
	"createdBy" integer,
	"name" varchar(180) NOT NULL,
	"mode" "mission_mode" DEFAULT 'demo' NOT NULL,
	"status" "mission_status" DEFAULT 'planned' NOT NULL,
	"startedAt" timestamp with time zone,
	"completedAt" timestamp with time zone,
	"hardwareAdapter" varchar(80),
	"operatorNote" text,
	"inspectionProfile" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repairEstimates" (
	"id" serial PRIMARY KEY NOT NULL,
	"defectId" integer NOT NULL,
	"estimateCents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"assumptions" jsonb,
	"status" "estimate_status" DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"missionId" integer NOT NULL,
	"title" varchar(220) NOT NULL,
	"narrative" text NOT NULL,
	"storageKey" varchar(512),
	"storageUrl" varchar(768),
	"status" "report_status" DEFAULT 'draft' NOT NULL,
	"generatedBy" varchar(80) DEFAULT 'zeroerror' NOT NULL,
	"inspectionScope" jsonb,
	"signoff" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"defectId" integer NOT NULL,
	"reviewerId" integer,
	"decision" "review_decision" NOT NULL,
	"priorityOverride" "severity",
	"note" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "severityHistory" (
	"id" serial PRIMARY KEY NOT NULL,
	"defectId" integer NOT NULL,
	"previousSeverity" "severity",
	"nextSeverity" "severity" NOT NULL,
	"score" integer NOT NULL,
	"reason" text NOT NULL,
	"changedBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telemetry" (
	"id" serial PRIMARY KEY NOT NULL,
	"missionId" integer NOT NULL,
	"latitude" varchar(32) NOT NULL,
	"longitude" varchar(32) NOT NULL,
	"altitudeMeters" integer NOT NULL,
	"speedMps" integer NOT NULL,
	"batteryPercent" integer NOT NULL,
	"capturedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'engineer' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
