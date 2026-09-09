CREATE TYPE "public"."authority_type" AS ENUM('municipal', 'state', 'national', 'utility', 'private_operator', 'contractor_internal');--> statement-breakpoint
CREATE TYPE "public"."handoff_status" AS ENUM('prepared', 'shared', 'acknowledged', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('draft', 'approved', 'published', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."routing_decision_status" AS ENUM('unresolved', 'proposed', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "authorities" (
	"id" serial PRIMARY KEY NOT NULL,
	"legalName" varchar(220) NOT NULL,
	"authorityType" "authority_type" NOT NULL,
	"contactChannel" varchar(300),
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authorities_legalName_unique" UNIQUE("legalName")
);
--> statement-breakpoint
CREATE TABLE "handoffPackages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" integer NOT NULL,
	"recipientAuthorityId" integer,
	"recipientSystem" varchar(160),
	"status" "handoff_status" DEFAULT 'prepared' NOT NULL,
	"expiresAt" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"accessScope" jsonb NOT NULL,
	"preparedBy" integer NOT NULL,
	"sharedAt" timestamp with time zone,
	"acknowledgedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publicStatusPublications" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" integer NOT NULL,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"publicSummary" text NOT NULL,
	"expectedCompletionAt" timestamp with time zone,
	"privacyReviewNote" text NOT NULL,
	"approvedBy" integer,
	"approvedAt" timestamp with time zone,
	"publishedAt" timestamp with time zone,
	"revokedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routingDecisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" integer NOT NULL,
	"routingRuleId" integer,
	"status" "routing_decision_status" DEFAULT 'unresolved' NOT NULL,
	"sourceReferences" jsonb NOT NULL,
	"rationale" text NOT NULL,
	"reviewedBy" integer,
	"reviewedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routingRules" (
	"id" serial PRIMARY KEY NOT NULL,
	"authorityId" integer NOT NULL,
	"contractorId" integer,
	"slaRuleId" integer,
	"assetType" "asset_type",
	"zoneReference" varchar(200) NOT NULL,
	"boundarySourceReference" varchar(768) NOT NULL,
	"responsibleTeam" varchar(180) NOT NULL,
	"effectiveFrom" timestamp with time zone NOT NULL,
	"effectiveUntil" timestamp with time zone,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slaRules" (
	"id" serial PRIMARY KEY NOT NULL,
	"authorityId" integer NOT NULL,
	"contractReference" varchar(200) NOT NULL,
	"responseTargetHours" integer NOT NULL,
	"closureTargetHours" integer NOT NULL,
	"escalationPolicy" jsonb NOT NULL,
	"businessCalendar" jsonb,
	"policyVersion" varchar(80) NOT NULL,
	"effectiveFrom" timestamp with time zone NOT NULL,
	"effectiveUntil" timestamp with time zone,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
