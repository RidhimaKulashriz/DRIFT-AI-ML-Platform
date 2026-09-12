CREATE TYPE "public"."authority_type" AS ENUM('municipal', 'state', 'national', 'utility', 'private_operator', 'contractor_internal');--> statement-breakpoint
CREATE TYPE "public"."camera_candidate_status" AS ENUM('pending_review', 'rejected', 'ground_check', 'uav_preflight_recommended');--> statement-breakpoint
CREATE TYPE "public"."contractor_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."handoff_status" AS ENUM('prepared', 'shared', 'acknowledged', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."knowledge_document_status" AS ENUM('draft', 'approved', 'superseded', 'archived');--> statement-breakpoint
CREATE TYPE "public"."knowledge_retrieval_status" AS ENUM('retrieved', 'no_accessible_source', 'no_approved_match', 'persistence_required');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('draft', 'approved', 'published', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."routing_decision_status" AS ENUM('unresolved', 'proposed', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ticket_evidence_role" AS ENUM('opening', 'closure_proof', 'follow_up');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('p1', 'p2', 'p3', 'p4', 'insufficient_evidence');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'assigned', 'contractor_closed', 'verification_pending', 'fixed', 'needs_rework', 'cannot_verify');--> statement-breakpoint
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
CREATE TABLE "cameraSources" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerName" varchar(220) NOT NULL,
	"cameraCode" varchar(160) NOT NULL,
	"displayName" varchar(220) NOT NULL,
	"authorizedPurpose" text NOT NULL,
	"zoneLabel" varchar(160) NOT NULL,
	"latitude" varchar(32),
	"longitude" varchar(32),
	"retentionUntil" timestamp with time zone NOT NULL,
	"accessClassification" varchar(80) NOT NULL,
	"consentAndPrivacyNote" text NOT NULL,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cameraSources_cameraCode_unique" UNIQUE("cameraCode")
);
--> statement-breakpoint
CREATE TABLE "cctvCandidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"cameraSourceId" integer NOT NULL,
	"evidenceId" integer NOT NULL,
	"assetId" integer,
	"candidateType" varchar(120) NOT NULL,
	"zoneLabel" varchar(160) NOT NULL,
	"latitude" varchar(32),
	"longitude" varchar(32),
	"localizationConfidence" integer NOT NULL,
	"evidenceQuality" integer NOT NULL,
	"status" "camera_candidate_status" DEFAULT 'pending_review' NOT NULL,
	"operatorNote" text,
	"reviewedBy" integer,
	"reviewedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractorTicketEvidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" integer NOT NULL,
	"evidenceId" integer NOT NULL,
	"role" "ticket_evidence_role" NOT NULL,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractorTickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"assetId" integer NOT NULL,
	"defectId" integer,
	"dsiAssessmentId" integer,
	"contractorId" integer,
	"assignedUserId" integer,
	"title" varchar(220) NOT NULL,
	"scopeNote" text NOT NULL,
	"zoneLabel" varchar(160),
	"latitude" varchar(32),
	"longitude" varchar(32),
	"priority" "ticket_priority" NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"dueAt" timestamp with time zone,
	"contractorClosureNote" text,
	"contractorClosedAt" timestamp with time zone,
	"verificationCriterion" text NOT NULL,
	"verificationNote" text,
	"verifiedBy" integer,
	"verifiedAt" timestamp with time zone,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractors" (
	"id" serial PRIMARY KEY NOT NULL,
	"legalName" varchar(220) NOT NULL,
	"externalReference" varchar(160),
	"status" "contractor_status" DEFAULT 'active' NOT NULL,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractors_legalName_unique" UNIQUE("legalName"),
	CONSTRAINT "contractors_externalReference_unique" UNIQUE("externalReference")
);
--> statement-breakpoint
CREATE TABLE "dsiAssessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"assetId" integer NOT NULL,
	"defectId" integer,
	"evidenceId" integer,
	"policyVersion" varchar(80) NOT NULL,
	"priority" "ticket_priority" NOT NULL,
	"advisoryScore" integer,
	"factorBreakdown" jsonb NOT NULL,
	"requiresEngineerReview" integer DEFAULT 1 NOT NULL,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "knowledgeChunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"documentId" integer NOT NULL,
	"sectionReference" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"contentHash" varchar(64) NOT NULL,
	"scopeMetadata" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledgeDocuments" (
	"id" serial PRIMARY KEY NOT NULL,
	"projectScope" varchar(160) NOT NULL,
	"title" varchar(300) NOT NULL,
	"documentType" varchar(120) NOT NULL,
	"version" varchar(80) NOT NULL,
	"approvalStatus" "knowledge_document_status" DEFAULT 'draft' NOT NULL,
	"permittedRoles" jsonb NOT NULL,
	"storageKey" varchar(512),
	"storageUrl" varchar(768),
	"sourceReference" varchar(768),
	"approvedBy" integer,
	"effectiveAt" timestamp with time zone,
	"supersededAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledgeRetrievalRuns" (
	"id" serial PRIMARY KEY NOT NULL,
	"actorId" integer,
	"projectScope" varchar(160),
	"queryHash" varchar(64) NOT NULL,
	"status" "knowledge_retrieval_status" NOT NULL,
	"returnedChunkIds" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
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
