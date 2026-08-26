import { customType, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const userRoleEnum = pgEnum("user_role", ["admin", "engineer", "contractor", "citizen", "user"]);
export const assetTypeEnum = pgEnum("asset_type", ["bridge", "road", "rail", "building", "utility"]);
export const assetStatusEnum = pgEnum("asset_status", ["operational", "watch", "restricted", "closed"]);
export const missionModeEnum = pgEnum("mission_mode", ["demo", "hardware"]);
export const missionStatusEnum = pgEnum("mission_status", ["planned", "preflight", "active", "paused", "completed", "failed"]);
export const mediaKindEnum = pgEnum("media_kind", ["photo", "video", "annotation", "report"]);
export const evidenceSourceEnum = pgEnum("evidence_source", ["hardware", "upload", "simulator", "cctv"]);
export const qualityStatusEnum = pgEnum("quality_status", ["pending", "pass", "review", "fail"]);
export const defectTypeEnum = pgEnum("defect_type", ["pothole", "crack", "structural", "corrosion", "spalling", "exposed_rebar", "water_intrusion", "settlement", "rail_alignment", "obstruction", "lighting_failure"]);
export const severityEnum = pgEnum("severity", ["low", "medium", "high", "critical"]);
export const defectStatusEnum = pgEnum("defect_status", ["detected", "under_review", "verified", "scheduled", "resolved", "dismissed"]);
export const reviewStateEnum = pgEnum("review_state", ["pending", "approved", "overridden", "rejected"]);
export const inferenceSourceEnum = pgEnum("inference_source", ["production-cv", "deterministic-fallback"]);
export const correlationRelationEnum = pgEnum("correlation_relation", ["evidence", "finding", "telemetry"]);
export const reportStatusEnum = pgEnum("report_status", ["draft", "ready", "signed_off"]);
export const estimateStatusEnum = pgEnum("estimate_status", ["draft", "reviewed", "approved"]);
export const reviewDecisionEnum = pgEnum("review_decision", ["approve", "override", "reject", "needs_site_visit"]);
export const alertStatusEnum = pgEnum("alert_status", ["open", "acknowledged", "dismissed"]);
export const contractorStatusEnum = pgEnum("contractor_status", ["active", "suspended"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["open", "assigned", "in_progress", "contractor_closed", "verification_pending", "fixed", "needs_rework", "cannot_verify"]);
export const ticketPriorityEnum = pgEnum("ticket_priority", ["p1", "p2", "p3", "p4", "insufficient_evidence"]);
export const ticketEvidenceRoleEnum = pgEnum("ticket_evidence_role", ["opening", "closure_proof", "follow_up"]);
export const cameraCandidateStatusEnum = pgEnum("camera_candidate_status", ["pending_review", "rejected", "ground_check", "uav_preflight_recommended"]);
export const knowledgeDocumentStatusEnum = pgEnum("knowledge_document_status", ["draft", "approved", "superseded", "archived"]);
export const knowledgeRetrievalStatusEnum = pgEnum("knowledge_retrieval_status", ["retrieved", "no_accessible_source", "no_approved_match", "persistence_required"]);
export const authorityTypeEnum = pgEnum("authority_type", ["municipal", "state", "national", "utility", "private_operator", "contractor_internal"]);
export const routingDecisionStatusEnum = pgEnum("routing_decision_status", ["unresolved", "proposed", "approved", "rejected"]);
export const handoffStatusEnum = pgEnum("handoff_status", ["prepared", "shared", "acknowledged", "expired", "revoked"]);
export const uavRecommendationStatusEnum = pgEnum("uav_recommendation_status", ["prepared", "rejected", "expired", "completed"]);
export const publicationStatusEnum = pgEnum("publication_status", ["draft", "approved", "published", "revoked"]);

const createdAt = () => timestamp("createdAt", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull();

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("engineer").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});

export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  assetType: assetTypeEnum("assetType").notNull(),
  locality: varchar("locality", { length: 160 }).notNull(),
  latitude: varchar("latitude", { length: 32 }).notNull(),
  longitude: varchar("longitude", { length: 32 }).notNull(),
  criticality: integer("criticality").notNull().default(3),
  status: assetStatusEnum("status").notNull().default("operational"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const missions = pgTable("missions", {
  id: serial("id").primaryKey(),
  assetId: integer("assetId").notNull(),
  createdBy: integer("createdBy"),
  name: varchar("name", { length: 180 }).notNull(),
  mode: missionModeEnum("mode").notNull().default("demo"),
  status: missionStatusEnum("status").notNull().default("planned"),
  startedAt: timestamp("startedAt", { withTimezone: true }),
  completedAt: timestamp("completedAt", { withTimezone: true }),
  hardwareAdapter: varchar("hardwareAdapter", { length: 80 }),
  operatorNote: text("operatorNote"),
  inspectionProfile: jsonb("inspectionProfile"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const telemetry = pgTable("telemetry", {
  id: serial("id").primaryKey(),
  missionId: integer("missionId").notNull(),
  latitude: varchar("latitude", { length: 32 }).notNull(),
  longitude: varchar("longitude", { length: 32 }).notNull(),
  altitudeMeters: integer("altitudeMeters").notNull(),
  speedMps: integer("speedMps").notNull(),
  batteryPercent: integer("batteryPercent").notNull(),
  capturedAt: timestamp("capturedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const evidence = pgTable("evidence", {
  id: serial("id").primaryKey(),
  missionId: integer("missionId").notNull(),
  uploadedBy: integer("uploadedBy"),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 768 }).notNull(),
  mediaKind: mediaKindEnum("mediaKind").notNull(),
  latitude: varchar("latitude", { length: 32 }),
  longitude: varchar("longitude", { length: 32 }),
  playbackSeconds: integer("playbackSeconds"),
  source: evidenceSourceEnum("source").notNull().default("upload"),
  sha256: varchar("sha256", { length: 64 }),
  capturedAt: timestamp("capturedAt", { withTimezone: true }),
  cameraId: varchar("cameraId", { length: 120 }),
  provenance: jsonb("provenance"),
  captureZone: varchar("captureZone", { length: 80 }),
  headingDegrees: integer("headingDegrees"),
  qualityStatus: qualityStatusEnum("qualityStatus").default("pending"),
  imageQuality: jsonb("imageQuality"),
  attachmentData: bytea("attachmentData"),
  createdAt: createdAt(),
});

export const defects = pgTable("defects", {
  id: serial("id").primaryKey(),
  missionId: integer("missionId").notNull(),
  assetId: integer("assetId").notNull(),
  evidenceId: integer("evidenceId"),
  defectType: defectTypeEnum("defectType").notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  confidencePercent: integer("confidencePercent").notNull(),
  zeroErrorScore: integer("zeroErrorScore").notNull(),
  severity: severityEnum("severity").notNull(),
  status: defectStatusEnum("status").notNull().default("detected"),
  reviewState: reviewStateEnum("reviewState").notNull().default("pending"),
  latitude: varchar("latitude", { length: 32 }).notNull(),
  longitude: varchar("longitude", { length: 32 }).notNull(),
  boundingBox: jsonb("boundingBox"),
  explanation: jsonb("explanation"),
  inferenceModel: varchar("inferenceModel", { length: 200 }),
  inferenceSource: inferenceSourceEnum("inferenceSource"),
  inferenceAnnotation: text("inferenceAnnotation"),
  inferenceCapturedAt: timestamp("inferenceCapturedAt", { withTimezone: true }),
  inspectionDomain: varchar("inspectionDomain", { length: 80 }),
  coveragePercent: integer("coveragePercent"),
  uncertainty: jsonb("uncertainty"),
  correlationKey: varchar("correlationKey", { length: 160 }),
  reviewRequired: integer("reviewRequired").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const inspectionCorrelations = pgTable("inspectionCorrelations", {
  id: serial("id").primaryKey(),
  correlationKey: varchar("correlationKey", { length: 160 }).notNull(),
  missionId: integer("missionId").notNull(),
  assetId: integer("assetId"),
  evidenceId: integer("evidenceId"),
  defectId: integer("defectId"),
  telemetryId: integer("telemetryId"),
  relationType: correlationRelationEnum("relationType").notNull(),
  createdAt: createdAt(),
});

export const severityHistory = pgTable("severityHistory", {
  id: serial("id").primaryKey(),
  defectId: integer("defectId").notNull(),
  previousSeverity: severityEnum("previousSeverity"),
  nextSeverity: severityEnum("nextSeverity").notNull(),
  score: integer("score").notNull(),
  reason: text("reason").notNull(),
  changedBy: integer("changedBy"),
  createdAt: createdAt(),
});

export const repairEstimates = pgTable("repairEstimates", {
  id: serial("id").primaryKey(),
  defectId: integer("defectId").notNull(),
  estimateCents: integer("estimateCents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  assumptions: jsonb("assumptions"),
  status: estimateStatusEnum("status").notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  defectId: integer("defectId").notNull(),
  reviewerId: integer("reviewerId"),
  decision: reviewDecisionEnum("decision").notNull(),
  priorityOverride: severityEnum("priorityOverride"),
  note: text("note").notNull(),
  createdAt: createdAt(),
});

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  missionId: integer("missionId").notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  narrative: text("narrative").notNull(),
  storageKey: varchar("storageKey", { length: 512 }),
  storageUrl: varchar("storageUrl", { length: 768 }),
  status: reportStatusEnum("status").notNull().default("draft"),
  generatedBy: varchar("generatedBy", { length: 80 }).notNull().default("zeroerror"),
  inspectionScope: jsonb("inspectionScope"),
  signoff: jsonb("signoff"),
  attachmentData: bytea("attachmentData"),
  createdAt: createdAt(),
});

export const auditEvents = pgTable("auditEvents", {
  id: serial("id").primaryKey(),
  missionId: integer("missionId"),
  defectId: integer("defectId"),
  actorId: integer("actorId"),
  action: varchar("action", { length: 120 }).notNull(),
  details: jsonb("details"),
  createdAt: createdAt(),
});

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  missionId: integer("missionId").notNull(),
  defectId: integer("defectId").notNull(),
  severity: severityEnum("severity").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  message: text("message").notNull(),
  status: alertStatusEnum("status").notNull().default("open"),
  acknowledgedBy: integer("acknowledgedBy"),
  acknowledgedAt: timestamp("acknowledgedAt", { withTimezone: true }),
  createdAt: createdAt(),
});

export const contractors = pgTable("contractors", { id: serial("id").primaryKey(), legalName: varchar("legalName", { length: 220 }).notNull().unique(), externalReference: varchar("externalReference", { length: 160 }).unique(), status: contractorStatusEnum("status").notNull().default("active"), createdBy: integer("createdBy"), createdAt: createdAt(), updatedAt: updatedAt() });
export const contractorUserAssignments = pgTable("contractorUserAssignments", { id: serial("id").primaryKey(), contractorId: integer("contractorId").notNull(), userId: integer("userId").notNull(), active: integer("active").notNull().default(1), assignedBy: integer("assignedBy").notNull(), createdAt: createdAt(), updatedAt: updatedAt() });
export const cameraSources = pgTable("cameraSources", { id: serial("id").primaryKey(), ownerName: varchar("ownerName", { length: 220 }).notNull(), cameraCode: varchar("cameraCode", { length: 160 }).notNull().unique(), displayName: varchar("displayName", { length: 220 }).notNull(), authorizedPurpose: text("authorizedPurpose").notNull(), zoneLabel: varchar("zoneLabel", { length: 160 }).notNull(), latitude: varchar("latitude", { length: 32 }), longitude: varchar("longitude", { length: 32 }), retentionUntil: timestamp("retentionUntil", { withTimezone: true }).notNull(), accessClassification: varchar("accessClassification", { length: 80 }).notNull(), consentAndPrivacyNote: text("consentAndPrivacyNote").notNull(), createdBy: integer("createdBy"), createdAt: createdAt(), updatedAt: updatedAt() });
export const cctvCandidates = pgTable("cctvCandidates", { id: serial("id").primaryKey(), cameraSourceId: integer("cameraSourceId").notNull(), evidenceId: integer("evidenceId").notNull(), assetId: integer("assetId"), candidateType: varchar("candidateType", { length: 120 }).notNull(), zoneLabel: varchar("zoneLabel", { length: 160 }).notNull(), latitude: varchar("latitude", { length: 32 }), longitude: varchar("longitude", { length: 32 }), bridgeIdentity: varchar("bridgeIdentity", { length: 180 }).notNull(), dedupeKey: varchar("dedupeKey", { length: 180 }).notNull().unique(), detectionConfidence: integer("detectionConfidence").notNull(), localizationConfidence: integer("localizationConfidence").notNull(), evidenceQuality: integer("evidenceQuality").notNull(), temporalObservationCount: integer("temporalObservationCount").notNull(), qualitySignals: jsonb("qualitySignals").notNull(), observedAt: timestamp("observedAt", { withTimezone: true }).notNull(), status: cameraCandidateStatusEnum("status").notNull().default("pending_review"), operatorNote: text("operatorNote"), reviewedBy: integer("reviewedBy"), reviewedAt: timestamp("reviewedAt", { withTimezone: true }), createdAt: createdAt(), updatedAt: updatedAt() });
export const knowledgeDocuments = pgTable("knowledgeDocuments", { id: serial("id").primaryKey(), projectScope: varchar("projectScope", { length: 160 }).notNull(), title: varchar("title", { length: 300 }).notNull(), documentType: varchar("documentType", { length: 120 }).notNull(), version: varchar("version", { length: 80 }).notNull(), approvalStatus: knowledgeDocumentStatusEnum("approvalStatus").notNull().default("draft"), permittedRoles: jsonb("permittedRoles").notNull(), storageKey: varchar("storageKey", { length: 512 }), storageUrl: varchar("storageUrl", { length: 768 }), sourceReference: varchar("sourceReference", { length: 768 }), approvedBy: integer("approvedBy"), effectiveAt: timestamp("effectiveAt", { withTimezone: true }), supersededAt: timestamp("supersededAt", { withTimezone: true }), createdAt: createdAt(), updatedAt: updatedAt() });
export const knowledgeChunks = pgTable("knowledgeChunks", { id: serial("id").primaryKey(), documentId: integer("documentId").notNull(), sectionReference: varchar("sectionReference", { length: 200 }).notNull(), content: text("content").notNull(), contentHash: varchar("contentHash", { length: 64 }).notNull(), scopeMetadata: jsonb("scopeMetadata").notNull(), createdAt: createdAt() });
export const knowledgeRetrievalRuns = pgTable("knowledgeRetrievalRuns", { id: serial("id").primaryKey(), actorId: integer("actorId"), projectScope: varchar("projectScope", { length: 160 }), queryHash: varchar("queryHash", { length: 64 }).notNull(), status: knowledgeRetrievalStatusEnum("status").notNull(), returnedChunkIds: jsonb("returnedChunkIds").notNull(), createdAt: createdAt() });
export const dsiAssessments = pgTable("dsiAssessments", { id: serial("id").primaryKey(), assetId: integer("assetId").notNull(), defectId: integer("defectId"), evidenceId: integer("evidenceId"), policyVersion: varchar("policyVersion", { length: 80 }).notNull(), priority: ticketPriorityEnum("priority").notNull(), advisoryScore: integer("advisoryScore"), factorBreakdown: jsonb("factorBreakdown").notNull(), requiresEngineerReview: integer("requiresEngineerReview").notNull().default(1), createdBy: integer("createdBy"), createdAt: createdAt() });
export const contractorTickets = pgTable("contractorTickets", { id: serial("id").primaryKey(), assetId: integer("assetId").notNull(), defectId: integer("defectId"), dsiAssessmentId: integer("dsiAssessmentId"), contractorId: integer("contractorId"), assignedUserId: integer("assignedUserId"), title: varchar("title", { length: 220 }).notNull(), scopeNote: text("scopeNote").notNull(), zoneLabel: varchar("zoneLabel", { length: 160 }), latitude: varchar("latitude", { length: 32 }), longitude: varchar("longitude", { length: 32 }), priority: ticketPriorityEnum("priority").notNull(), status: ticketStatusEnum("status").notNull().default("open"), dueAt: timestamp("dueAt", { withTimezone: true }), acceptedAt: timestamp("acceptedAt", { withTimezone: true }), inProgressAt: timestamp("inProgressAt", { withTimezone: true }), contractorClosureNote: text("contractorClosureNote"), contractorClosedAt: timestamp("contractorClosedAt", { withTimezone: true }), verificationCriterion: text("verificationCriterion").notNull(), verificationNote: text("verificationNote"), verifiedBy: integer("verifiedBy"), verifiedAt: timestamp("verifiedAt", { withTimezone: true }), createdBy: integer("createdBy").notNull(), createdAt: createdAt(), updatedAt: updatedAt() });
export const contractorTicketEvidence = pgTable("contractorTicketEvidence", { id: serial("id").primaryKey(), ticketId: integer("ticketId").notNull(), evidenceId: integer("evidenceId").notNull(), role: ticketEvidenceRoleEnum("role").notNull(), createdBy: integer("createdBy"), createdAt: createdAt() });
export const contractorTicketNotes = pgTable("contractorTicketNotes", { id: serial("id").primaryKey(), ticketId: integer("ticketId").notNull(), authorId: integer("authorId").notNull(), note: text("note").notNull(), createdAt: createdAt() });
export const uavFollowUpRecommendations = pgTable("uavFollowUpRecommendations", { id: serial("id").primaryKey(), ticketId: integer("ticketId").notNull(), cctvCandidateId: integer("cctvCandidateId"), assetId: integer("assetId").notNull(), zoneLabel: varchar("zoneLabel", { length: 160 }), latitude: varchar("latitude", { length: 32 }), longitude: varchar("longitude", { length: 32 }), triggerReason: text("triggerReason").notNull(), requiredChecks: jsonb("requiredChecks").notNull(), status: uavRecommendationStatusEnum("status").notNull().default("prepared"), expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(), preparedBy: integer("preparedBy").notNull(), createdAt: createdAt(), updatedAt: updatedAt() });
export const authorities = pgTable("authorities", { id: serial("id").primaryKey(), legalName: varchar("legalName", { length: 220 }).notNull().unique(), authorityType: authorityTypeEnum("authorityType").notNull(), contactChannel: varchar("contactChannel", { length: 300 }), createdBy: integer("createdBy"), createdAt: createdAt(), updatedAt: updatedAt() });
export const slaRules = pgTable("slaRules", { id: serial("id").primaryKey(), authorityId: integer("authorityId").notNull(), contractReference: varchar("contractReference", { length: 200 }).notNull(), responseTargetHours: integer("responseTargetHours").notNull(), closureTargetHours: integer("closureTargetHours").notNull(), escalationPolicy: jsonb("escalationPolicy").notNull(), businessCalendar: jsonb("businessCalendar"), policyVersion: varchar("policyVersion", { length: 80 }).notNull(), effectiveFrom: timestamp("effectiveFrom", { withTimezone: true }).notNull(), effectiveUntil: timestamp("effectiveUntil", { withTimezone: true }), createdBy: integer("createdBy"), createdAt: createdAt(), updatedAt: updatedAt() });
export const routingRules = pgTable("routingRules", { id: serial("id").primaryKey(), authorityId: integer("authorityId").notNull(), contractorId: integer("contractorId"), slaRuleId: integer("slaRuleId"), assetType: assetTypeEnum("assetType"), zoneReference: varchar("zoneReference", { length: 200 }).notNull(), boundarySourceReference: varchar("boundarySourceReference", { length: 768 }).notNull(), responsibleTeam: varchar("responsibleTeam", { length: 180 }).notNull(), effectiveFrom: timestamp("effectiveFrom", { withTimezone: true }).notNull(), effectiveUntil: timestamp("effectiveUntil", { withTimezone: true }), createdBy: integer("createdBy"), createdAt: createdAt(), updatedAt: updatedAt() });
export const routingDecisions = pgTable("routingDecisions", { id: serial("id").primaryKey(), ticketId: integer("ticketId").notNull(), routingRuleId: integer("routingRuleId"), status: routingDecisionStatusEnum("status").notNull().default("unresolved"), sourceReferences: jsonb("sourceReferences").notNull(), rationale: text("rationale").notNull(), reviewedBy: integer("reviewedBy"), reviewedAt: timestamp("reviewedAt", { withTimezone: true }), createdAt: createdAt(), updatedAt: updatedAt() });
export const handoffPackages = pgTable("handoffPackages", { id: serial("id").primaryKey(), ticketId: integer("ticketId").notNull(), recipientAuthorityId: integer("recipientAuthorityId"), recipientSystem: varchar("recipientSystem", { length: 160 }), status: handoffStatusEnum("status").notNull().default("prepared"), expiresAt: timestamp("expiresAt", { withTimezone: true }), payload: jsonb("payload").notNull(), accessScope: jsonb("accessScope").notNull(), preparedBy: integer("preparedBy").notNull(), sharedAt: timestamp("sharedAt", { withTimezone: true }), acknowledgedAt: timestamp("acknowledgedAt", { withTimezone: true }), createdAt: createdAt(), updatedAt: updatedAt() });
export const publicStatusPublications = pgTable("publicStatusPublications", { id: serial("id").primaryKey(), ticketId: integer("ticketId").notNull(), status: publicationStatusEnum("status").notNull().default("draft"), publicSummary: text("publicSummary").notNull(), expectedCompletionAt: timestamp("expectedCompletionAt", { withTimezone: true }), privacyReviewNote: text("privacyReviewNote").notNull(), approvedBy: integer("approvedBy"), approvedAt: timestamp("approvedAt", { withTimezone: true }), publishedAt: timestamp("publishedAt", { withTimezone: true }), revokedAt: timestamp("revokedAt", { withTimezone: true }), createdAt: createdAt(), updatedAt: updatedAt() });

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type Mission = typeof missions.$inferSelect;
export type Defect = typeof defects.$inferSelect;
export type Contractor = typeof contractors.$inferSelect;
export type ContractorTicket = typeof contractorTickets.$inferSelect;
