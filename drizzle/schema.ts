import { int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin", "engineer", "citizen", "user"]).default("engineer").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const assets = mysqlTable("assets", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  assetType: mysqlEnum("assetType", ["bridge", "road", "rail", "building", "utility"]).notNull(),
  locality: varchar("locality", { length: 160 }).notNull(),
  latitude: varchar("latitude", { length: 32 }).notNull(),
  longitude: varchar("longitude", { length: 32 }).notNull(),
  criticality: int("criticality").notNull().default(3),
  status: mysqlEnum("status", ["operational", "watch", "restricted", "closed"]).notNull().default("operational"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const missions = mysqlTable("missions", {
  id: int("id").autoincrement().primaryKey(),
  assetId: int("assetId").notNull(),
  createdBy: int("createdBy"),
  name: varchar("name", { length: 180 }).notNull(),
  mode: mysqlEnum("mode", ["demo", "hardware"]).notNull().default("demo"),
  status: mysqlEnum("status", ["planned", "preflight", "active", "paused", "completed", "failed"]).notNull().default("planned"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  hardwareAdapter: varchar("hardwareAdapter", { length: 80 }),
  operatorNote: text("operatorNote"),
  inspectionProfile: json("inspectionProfile"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const telemetry = mysqlTable("telemetry", {
  id: int("id").autoincrement().primaryKey(),
  missionId: int("missionId").notNull(),
  latitude: varchar("latitude", { length: 32 }).notNull(),
  longitude: varchar("longitude", { length: 32 }).notNull(),
  altitudeMeters: int("altitudeMeters").notNull(),
  speedMps: int("speedMps").notNull(),
  batteryPercent: int("batteryPercent").notNull(),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
});

export const evidence = mysqlTable("evidence", {
  id: int("id").autoincrement().primaryKey(),
  missionId: int("missionId").notNull(),
  uploadedBy: int("uploadedBy"),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 768 }).notNull(),
  mediaKind: mysqlEnum("mediaKind", ["photo", "video", "annotation", "report"]).notNull(),
  latitude: varchar("latitude", { length: 32 }),
  longitude: varchar("longitude", { length: 32 }),
  playbackSeconds: int("playbackSeconds"),
  source: mysqlEnum("source", ["hardware", "upload", "simulator"]).notNull().default("upload"),
  sha256: varchar("sha256", { length: 64 }),
  capturedAt: timestamp("capturedAt"),
  cameraId: varchar("cameraId", { length: 120 }),
  provenance: json("provenance"),
  captureZone: varchar("captureZone", { length: 80 }),
  headingDegrees: int("headingDegrees"),
  qualityStatus: mysqlEnum("qualityStatus", ["pending", "pass", "review", "fail"]).default("pending"),
  imageQuality: json("imageQuality"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const defects = mysqlTable("defects", {
  id: int("id").autoincrement().primaryKey(),
  missionId: int("missionId").notNull(),
  assetId: int("assetId").notNull(),
  evidenceId: int("evidenceId"),
  defectType: mysqlEnum("defectType", ["pothole", "crack", "structural", "corrosion", "spalling", "exposed_rebar", "water_intrusion", "settlement", "rail_alignment", "obstruction", "lighting_failure"]).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  confidencePercent: int("confidencePercent").notNull(),
  zeroErrorScore: int("zeroErrorScore").notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull(),
  status: mysqlEnum("status", ["detected", "under_review", "verified", "scheduled", "resolved", "dismissed"]).notNull().default("detected"),
  reviewState: mysqlEnum("reviewState", ["pending", "approved", "overridden", "rejected"]).notNull().default("pending"),
  latitude: varchar("latitude", { length: 32 }).notNull(),
  longitude: varchar("longitude", { length: 32 }).notNull(),
  boundingBox: json("boundingBox"),
  explanation: json("explanation"),
  inferenceModel: varchar("inferenceModel", { length: 200 }),
  inferenceSource: mysqlEnum("inferenceSource", ["production-cv", "deterministic-fallback"]),
  inferenceAnnotation: text("inferenceAnnotation"),
  inferenceCapturedAt: timestamp("inferenceCapturedAt"),
  inspectionDomain: varchar("inspectionDomain", { length: 80 }),
  coveragePercent: int("coveragePercent"),
  uncertainty: json("uncertainty"),
  correlationKey: varchar("correlationKey", { length: 160 }),
  reviewRequired: int("reviewRequired").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const inspectionCorrelations = mysqlTable("inspectionCorrelations", {
  id: int("id").autoincrement().primaryKey(),
  correlationKey: varchar("correlationKey", { length: 160 }).notNull(),
  missionId: int("missionId").notNull(),
  assetId: int("assetId"),
  evidenceId: int("evidenceId"),
  defectId: int("defectId"),
  telemetryId: int("telemetryId"),
  relationType: mysqlEnum("relationType", ["evidence", "finding", "telemetry"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const severityHistory = mysqlTable("severityHistory", {
  id: int("id").autoincrement().primaryKey(),
  defectId: int("defectId").notNull(),
  previousSeverity: mysqlEnum("previousSeverity", ["low", "medium", "high", "critical"]),
  nextSeverity: mysqlEnum("nextSeverity", ["low", "medium", "high", "critical"]).notNull(),
  score: int("score").notNull(),
  reason: text("reason").notNull(),
  changedBy: int("changedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const repairEstimates = mysqlTable("repairEstimates", {
  id: int("id").autoincrement().primaryKey(),
  defectId: int("defectId").notNull(),
  estimateCents: int("estimateCents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  assumptions: json("assumptions"),
  status: mysqlEnum("status", ["draft", "reviewed", "approved"]).notNull().default("draft"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const reviews = mysqlTable("reviews", {
  id: int("id").autoincrement().primaryKey(),
  defectId: int("defectId").notNull(),
  reviewerId: int("reviewerId"),
  decision: mysqlEnum("decision", ["approve", "override", "reject", "needs_site_visit"]).notNull(),
  priorityOverride: mysqlEnum("priorityOverride", ["low", "medium", "high", "critical"]),
  note: text("note").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  missionId: int("missionId").notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  narrative: text("narrative").notNull(),
  storageKey: varchar("storageKey", { length: 512 }),
  storageUrl: varchar("storageUrl", { length: 768 }),
  status: mysqlEnum("status", ["draft", "ready", "signed_off"]).notNull().default("draft"),
  generatedBy: varchar("generatedBy", { length: 80 }).notNull().default("zeroerror"),
  inspectionScope: json("inspectionScope"),
  signoff: json("signoff"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const auditEvents = mysqlTable("auditEvents", {
  id: int("id").autoincrement().primaryKey(),
  missionId: int("missionId"),
  defectId: int("defectId"),
  actorId: int("actorId"),
  action: varchar("action", { length: 120 }).notNull(),
  details: json("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const alerts = mysqlTable("alerts", {
  id: int("id").autoincrement().primaryKey(),
  missionId: int("missionId").notNull(),
  defectId: int("defectId").notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["open", "acknowledged", "dismissed"]).notNull().default("open"),
  acknowledgedBy: int("acknowledgedBy"),
  acknowledgedAt: timestamp("acknowledgedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Asset = typeof assets.$inferSelect;
export type Mission = typeof missions.$inferSelect;
export type Defect = typeof defects.$inferSelect;
