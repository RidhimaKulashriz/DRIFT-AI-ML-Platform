import { customType, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const userRoleEnum = pgEnum("user_role", ["admin", "engineer", "citizen", "user"]);
export const assetTypeEnum = pgEnum("asset_type", ["bridge", "road", "rail", "building", "utility"]);
export const assetStatusEnum = pgEnum("asset_status", ["operational", "watch", "restricted", "closed"]);
export const missionModeEnum = pgEnum("mission_mode", ["demo", "hardware"]);
export const missionStatusEnum = pgEnum("mission_status", ["planned", "preflight", "active", "paused", "completed", "failed"]);
export const mediaKindEnum = pgEnum("media_kind", ["photo", "video", "annotation", "report"]);
export const evidenceSourceEnum = pgEnum("evidence_source", ["hardware", "upload", "simulator"]);
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

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type Mission = typeof missions.$inferSelect;
export type Defect = typeof defects.$inferSelect;
