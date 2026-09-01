CREATE TYPE "public"."uav_recommendation_status" AS ENUM('prepared', 'rejected', 'expired', 'completed');--> statement-breakpoint
CREATE TABLE "uavFollowUpRecommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" integer NOT NULL,
	"cctvCandidateId" integer,
	"assetId" integer NOT NULL,
	"zoneLabel" varchar(160),
	"latitude" varchar(32),
	"longitude" varchar(32),
	"triggerReason" text NOT NULL,
	"requiredChecks" jsonb NOT NULL,
	"status" "uav_recommendation_status" DEFAULT 'prepared' NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"preparedBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
