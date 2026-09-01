ALTER TYPE "public"."ticket_status" ADD VALUE 'in_progress' BEFORE 'contractor_closed';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'contractor' BEFORE 'citizen';--> statement-breakpoint
CREATE TABLE "contractorTicketNotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" integer NOT NULL,
	"authorId" integer NOT NULL,
	"note" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contractorUserAssignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"contractorId" integer NOT NULL,
	"userId" integer NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"assignedBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cctvCandidates" ADD COLUMN "bridgeIdentity" varchar(180) NOT NULL;--> statement-breakpoint
ALTER TABLE "cctvCandidates" ADD COLUMN "dedupeKey" varchar(180) NOT NULL;--> statement-breakpoint
ALTER TABLE "cctvCandidates" ADD COLUMN "detectionConfidence" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "cctvCandidates" ADD COLUMN "temporalObservationCount" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "cctvCandidates" ADD COLUMN "qualitySignals" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cctvCandidates" ADD COLUMN "observedAt" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "contractorTickets" ADD COLUMN "acceptedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contractorTickets" ADD COLUMN "inProgressAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cctvCandidates" ADD CONSTRAINT "cctvCandidates_dedupeKey_unique" UNIQUE("dedupeKey");