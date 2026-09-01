CREATE TYPE "public"."knowledge_retrieval_status" AS ENUM('retrieved', 'no_accessible_source', 'no_approved_match', 'persistence_required');--> statement-breakpoint
CREATE TABLE "knowledgeRetrievalRuns" (
	"id" serial PRIMARY KEY NOT NULL,
	"actorId" integer,
	"projectScope" varchar(160),
	"queryHash" varchar(64) NOT NULL,
	"status" "knowledge_retrieval_status" NOT NULL,
	"returnedChunkIds" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
