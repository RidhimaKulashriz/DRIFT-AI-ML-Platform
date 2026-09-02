import crypto from "node:crypto";
import { desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { alerts, assets, auditEvents, authorities, cameraSources, contractorTicketEvidence, contractorTicketNotes, contractorTickets, contractorUserAssignments, contractors, cctvCandidates, defects, dsiAssessments, evidence, handoffPackages, inspectionCorrelations, InsertUser, knowledgeChunks, knowledgeDocuments, knowledgeRetrievalRuns, missions, publicStatusPublications, repairEstimates, reports, reviews, routingDecisions, routingRules, securityObservations, severityHistory, slaRules, telemetry, uavFollowUpRecommendations, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { resolveReviewState } from "./services/reviewState";
import { summarizeSeverity, toMapMarker } from "./services/reportPresentation";
import { storageGetSignedUrl, storagePutWithFallback } from "./storage";
import { supabasePortableStorageConfigured } from "./services/supabaseStorage";
import { renderInspectionPdf } from "./services/reportPdf";
import { rankApprovedKnowledge, type KnowledgeCitation } from "./services/rag";
import type { InferenceResult } from "./services/mlInference";
import type { DefectKind } from "./services/scoring";

let _db: ReturnType<typeof drizzle> | null = null;

const { attachmentData: _evidenceAttachmentData, ...evidenceListColumns } = getTableColumns(evidence);
const { attachmentData: _reportAttachmentData, ...reportListColumns } = getTableColumns(reports);

function postgresDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  return value?.startsWith("postgres://") || value?.startsWith("postgresql://") ? value : undefined;
}

export async function getDb() {
  const databaseUrl = postgresDatabaseUrl();
  if (!_db && databaseUrl) {
    try {
      _db = drizzle(databaseUrl);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

let _campusMigrationApplied = false;
let _reportsMigrationApplied = false;

/**
 * Add report table columns if they don't exist.
 * Idempotent — safe to run on every startup.
 */
async function ensureReportsColumns(db: any): Promise<void> {
  try {
    // Check which columns exist
    const colCheck = await db.execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='reports' AND table_schema='public'
    `);
    const existing = new Set(colCheck.rows.map((r: any) => r.column_name));

    // Already complete
    if (existing.has("pdfBase64") && existing.has("emailStatus") && existing.has("updatedAt")) {
      return; // No migration needed
    }

    console.log("[Database] Reports migration needed. Existing cols:", Array.from(existing).join(", "));

    // Execute individual ALTER TABLE statements
    const addIfMissing = async (col: string, ddl: string) => {
      if (existing.has(col)) return;
      try {
        await db.execute(sql.raw(`ALTER TABLE "reports" ADD COLUMN ${ddl}`));
        console.log(`[Database] Added reports.${col}`);
      } catch (e) {
        console.warn(`[Database] Add column ${col} failed:`, e instanceof Error ? e.message?.substring(0, 500) : e);
      }
    };
    await addIfMissing("pdfBase64", `"pdfBase64" text`);
    await addIfMissing("pdfSizeBytes", `"pdfSizeBytes" integer`);
    await addIfMissing("pdfPages", `"pdfPages" integer`);
    await addIfMissing("findingCount", `"findingCount" integer DEFAULT 0`);
    await addIfMissing("emailStatus", `"emailStatus" varchar(20)`);
    await addIfMissing("emailMessageId", `"emailMessageId" text`);
    await addIfMissing("emailedAt", `"emailedAt" timestamp with time zone`);
    await addIfMissing("emailError", `"emailError" text`);
    await addIfMissing("updatedAt", `"updatedAt" timestamp with time zone DEFAULT now()`);
  } catch (e) {
    console.warn("[Database] Reports column migration failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * PHASE 10/14/15: Apply campus + campusLocations tables and seed IGDTUW + IIIT-Delhi.
 * Runs once on first DB connection. Idempotent (ON CONFLICT clauses).
 */
export async function ensureCampusSchema(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Always run reports column migration (separate from campus check)
  await ensureReportsColumns(db);

  if (_campusMigrationApplied) return;

  try {
    // Check if campuses table exists
    const exists = await db.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'campuses'
    `);

    if (exists.rows.length > 0) {
      _campusMigrationApplied = true;
      return;
    }

    console.log("[Database] Applying campus schema migration...");
    // Run the entire migration in a single statement to keep DDL atomic
    await db.execute(sql.raw(CAMPUS_MIGRATION_SQL));
    _campusMigrationApplied = true;
    console.log("[Database] Campus schema migration applied. IGDTUW and IIIT-Delhi seeded.");
  } catch (err) {
    console.error("[Database] Failed to apply campus migration:", err);
  }
}
const CAMPUS_MIGRATION_SQL = `
DO $$ BEGIN
  CREATE TYPE "public"."location_source" AS ENUM('image_exif', 'device_gps', 'verified_campus', 'user_selected', 'geocoded', 'unknown');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "campuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(220) NOT NULL UNIQUE,
	"shortName" varchar(40) NOT NULL UNIQUE,
	"description" text,
	"address" varchar(300),
	"city" varchar(80),
	"state" varchar(80),
	"country" varchar(80) DEFAULT 'India' NOT NULL,
	"latitude" varchar(32) NOT NULL,
	"longitude" varchar(32) NOT NULL,
	"website" varchar(300),
	"defaultImageUrl" text,
	"sourceUrl" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "campusLocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"campusId" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"locationType" varchar(80),
	"latitude" varchar(32) NOT NULL,
	"longitude" varchar(32) NOT NULL,
	"address" varchar(300),
	"sourceUrl" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "campusId" integer;
ALTER TABLE "evidence" ADD COLUMN IF NOT EXISTS "locationSource" "location_source" DEFAULT 'unknown';

-- Reports table columns for production PDF/email pipeline
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "pdfBase64" text;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "pdfSizeBytes" integer;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "pdfPages" integer;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "findingCount" integer DEFAULT 0;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "emailStatus" varchar(20);
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "emailMessageId" text;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "emailedAt" timestamp with time zone;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "emailError" text;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp with time zone DEFAULT now();

INSERT INTO "campuses" ("id", "name", "shortName", "description", "address", "city", "state", "country", "latitude", "longitude", "website", "defaultImageUrl", "sourceUrl", "createdAt", "updatedAt")
VALUES (
  1, 'Indira Gandhi Delhi Technical University for Women', 'IGDTUW',
  'A premier women''s technical university in Delhi established in 1998 (formerly IGITW), located at Kashmere Gate, Delhi. Offers B.Tech, M.Tech, and PhD programs in engineering, technology, and applied sciences.',
  'Kashmere Gate, Near St. James Church', 'New Delhi', 'Delhi', 'India',
  '28.6876', '77.2100', 'https://www.igdtuw.ac.in/',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/IGDTUW_New_Delhi.jpg/800px-IGDTUW_New_Delhi.jpg',
  'https://en.wikipedia.org/wiki/Indira_Gandhi_Delhi_Technical_University_for_Women',
  NOW(), NOW()
) ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED.name, "shortName" = EXCLUDED."shortName", "description" = EXCLUDED.description,
  "address" = EXCLUDED.address, "latitude" = EXCLUDED.latitude, "longitude" = EXCLUDED.longitude,
  "website" = EXCLUDED.website, "defaultImageUrl" = EXCLUDED."defaultImageUrl", "sourceUrl" = EXCLUDED."sourceUrl",
  "updatedAt" = NOW();

INSERT INTO "campuses" ("id", "name", "shortName", "description", "address", "city", "state", "country", "latitude", "longitude", "website", "defaultImageUrl", "sourceUrl", "createdAt", "updatedAt")
VALUES (
  2, 'Indraprastha Institute of Information Technology Delhi', 'IIIT-Delhi',
  'A State University by the Government of NCT of Delhi, established in 2008. Focuses on Information Technology research and education. Located in Okhla Phase III, New Delhi.',
  'Okhla Phase III, Near Govindpuri Metro Station', 'New Delhi', 'Delhi', 'India',
  '28.5449', '77.2750', 'https://www.iiitd.ac.in/',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/IIIT-Delhi_Entrance.jpg/800px-IIIT-Delhi_Entrance.jpg',
  'https://en.wikipedia.org/wiki/IIIT-Delhi',
  NOW(), NOW()
) ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED.name, "shortName" = EXCLUDED."shortName", "description" = EXCLUDED.description,
  "address" = EXCLUDED.address, "latitude" = EXCLUDED.latitude, "longitude" = EXCLUDED.longitude,
  "website" = EXCLUDED.website, "defaultImageUrl" = EXCLUDED."defaultImageUrl", "sourceUrl" = EXCLUDED."sourceUrl",
  "updatedAt" = NOW();

INSERT INTO "campusLocations" ("id", "campusId", "name", "description", "locationType", "latitude", "longitude", "address", "sourceUrl", "createdAt", "updatedAt") VALUES
  (1, 1, 'IGDTUW Main Gate', 'Primary entrance to IGDTUW campus on Kashmere Gate road', 'entrance', '28.6880', '77.2108', 'Kashmere Gate, New Delhi', 'https://www.igdtuw.ac.in/', NOW(), NOW()),
  (2, 1, 'IGDTUW Main Building', 'Central academic and administrative building', 'building', '28.6872', '77.2100', 'IGDTUW Campus, Kashmere Gate', 'https://www.igdtuw.ac.in/', NOW(), NOW()),
  (3, 1, 'IGDTUW Internal Road', 'Internal campus road connecting main gate to academic blocks', 'road', '28.6876', '77.2104', 'IGDTUW Campus', 'https://www.igdtuw.ac.in/', NOW(), NOW()),
  (4, 2, 'IIIT-Delhi Main Entrance', 'Primary entrance to IIIT-Delhi campus in Okhla Phase III', 'entrance', '28.5452', '77.2755', 'Okhla Phase III, New Delhi', 'https://www.iiitd.ac.in/', NOW(), NOW()),
  (5, 2, 'IIIT-Delhi Academic Block', 'Main academic block housing lecture halls and labs', 'building', '28.5445', '77.2748', 'IIIT-Delhi Campus, Okhla Phase III', 'https://www.iiitd.ac.in/', NOW(), NOW()),
  (6, 2, 'IIIT-Delhi Library Bridge', 'Connecting bridge between academic block and library', 'bridge', '28.5440', '77.2752', 'IIIT-Delhi Campus', 'https://www.iiitd.ac.in/', NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED.name, "description" = EXCLUDED.description,
  "latitude" = EXCLUDED.latitude, "longitude" = EXCLUDED.longitude, "updatedAt" = NOW();
`;

/**
 * PHASE 10/14/15: Apply campus + campusLocations tables and seed IGDTUW + IIIT-Delhi.
 * Runs once on first DB connection. Idempotent (ON CONFLICT clauses).
 */
export async function ensureCampusSchema(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Always run reports column migration (separate from campus check)
  await ensureReportsColumns(db);

  if (_campusMigrationApplied) return;

  try {
    // Check if campuses table exists
    const exists = await db.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'campuses'
    `);

    if (exists.rows.length > 0) {
      _campusMigrationApplied = true;
      return;
    }

    console.log("[Database] Applying campus schema migration...");
    // Run the entire migration in a single statement to keep DDL atomic
    await db.execute(sql.raw(CAMPUS_MIGRATION_SQL));
    _campusMigrationApplied = true;
    console.log("[Database] Campus schema migration applied. IGDTUW and IIIT-Delhi seeded.");
  } catch (err) {
    console.error("[Database] Failed to apply campus migration:", err);
  }
}

const READINESS_TABLE_GROUPS = {
  core: ["assets", "missions", "telemetry", "evidence", "defects", "reports", "alerts", "auditEvents"],
  accountability: ["contractors", "contractorTickets", "dsiAssessments", "cameraSources", "cctvCandidates", "knowledgeDocuments", "knowledgeChunks", "knowledgeRetrievalRuns", "authorities", "slaRules", "routingRules", "routingDecisions", "handoffPackages", "publicStatusPublications"],
  contractorAndUav: ["contractorUserAssignments", "contractorTicketNotes", "contractorTicketEvidence", "uavFollowUpRecommendations"],
  security: ["securityObservations"],
} as const;

type ReadinessGroup = keyof typeof READINESS_TABLE_GROUPS;

export function summarizeReadOnlySchemaReadiness(presentTableNames: readonly string[], migrationJournal: { present: boolean; appliedCount: number | null }) {
  const present = new Set(presentTableNames);
  const groups = Object.fromEntries(
    (Object.keys(READINESS_TABLE_GROUPS) as ReadinessGroup[]).map(group => {
      const expected = READINESS_TABLE_GROUPS[group];
      const missing = expected.filter(table => !present.has(table));
      return [group, { ready: missing.length === 0, expectedTableCount: expected.length, missing }];
    }),
  ) as Record<ReadinessGroup, { ready: boolean; expectedTableCount: number; missing: string[] }>;

  return {
    queryMode: "read_only" as const,
    schemaReachable: true,
    groups,
    migrationJournal,
    safeToApplyLaterMigrations: groups.core.ready && migrationJournal.present,
  };
}

export async function getReadOnlySchemaReadiness() {
  const db = await getDb();
  if (!db) {
    return {
      queryMode: "read_only" as const,
      schemaReachable: false,
      groups: null,
      migrationJournal: { present: false, appliedCount: null },
      safeToApplyLaterMigrations: false,
      message: "PostgreSQL DATABASE_URL is not configured or reachable. No schema change was attempted.",
    };
  }

  try {
    const tables = await db.execute<{ table_name: string }>(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    const journal = await db.execute<{ appliedCount: number }>(sql`
      SELECT COUNT(*)::int AS "appliedCount"
      FROM drizzle.__drizzle_migrations
    `).then(result => ({ present: true, appliedCount: Number(result.rows[0]?.appliedCount ?? 0) })).catch(() => ({ present: false, appliedCount: null }));

    return {
      ...summarizeReadOnlySchemaReadiness(tables.rows.map(row => row.table_name), journal),
      message: "Read-only catalog and migration-journal assessment completed. No database record or schema was changed.",
    };
  } catch (error) {
    console.warn("[Database] Read-only schema readiness query failed:", error instanceof Error ? error.message : error);
    return {
      queryMode: "read_only" as const,
      schemaReachable: false,
      groups: null,
      migrationJournal: { present: false, appliedCount: null },
      safeToApplyLaterMigrations: false,
      message: "Read-only schema assessment could not complete. No schema change was attempted.",
    };
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  // New externally authenticated users start with no operational authority.
  // Role changes are explicit administrative actions and must never be reset on login.
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "citizen");
  if (user.role !== undefined) updateSet.role = user.role;
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

function insertId(result: unknown) {
  const row = Array.isArray(result) ? result[0] : result;
  return Number((row as { id?: number }).id ?? 0);
}

export async function getMissionOverview() {
  const db = await getDb();
  const persistence = db
    ? { available: true, configured: true, driver: "postgresql", portableEvidenceStorage: supabasePortableStorageConfigured(), message: supabasePortableStorageConfigured() ? "Persistent mission records and portable private evidence storage are ready." : "Persistent mission records are ready, but portable private evidence storage is not configured." }
    : { available: false, configured: Boolean(postgresDatabaseUrl()), driver: "postgresql", message: "Persistent missions, original evidence, and PDF reports require a compatible PostgreSQL DATABASE_URL." };
  if (!db) return { assets: [], missions: [], defects: [], telemetry: [], reports: [], estimates: [], reviews: [], audit: [], alerts: [], persistence };
  // Run schema migration before queries
  await ensureReportsColumns(db);
  const safe = async <T,>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); }
    catch (err) { console.warn(`[getMissionOverview] ${label} failed:`, err instanceof Error ? err.message?.substring(0, 200) : err); return fallback; }
  };
  const [assetRows, missionRows, defectRows, telemetryRows, reportRows, estimateRows, reviewRows, auditRows, alertRows] = await Promise.all([
    safe("assets", () => db.select().from(assets).orderBy(desc(assets.updatedAt)).limit(40), [] as any[]),
    safe("missions", () => db.select().from(missions).orderBy(desc(missions.createdAt)).limit(30), [] as any[]),
    safe("defects", () => db.select().from(defects).orderBy(desc(defects.zeroErrorScore)).limit(120), [] as any[]),
    safe("telemetry", () => db.select().from(telemetry).orderBy(desc(telemetry.capturedAt)).limit(240), [] as any[]),
    safe("reports", () => db.select(reportListColumns).from(reports).orderBy(desc(reports.createdAt)).limit(30), [] as any[]),
    safe("repairEstimates", () => db.select().from(repairEstimates).orderBy(desc(repairEstimates.createdAt)).limit(120), [] as any[]),
    safe("reviews", () => db.select().from(reviews).orderBy(desc(reviews.createdAt)).limit(120), [] as any[]),
    safe("auditEvents", () => db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(120), [] as any[]),
    safe("alerts", () => db.select().from(alerts).orderBy(desc(alerts.createdAt)).limit(120), [] as any[]),
  ]);
  return { assets: assetRows, missions: missionRows, defects: defectRows, telemetry: telemetryRows, reports: reportRows, estimates: estimateRows, reviews: reviewRows, audit: auditRows, alerts: alertRows, persistence };
}

export async function getPublicMissionOverview() {
  const db = await getDb();
  if (!db) return {
    assets: [], missions: [], defects: [], telemetry: [], reports: [], estimates: [], reviews: [], audit: [], alerts: [],
    persistence: { available: false, configured: Boolean(postgresDatabaseUrl()), driver: "postgresql", portableEvidenceStorage: false, message: "PostgreSQL is not configured." },
  };
  // Run schema migrations BEFORE queries (idempotent, fast on subsequent calls)
  await ensureReportsColumns(db);

  // Each query is wrapped in try/catch so a single failing table doesn't crash the entire overview
  const safe = async <T,>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); }
    catch (err) { console.warn(`[getPublicMissionOverview] ${label} query failed:`, err instanceof Error ? err.message?.substring(0, 200) : err); return fallback; }
  };

  const [assetRows, missionRows, defectRows, telemetryRows, reportRows, estimateRows, reviewRows, auditRows, alertRows] = await Promise.all([
    safe("assets", () => db.select().from(assets).orderBy(desc(assets.updatedAt)).limit(40), [] as any[]),
    safe("missions", () => db.select().from(missions).orderBy(desc(missions.createdAt)).limit(30), [] as any[]),
    safe("defects", () => db.select().from(defects).orderBy(desc(defects.zeroErrorScore)).limit(120), [] as any[]),
    safe("telemetry", () => db.select().from(telemetry).orderBy(desc(telemetry.capturedAt)).limit(240), [] as any[]),
    safe("reports", () => db.select(reportListColumns).from(reports).orderBy(desc(reports.createdAt)).limit(30), [] as any[]),
    safe("repairEstimates", () => db.select().from(repairEstimates).orderBy(desc(repairEstimates.createdAt)).limit(120), [] as any[]),
    safe("reviews", () => db.select().from(reviews).orderBy(desc(reviews.createdAt)).limit(120), [] as any[]),
    safe("auditEvents", () => db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(120), [] as any[]),
    safe("alerts", () => db.select().from(alerts).orderBy(desc(alerts.createdAt)).limit(120), [] as any[]),
  ]);
  return {
    assets: assetRows, missions: missionRows, defects: defectRows, telemetry: telemetryRows,
    reports: reportRows, estimates: estimateRows, reviews: reviewRows, audit: auditRows, alerts: alertRows,
    persistence: { available: true, configured: true, driver: "postgresql", portableEvidenceStorage: supabasePortableStorageConfigured(), message: "Database connected. Demo detections are visible on the map." },
  };
}

export async function createDemoMissionRecord(input: { name: string; createdBy?: number | null; simulator: Awaited<ReturnType<typeof import("./services/simulator").buildSimulatorMission>> }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable. Configure DATABASE_URL before creating persistent missions.");
  if (!supabasePortableStorageConfigured()) throw new Error("Portable evidence storage is required before creating a persistent simulator mission.");
  const assetResult = await db.insert(assets).values({ name: "Rajpath Viaduct · North span", assetType: "bridge", locality: "New Delhi demo sector", latitude: "28.6139", longitude: "77.2090", criticality: 5, status: "watch" }).returning({ id: assets.id });
  const assetId = insertId(assetResult);
  const missionResult = await db.insert(missions).values({ assetId, createdBy: input.createdBy ?? null, name: input.name, mode: "demo", status: "completed", startedAt: new Date(input.simulator.startedAt), completedAt: new Date() }).returning({ id: missions.id });
  const missionId = insertId(missionResult);
  await db.insert(telemetry).values(input.simulator.telemetry.map(point => ({ missionId, latitude: point.latitude.toFixed(6), longitude: point.longitude.toFixed(6), altitudeMeters: Math.round(point.altitude), speedMps: Math.round(point.speedMps), batteryPercent: point.batteryPercent, capturedAt: new Date(point.timestamp) })));

  for (let index = 0; index < input.simulator.findings.length; index += 1) {
    const finding = input.simulator.findings[index]!;
    let evidenceId: number | null = null;
    try {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="100%" height="100%" fill="#343434"/><path d="M0 600 L420 210 L860 720" stroke="#cfcfc8" stroke-width="92" fill="none"/><rect x="${460 + index * 55}" y="${240 + index * 35}" width="230" height="150" fill="none" stroke="#ffffff" stroke-width="6"/><text x="60" y="72" fill="#ffffff" font-size="30" font-family="Arial" letter-spacing="6">DRIFT / SIMULATED EVIDENCE</text><text x="60" y="670" fill="#ffffff" font-size="24" font-family="Arial">${finding.title.toUpperCase()} · ${Math.round(finding.confidence * 100)}% CONFIDENCE</text></svg>`;
      const stored = await storagePutWithFallback(`drift/system/missions/${missionId}/simulated-evidence-${index + 1}.svg`, svg, "image/svg+xml");
      const evidenceResult = await db.insert(evidence).values({ missionId, fileName: `${finding.title.replace(/\s+/g, "-")}.svg`, mimeType: "image/svg+xml", storageKey: stored.key, storageUrl: stored.url, mediaKind: "annotation", source: "simulator", latitude: finding.latitude.toFixed(6), longitude: finding.longitude.toFixed(6), playbackSeconds: finding.captureOffsetSeconds, captureZone: finding.label === "structural" ? "under-bridge" : "oblique", qualityStatus: "review", imageQuality: { source: "simulator", singleFrame: true, requiresEngineerReview: true }, provenance: { kind: "generated-simulator", generator: "DRIFT simulator", note: "Synthetic annotation generated for repeatable demo workflow; not a live inspection.", inspectionDomain: finding.label === "pothole" ? "roads" : "bridges" }, attachmentData: stored.attachmentData }).returning({ id: evidence.id });
      evidenceId = insertId(evidenceResult);
    } catch (error) {
      console.warn("[DRIFT Storage] Simulator evidence record could not be persisted:", error);
    }
    const defectResult = await db.insert(defects).values({ missionId, assetId, evidenceId, defectType: finding.label, label: finding.title, confidencePercent: Math.round(finding.confidence * 100), zeroErrorScore: finding.score.score, severity: finding.score.severity, status: finding.score.severity === "critical" ? "under_review" : "detected", reviewState: "pending", latitude: finding.latitude.toFixed(6), longitude: finding.longitude.toFixed(6), boundingBox: finding.boundingBox, explanation: finding.score.explanation, inspectionDomain: finding.label === "pothole" ? "roads" : "bridges", coveragePercent: 100, uncertainty: { reason: "Simulator evidence is not a site survey", requiresHumanReview: true }, correlationKey: `simulator:${missionId}:${index}`, reviewRequired: 1 }).returning({ id: defects.id });
    const defectId = insertId(defectResult);
    await db.insert(severityHistory).values({ defectId, nextSeverity: finding.score.severity, score: finding.score.score, reason: finding.score.explanation.join("; "), changedBy: input.createdBy ?? null });
    await db.insert(repairEstimates).values({ defectId, estimateCents: finding.score.repairEstimateCents, currency: "INR", assumptions: { method: "ZeroError deterministic cost rule", defectType: finding.label }, status: "draft" });
    if (finding.score.severity === "critical" || finding.score.severity === "high") await db.insert(alerts).values({ missionId, defectId, severity: finding.score.severity, title: `${finding.score.severity.toUpperCase()} · ${finding.title}`, message: finding.score.urgency, status: "open" });
  }

  const reportTitle = `${input.name} · ZeroError inspection report`;
  const reportNarrative = "Demo report generated from simulated telemetry and explainable ML inference. Evidence references, capture coverage, uncertainty, and next-inspection actions are included; engineering sign-off is required before release.";
  let reportStorage: { key?: string; url?: string; attachmentData?: Buffer } = {};
  try {
    const body = `# ${reportTitle}\n\n${reportNarrative}\n\n## Inspection scope\n\nDomains: roads, bridges. Capture zones: oblique, under-bridge. Mode: simulator.\n\n## Findings\n\n${input.simulator.findings.map((finding, index) => `- ${finding.title}: ${finding.score.severity} priority, ${finding.score.score}/100 ZeroError score, ${Math.round(finding.confidence * 100)}% raw confidence, evidence reference simulator:${missionId}:${index}. Coverage is simulator-generated and not a site-survey measurement. Uncertainty: single-pass simulated evidence. Next action: engineer review and site verification before work-order release.`).join("\n")}\n\n## Control boundary\n\nAutomated findings are advisory. An authorised engineer must verify, override, or reject every repair priority before release. Sign-off status: PENDING.\n`;
    reportStorage = await storagePutWithFallback(`drift/system/missions/${missionId}/zeroerror-report.md`, body, "text/markdown");
  } catch (error) {
    console.warn("[DRIFT Storage] Report record created without a downloadable attachment:", error);
  }
  await db.insert(reports).values({ missionId, title: reportTitle, narrative: reportNarrative, storageKey: reportStorage.key, storageUrl: reportStorage.url, status: "ready", generatedBy: "zeroerror-demo", inspectionScope: { domains: ["roads", "bridges"], captureZones: ["oblique", "under-bridge"], mode: "simulator" }, signoff: { required: true, status: "pending", note: "Engineer sign-off required before release." }, attachmentData: reportStorage.attachmentData });
  await db.insert(auditEvents).values({ missionId, actorId: input.createdBy ?? null, action: "simulator.mission_created", details: { findings: input.simulator.findings.length, mode: "demo" } });
  return { missionId, assetId };
}

export async function createHardwareCaptureMission(input: { name: string; createdBy?: number | null; aircraftProfile: string; adapter: "mavlink-bridge" | "http-webhook" | "rtsp-media"; latitude: number; longitude: number; operatorNote?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable. Configure DATABASE_URL before creating a UAV capture mission.");
  if (!supabasePortableStorageConfigured()) throw new Error("Portable evidence storage is required before creating a hardware capture mission.");
  const assetResult = await db.insert(assets).values({ name: `${input.name} · UAV capture asset`, assetType: "bridge", locality: "Operator-supplied capture location", latitude: input.latitude.toFixed(6), longitude: input.longitude.toFixed(6), criticality: 3, status: "watch" }).returning({ id: assets.id });
  const assetId = insertId(assetResult);
  const missionResult = await db.insert(missions).values({ assetId, createdBy: input.createdBy ?? null, name: input.name, mode: "hardware", status: "preflight", hardwareAdapter: input.adapter, operatorNote: input.operatorNote ?? "Operator-created UAV capture mission. No aircraft command is issued by DRIFT.", inspectionProfile: { aircraftProfile: input.aircraftProfile, mediaProvenance: "operator-captured-original-required", bridgeContract: input.adapter } }).returning({ id: missions.id });
  const missionId = insertId(missionResult);
  await db.insert(auditEvents).values({ missionId, actorId: input.createdBy ?? null, action: "hardware.capture_mission_created", details: { aircraftProfile: input.aircraftProfile, adapter: input.adapter, latitude: input.latitude, longitude: input.longitude, noFlightCommandsIssued: true } });
  return { missionId, assetId, mode: "hardware" as const, status: "preflight" as const };
}

export async function createEvidenceRecord(input: { missionId: number; uploadedBy?: number | null; fileName: string; mimeType: string; storageKey: string; storageUrl: string; attachmentData?: Buffer; mediaKind: "photo" | "video" | "annotation" | "report"; latitude?: string; longitude?: string; playbackSeconds?: number; source?: "hardware" | "upload" | "simulator"; sha256?: string; capturedAt?: Date; cameraId?: string; provenance?: Record<string, unknown>; captureZone?: string; headingDegrees?: number; qualityStatus?: "pending" | "pass" | "review" | "fail"; imageQuality?: Record<string, unknown> }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const mission = (await db.select({ id: missions.id }).from(missions).where(eq(missions.id, input.missionId)).limit(1))[0];
  if (!mission) throw new Error("Mission does not exist; evidence was not stored.");
  const result = await db.insert(evidence).values({ ...input, source: input.source ?? "upload" }).returning({ id: evidence.id });
  const evidenceId = insertId(result);
  const provenance = input.provenance ?? {};
  const correlationKey = typeof provenance.correlationKey === "string" ? provenance.correlationKey : `mission:${input.missionId}:evidence:${evidenceId}`;
  await db.insert(inspectionCorrelations).values({ correlationKey, missionId: input.missionId, evidenceId, relationType: "evidence" });
  return { id: evidenceId };
}

export async function persistInferenceDefect(input: { missionId: number; assetId: number; evidenceId: number; latitude: number; longitude: number; inference: InferenceResult; inspectionDomain?: string; correlationKey?: string; createdBy?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const defectResult = await db.insert(defects).values({ missionId: input.missionId, assetId: input.assetId, evidenceId: input.evidenceId, defectType: input.inference.label, label: `${input.inference.label} candidate`, confidencePercent: Math.round(input.inference.confidence * 100), zeroErrorScore: input.inference.score.score, severity: input.inference.score.severity, status: input.inference.score.severity === "critical" ? "under_review" : "detected", reviewState: "pending", latitude: input.latitude.toFixed(6), longitude: input.longitude.toFixed(6), boundingBox: input.inference.boundingBox, explanation: input.inference.score.explanation, inferenceModel: input.inference.model, inferenceSource: input.inference.source, inferenceAnnotation: input.inference.annotationNote, inferenceCapturedAt: new Date(), inspectionDomain: input.inspectionDomain, correlationKey: input.correlationKey, coveragePercent: input.inference.coveragePercent, uncertainty: input.inference.uncertainty, reviewRequired: 1 }).returning({ id: defects.id });
  const defectId = insertId(defectResult);
  await db.insert(inspectionCorrelations).values({ correlationKey: input.correlationKey ?? `mission:${input.missionId}:finding:${defectId}`, missionId: input.missionId, assetId: input.assetId, evidenceId: input.evidenceId, defectId, relationType: "finding" });
  await db.insert(severityHistory).values({ defectId, nextSeverity: input.inference.score.severity, score: input.inference.score.score, reason: input.inference.annotationNote, changedBy: input.createdBy ?? null });
  if (input.inference.score.severity === "critical" || input.inference.score.severity === "high") await db.insert(alerts).values({ missionId: input.missionId, defectId, severity: input.inference.score.severity, title: `${input.inference.score.severity.toUpperCase()} · ${input.inference.label} candidate`, message: input.inference.score.urgency, status: "open" });
  await db.insert(auditEvents).values({ missionId: input.missionId, defectId, actorId: input.createdBy ?? null, action: "inference.completed", details: { model: input.inference.model, source: input.inference.source, confidence: input.inference.confidence, evidenceId: input.evidenceId } });
  return { defectId, source: input.inference.source, model: input.inference.model };
}

export async function generateMissionReport(input: { missionId: number; generatedBy?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const mission = (await db.select().from(missions).where(eq(missions.id, input.missionId)).limit(1))[0];
  if (!mission) throw new Error("Mission does not exist.");
  const [evidenceRows, defectRows] = await Promise.all([
    db.select().from(evidence).where(eq(evidence.missionId, input.missionId)).orderBy(desc(evidence.createdAt)),
    db.select().from(defects).where(eq(defects.missionId, input.missionId)).orderBy(desc(defects.zeroErrorScore)),
  ]);
  const estimateRows = defectRows.length ? await db.select().from(repairEstimates).where(inArray(repairEstimates.defectId, defectRows.map(row => row.id))).orderBy(desc(repairEstimates.createdAt)) : [];
  const evidenceForPdf = await Promise.all(evidenceRows.map(async row => {
    if (row.attachmentData && row.mimeType.startsWith("image/")) return { ...row, imageBuffer: Buffer.from(row.attachmentData) };
    if (!row.mimeType.startsWith("image/") || !row.storageKey) return row;
    try {
      const response = await fetch(await storageGetSignedUrl(row.storageKey));
      if (!response.ok) return row;
      return { ...row, imageBuffer: Buffer.from(await response.arrayBuffer()) };
    } catch {
      return row;
    }
  }));
  const title = `${mission.name} · Evidence-linked inspection report`;
  const severityCounts = summarizeSeverity(defectRows);
  const repairTotalCents = estimateRows.reduce((sum, row) => sum + row.estimateCents, 0);
  const body = `# ${title}\n\n## Executive summary\n\n${evidenceRows.length} evidence record(s), ${defectRows.length} candidate finding(s), ${severityCounts.critical ?? 0} critical, ${severityCounts.high ?? 0} high, ${severityCounts.medium ?? 0} medium, and ${severityCounts.low ?? 0} low. Engineer sign-off is pending.\n\n## Evidence coverage\n\n${evidenceRows.map(row => `- Evidence ${row.id}: ${row.fileName} (${row.source ?? "unknown"}), capture zone ${row.captureZone ?? "unknown"}, quality ${row.qualityStatus ?? "unknown"}, coordinates ${row.latitude ?? "unknown"}, ${row.longitude ?? "unknown"}.`).join("\\n") || "No evidence records are available."}\n\n## Candidate findings\n\n${defectRows.map(row => `- Defect ${row.id}: ${row.defectType} · ${row.severity} · ${row.confidencePercent ?? 0}% confidence · ${row.coveragePercent ?? 0}% coverage · evidence ${row.evidenceId ?? "unlinked"} · correlation ${row.correlationKey ?? "unlinked"}.`).join("\\n") || "No defect candidates are available."}\n\n## Next inspection\n\nRepeat the pass with an engineer-approved coverage plan, original media review, and calibrated production CV model for the relevant asset domain and capture zone.\n\n## Sign-off\n\nStatus: PENDING. Automated outputs are advisory and require qualified engineer review before maintenance release.\n`;
  const pdf = await renderInspectionPdf({ mission, evidence: evidenceForPdf, defects: defectRows, repairTotalCents });
  const stored = await storagePutWithFallback(`drift/system/missions/${input.missionId}/inspection-report-${Date.now()}.pdf`, pdf, "application/pdf");
  const result = await db.insert(reports).values({ missionId: input.missionId, title, narrative: `Engineer-ready PDF report generated from ${evidenceRows.length} evidence item(s) and ${defectRows.length} candidate finding(s). Severity: ${severityCounts.critical ?? 0} critical / ${severityCounts.high ?? 0} high / ${severityCounts.medium ?? 0} medium / ${severityCounts.low ?? 0} low. Sign-off is pending.`, storageKey: stored.key, storageUrl: stored.url, status: "ready", generatedBy: input.generatedBy ? String(input.generatedBy) : "drift-report-generator", inspectionScope: { evidenceCount: evidenceRows.length, defectCount: defectRows.length, severityCounts, repairTotalCents, coordinateCount: defectRows.filter(row => row.latitude && row.longitude).length, format: "application/pdf" }, signoff: { required: true, status: "pending" }, attachmentData: stored.attachmentData }).returning({ id: reports.id });
  return { reportId: insertId(result), title, storageUrl: stored.url, evidenceCount: evidenceRows.length, defectCount: defectRows.length, body, format: "application/pdf", severityCounts };
}

export async function listMissionEvidence(missionId: number) { const db = await getDb(); return db ? db.select(evidenceListColumns).from(evidence).where(eq(evidence.missionId, missionId)).orderBy(desc(evidence.createdAt)) : []; }
export async function listDemoEvidence(missionId: number) {
  const db = await getDb();
  if (!db) return [];
  const mission = (await db.select().from(missions).where(eq(missions.id, missionId)).limit(1))[0];
  if (!mission || mission.mode !== "demo") return [];
  const rows = await db.select(evidenceListColumns).from(evidence).where(eq(evidence.missionId, missionId)).orderBy(desc(evidence.createdAt));
  return rows.filter(item => item.source === "simulator");
}

export async function addTelemetryRecord(input: { missionId: number; latitude: number; longitude: number; altitude: number; speedMps: number; batteryPercent: number; timestamp: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const mission = (await db.select({ id: missions.id }).from(missions).where(eq(missions.id, input.missionId)).limit(1))[0];
  if (!mission) throw new Error("Mission does not exist; telemetry was not stored.");
  const result = await db.insert(telemetry).values({ missionId: input.missionId, latitude: input.latitude.toFixed(6), longitude: input.longitude.toFixed(6), altitudeMeters: Math.round(input.altitude), speedMps: Math.round(input.speedMps), batteryPercent: Math.round(input.batteryPercent), capturedAt: new Date(input.timestamp) }).returning({ id: telemetry.id });
  const telemetryId = insertId(result);
  await db.insert(inspectionCorrelations).values({ correlationKey: `mission:${input.missionId}:telemetry`, missionId: input.missionId, telemetryId, relationType: "telemetry" });
  await db.insert(auditEvents).values({ missionId: input.missionId, action: "hardware.telemetry_ingested", details: { source: "operator-approved adapter", batteryPercent: input.batteryPercent } });
  return { id: insertId(result) };
}

export async function listCorrelatedDefects(correlationKey: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inspectionCorrelations).where(eq(inspectionCorrelations.correlationKey, correlationKey)).orderBy(desc(inspectionCorrelations.createdAt));
}

export async function listFilteredDefects(filters: { assetId?: number; missionId?: number; defectType?: DefectKind; severity?: "low" | "medium" | "high" | "critical"; status?: "detected" | "under_review" | "verified" | "scheduled" | "resolved" | "dismissed"; reviewState?: "pending" | "approved" | "overridden" | "rejected"; inspectionDomain?: string }) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(defects).orderBy(desc(defects.zeroErrorScore)).limit(250);
  return rows.filter(defect => (!filters.assetId || defect.assetId === filters.assetId) && (!filters.missionId || defect.missionId === filters.missionId) && (!filters.defectType || defect.defectType === filters.defectType) && (!filters.severity || defect.severity === filters.severity) && (!filters.status || defect.status === filters.status) && (!filters.reviewState || defect.reviewState === filters.reviewState) && (!filters.inspectionDomain || defect.inspectionDomain === filters.inspectionDomain));
}

export async function listAlerts() { const db = await getDb(); return db ? db.select().from(alerts).orderBy(desc(alerts.createdAt)).limit(200) : []; }
export async function acknowledgeAlert(alertId: number, actorId: number) { const db = await getDb(); if (!db) throw new Error("Database is unavailable."); await db.update(alerts).set({ status: "acknowledged", acknowledgedBy: actorId, acknowledgedAt: new Date() }).where(eq(alerts.id, alertId)); return { success: true }; }
export async function listReportRecords() {
  const db = await getDb();
  if (!db) return [];
  await ensureReportsColumns(db);
  try { return await db.select(reportListColumns).from(reports).orderBy(desc(reports.createdAt)).limit(100); }
  catch (err) { console.warn("[listReportRecords] Query failed:", err instanceof Error ? err.message?.substring(0, 200) : err); return []; }
}
export async function listAuditEvents(missionId?: number) { const db = await getDb(); if (!db) return []; const rows = await db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(300); return missionId ? rows.filter(row => row.missionId === missionId) : rows; }
export async function listAssets() { const db = await getDb(); return db ? db.select().from(assets).orderBy(desc(assets.updatedAt)).limit(100) : []; }

export async function getDatabaseAttachment(storageKey: string) {
  if (!storageKey.startsWith("db:")) return undefined;
  const db = await getDb();
  if (!db) return undefined;
  const evidenceRow = (await db.select({ data: evidence.attachmentData, mimeType: evidence.mimeType, fileName: evidence.fileName }).from(evidence).where(eq(evidence.storageKey, storageKey)).limit(1))[0];
  if (evidenceRow?.data) return { data: Buffer.from(evidenceRow.data), mimeType: evidenceRow.mimeType, fileName: evidenceRow.fileName };
  const reportRow = (await db.select({ data: reports.attachmentData, title: reports.title, inspectionScope: reports.inspectionScope }).from(reports).where(eq(reports.storageKey, storageKey)).limit(1))[0];
  if (reportRow?.data) {
    const isPdf = typeof reportRow.inspectionScope === "object" && reportRow.inspectionScope !== null && (reportRow.inspectionScope as Record<string, unknown>).format === "application/pdf";
    return { data: Buffer.from(reportRow.data), mimeType: isPdf ? "application/pdf" : "text/markdown; charset=utf-8", fileName: `${reportRow.title.replace(/[^a-zA-Z0-9._-]+/g, "-")}.${isPdf ? "pdf" : "md"}` };
  }
  return undefined;
}
export async function createAssetRecord(input: { name: string; assetType: "bridge" | "road" | "rail" | "building" | "utility"; locality: string; latitude: string; longitude: string; criticality: number }) { const db = await getDb(); if (!db) throw new Error("Database is unavailable."); const result = await db.insert(assets).values({ ...input, status: "operational" }).returning({ id: assets.id }); return { id: insertId(result) }; }
export async function updateAssetRecord(id: number, input: Partial<{ name: string; assetType: "bridge" | "road" | "rail" | "building" | "utility"; locality: string; latitude: string; longitude: string; criticality: number; status: "operational" | "watch" | "restricted" | "closed" }>) { const db = await getDb(); if (!db) throw new Error("Database is unavailable."); await db.update(assets).set(input).where(eq(assets.id, id)); return { success: true }; }
export async function deleteAssetRecord(id: number) { const db = await getDb(); if (!db) throw new Error("Database is unavailable."); const dependentMission = (await db.select().from(missions).where(eq(missions.assetId, id)).limit(1))[0]; if (dependentMission) throw new Error("Assets with mission history cannot be deleted; set a restricted or closed status instead."); await db.delete(assets).where(eq(assets.id, id)); return { success: true }; }
export async function getMapData(filters: Parameters<typeof listFilteredDefects>[0]) { const rows = await listFilteredDefects(filters); return rows.map(toMapMarker); }

export async function addReview(input: { defectId: number; reviewerId?: number | null; decision: "approve" | "override" | "reject" | "needs_site_visit"; priorityOverride?: "low" | "medium" | "high" | "critical"; note: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const result = await db.insert(reviews).values(input).returning({ id: reviews.id });
  const defect = (await db.select().from(defects).where(eq(defects.id, input.defectId)).limit(1))[0];
  if (defect) {
    const next = resolveReviewState(input.decision, defect.severity, input.priorityOverride);
    await db.update(defects).set(next).where(eq(defects.id, input.defectId));
    await db.insert(severityHistory).values({ defectId: defect.id, previousSeverity: defect.severity, nextSeverity: next.severity, score: defect.zeroErrorScore, reason: `Engineer ${input.decision}: ${input.note}`, changedBy: input.reviewerId ?? null });
    await db.insert(auditEvents).values({ missionId: defect.missionId, defectId: defect.id, actorId: input.reviewerId ?? null, action: `review.${input.decision}`, details: { note: input.note, priorityOverride: input.priorityOverride ?? null } });
  }
  return { id: insertId(result) };
}

type DsiInput = {
  assetCriticality: number;
  evidenceQuality?: number | null;
  locationConfidence?: number | null;
  approvedImpact?: number | null;
  repeatCount?: number | null;
  verificationState?: string | null;
};

function calculateDsi(input: DsiInput) {
  const evidenceQuality = input.evidenceQuality ?? null;
  const locationConfidence = input.locationConfidence ?? null;
  const approvedImpact = input.approvedImpact ?? null;
  const required = [evidenceQuality, locationConfidence, approvedImpact];
  const missing = required.some(value => value === null || value < 0 || value > 100) || input.assetCriticality < 1 || input.assetCriticality > 5;
  const factorBreakdown = {
    policyVersion: "dsi-v1.0",
    assetCriticality: { value: input.assetCriticality, source: "project-asset-register" },
    evidenceQuality: { value: evidenceQuality, source: "evidence-quality-record" },
    locationConfidence: { value: locationConfidence, source: "asset-or-approved-zone-match" },
    approvedImpact: { value: approvedImpact, source: "engineer-or-owner-approved-impact-input" },
    repeatCount: { value: input.repeatCount ?? 0, source: "linked-project-evidence-history" },
    verificationState: input.verificationState ?? "open",
    missingData: missing,
  };
  if (missing) return { priority: "insufficient_evidence" as const, advisoryScore: null, factorBreakdown };
  const score = Math.round(
    input.assetCriticality * 9 +
    (evidenceQuality ?? 0) * 0.16 +
    (locationConfidence ?? 0) * 0.14 +
    (approvedImpact ?? 0) * 0.22 +
    Math.min(input.repeatCount ?? 0, 5) * 3,
  );
  const priority = score >= 70 ? "p1" : score >= 55 ? "p2" : score >= 38 ? "p3" : "p4";
  return { priority, advisoryScore: Math.min(score, 100), factorBreakdown } as const;
}

function emptyAccountabilityOverview(persistence: { available: boolean; message: string }) {
  return { contractors: [], tickets: [], assessments: [], authorities: [], routing: [], handoffs: [], publications: [], cameras: [], cameraCandidates: [], knowledgeDocuments: [], persistence };
}

export function getPublicAccountabilityOverview() {
  return emptyAccountabilityOverview({ available: false, message: "Sign in with an approved DRIFT role to access contractor, CCTV, routing, and other accountability records." });
}

export async function getAccountabilityOverview() {
  const db = await getDb();
  const persistence = db
    ? { available: true, message: "Accountability records are ready for approved project data." }
    : { available: false, message: "Contractor, routing, SLA, CCTV, and handoff records require the PostgreSQL migration and DATABASE_URL." };
  if (!db) return emptyAccountabilityOverview(persistence);
  try {
    const [contractorRows, ticketRows, assessmentRows, authorityRows, routingRows, handoffRows, publicationRows, cameraRows, candidateRows] = await Promise.all([
      db.select().from(contractors).orderBy(desc(contractors.updatedAt)).limit(100),
      db.select().from(contractorTickets).orderBy(desc(contractorTickets.updatedAt)).limit(200),
      db.select().from(dsiAssessments).orderBy(desc(dsiAssessments.createdAt)).limit(200),
      db.select().from(authorities).orderBy(desc(authorities.updatedAt)).limit(100),
      db.select().from(routingDecisions).orderBy(desc(routingDecisions.updatedAt)).limit(200),
      db.select().from(handoffPackages).orderBy(desc(handoffPackages.updatedAt)).limit(200),
      db.select().from(publicStatusPublications).orderBy(desc(publicStatusPublications.updatedAt)).limit(200),
      db.select().from(cameraSources).orderBy(desc(cameraSources.updatedAt)).limit(100),
      db.select().from(cctvCandidates).orderBy(desc(cctvCandidates.updatedAt)).limit(200),
    ]);
    return { contractors: contractorRows, tickets: ticketRows, assessments: assessmentRows, authorities: authorityRows, routing: routingRows, handoffs: handoffRows, publications: publicationRows, cameras: cameraRows, cameraCandidates: candidateRows, knowledgeDocuments: [], persistence };
  } catch (error) {
    console.warn("[Accountability] PostgreSQL accountability tables are unavailable:", error instanceof Error ? error.message : error);
    return emptyAccountabilityOverview({ available: false, message: "Accountability records are not configured yet. Apply the reviewed PostgreSQL migration before adding approved project data." });
  }
}

export async function listAssignedContractorTickets(actorId: number) {
  const db = await getDb();
  const persistence = db
    ? { available: true, message: "Assigned contractor work is ready for approved project data." }
    : { available: false, message: "Assigned contractor work requires the PostgreSQL migration and DATABASE_URL." };
  if (!db) return { tickets: [], persistence };
  try {
    const assignments = await db.select({ contractorId: contractorUserAssignments.contractorId, active: contractorUserAssignments.active }).from(contractorUserAssignments).where(eq(contractorUserAssignments.userId, actorId));
    const activeContractorIds = new Set(assignments.filter(assignment => assignment.active === 1).map(assignment => assignment.contractorId));
    if (!activeContractorIds.size) return { tickets: [], persistence };
    const tickets = await db.select().from(contractorTickets).where(eq(contractorTickets.assignedUserId, actorId)).orderBy(desc(contractorTickets.updatedAt)).limit(100);
    return { tickets: tickets.filter(ticket => ticket.contractorId !== null && activeContractorIds.has(ticket.contractorId)), persistence };
  } catch (error) {
    console.warn("[Accountability] Assigned contractor work is unavailable:", error instanceof Error ? error.message : error);
    return { tickets: [], persistence: { available: false, message: "Assigned contractor work is not configured yet. Apply the reviewed PostgreSQL migration before adding approved project data." } };
  }
}

type KnowledgeRole = "admin" | "engineer" | "contractor" | "user" | "citizen";

function parsePermittedRoles(value: unknown): KnowledgeRole[] {
  if (!Array.isArray(value)) return [];
  return value.filter((role): role is KnowledgeRole => role === "admin" || role === "engineer" || role === "contractor" || role === "user" || role === "citizen");
}

function splitKnowledgeContent(content: string) {
  const blocks = content.replace(/\r/g, "").split(/\n\s*\n/).map(block => block.trim()).filter(Boolean);
  const chunks: Array<{ sectionReference: string; content: string }> = [];
  let buffer = "";
  for (const block of blocks) {
    const candidate = buffer ? `${buffer}\n\n${block}` : block;
    if (candidate.length > 1800 && buffer) {
      chunks.push({ sectionReference: `Chunk ${chunks.length + 1}`, content: buffer });
      buffer = block;
    } else buffer = candidate;
  }
  if (buffer) chunks.push({ sectionReference: `Chunk ${chunks.length + 1}`, content: buffer });
  return chunks.slice(0, 120);
}

export async function createKnowledgeDocumentRecord(input: { projectScope: string; title: string; documentType: string; version: string; permittedRoles: KnowledgeRole[]; sourceReference?: string; content: string; createdBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable. Configure PostgreSQL before registering approved knowledge.");
  const chunks = splitKnowledgeContent(input.content);
  if (!chunks.length) throw new Error("Knowledge content must contain readable text.");
  const result = await db.insert(knowledgeDocuments).values({ projectScope: input.projectScope, title: input.title, documentType: input.documentType, version: input.version, permittedRoles: input.permittedRoles, sourceReference: input.sourceReference, approvalStatus: "draft" }).returning({ id: knowledgeDocuments.id });
  const documentId = insertId(result);
  await db.insert(knowledgeChunks).values(chunks.map(chunk => ({ documentId, sectionReference: chunk.sectionReference, content: chunk.content, contentHash: crypto.createHash("sha256").update(chunk.content).digest("hex"), scopeMetadata: { projectScope: input.projectScope, registration: "admin-submitted-draft", untrustedContent: true } })));
  await db.insert(auditEvents).values({ actorId: input.createdBy, action: "knowledge.document_registered_draft", details: { documentId, projectScope: input.projectScope, chunkCount: chunks.length } });
  return { documentId, chunkCount: chunks.length, approvalStatus: "draft" as const };
}

export async function approveKnowledgeDocumentRecord(input: { documentId: number; approvedBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const document = (await db.select({ id: knowledgeDocuments.id, approvalStatus: knowledgeDocuments.approvalStatus }).from(knowledgeDocuments).where(eq(knowledgeDocuments.id, input.documentId)).limit(1))[0];
  if (!document) throw new Error("Knowledge document does not exist.");
  const chunks = await db.select({ id: knowledgeChunks.id }).from(knowledgeChunks).where(eq(knowledgeChunks.documentId, input.documentId));
  if (!chunks.length) throw new Error("Knowledge document has no chunked source content to approve.");
  await db.update(knowledgeDocuments).set({ approvalStatus: "approved", approvedBy: input.approvedBy, effectiveAt: new Date(), updatedAt: new Date() }).where(eq(knowledgeDocuments.id, input.documentId));
  await db.insert(auditEvents).values({ actorId: input.approvedBy, action: "knowledge.document_approved", details: { documentId: input.documentId, chunkCount: chunks.length } });
  return { success: true, approvalStatus: "approved" as const };
}

export async function retrieveApprovedKnowledge(input: { question: string; role: KnowledgeRole; actorId: number; projectScope?: string }) {
  const db = await getDb();
  if (!db) return { status: "persistence_required" as const, message: "Approved knowledge retrieval requires the PostgreSQL migration and DATABASE_URL.", citations: [] as KnowledgeCitation[] };
  const activeDocuments = (await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.approvalStatus, "approved"))).filter(document => (!input.projectScope || document.projectScope === input.projectScope) && parsePermittedRoles(document.permittedRoles).includes(input.role));
  const queryHash = crypto.createHash("sha256").update(input.question.trim()).digest("hex");
  if (!activeDocuments.length) {
    await db.insert(knowledgeRetrievalRuns).values({ actorId: input.actorId, projectScope: input.projectScope, queryHash, status: "no_accessible_source", returnedChunkIds: [] });
    return { status: "no_accessible_source" as const, message: "No approved project source is accessible for this role and scope.", citations: [] as KnowledgeCitation[] };
  }
  const chunks = await db.select().from(knowledgeChunks).where(inArray(knowledgeChunks.documentId, activeDocuments.map(document => document.id)));
  const documentsById = new Map(activeDocuments.map(document => [document.id, document]));
  const citations = rankApprovedKnowledge(input.question, chunks.map(chunk => {
    const document = documentsById.get(chunk.documentId)!;
    return { chunkId: chunk.id, documentId: document.id, title: document.title, version: document.version, sourceReference: document.sourceReference, sectionReference: chunk.sectionReference, content: chunk.content };
  }));
  const status = citations.length ? "retrieved" as const : "no_approved_match" as const;
  await db.insert(knowledgeRetrievalRuns).values({ actorId: input.actorId, projectScope: input.projectScope, queryHash, status, returnedChunkIds: citations.map(citation => citation.chunkId) });
  return { status, message: citations.length ? "Approved, role-scoped source excerpts retrieved." : "No approved source excerpt matches this question. DRIFT will not make a project-specific claim.", citations };
}

export async function listKnowledgeRetrievalRuns() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(knowledgeRetrievalRuns).orderBy(desc(knowledgeRetrievalRuns.createdAt)).limit(200);
}

export async function createContractorRecord(input: { legalName: string; externalReference?: string; createdBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable. Configure PostgreSQL before adding real contractors.");
  const existing = (await db.select({ id: contractors.id }).from(contractors).where(eq(contractors.legalName, input.legalName)).limit(1))[0];
  if (existing) throw new Error("A contractor with this legal name already exists.");
  const result = await db.insert(contractors).values({ legalName: input.legalName, externalReference: input.externalReference, createdBy: input.createdBy, status: "active" }).returning({ id: contractors.id });
  return { id: insertId(result) };
}

export async function assignContractorUserRecord(input: { contractorId: number; userId: number; assignedBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable. Configure PostgreSQL before assigning contractor users.");
  const contractor = (await db.select({ id: contractors.id, status: contractors.status }).from(contractors).where(eq(contractors.id, input.contractorId)).limit(1))[0];
  const user = (await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
  if (!contractor || contractor.status !== "active") throw new Error("An active real contractor record is required.");
  if (!user || user.role !== "contractor") throw new Error("The assigned user must hold the contractor role.");
  const existing = (await db.select({ id: contractorUserAssignments.id, userId: contractorUserAssignments.userId, active: contractorUserAssignments.active }).from(contractorUserAssignments).where(eq(contractorUserAssignments.contractorId, input.contractorId))).find(row => row.userId === input.userId && row.active === 1);
  if (existing) throw new Error("This contractor user already has an active project assignment.");
  const result = await db.insert(contractorUserAssignments).values({ ...input, active: 1 }).returning({ id: contractorUserAssignments.id });
  await db.insert(auditEvents).values({ actorId: input.assignedBy, action: "accountability.contractor_user_assigned", details: { contractorId: input.contractorId, userId: input.userId } });
  return { id: insertId(result) };
}

export async function createCameraSourceRecord(input: { ownerName: string; cameraCode: string; displayName: string; authorizedPurpose: string; zoneLabel: string; latitude?: string; longitude?: string; retentionUntil: Date; accessClassification: string; consentAndPrivacyNote: string; createdBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable. Configure PostgreSQL before registering authorized cameras.");
  if (input.retentionUntil <= new Date()) throw new Error("Camera retention policy must end in the future.");
  const existing = (await db.select({ id: cameraSources.id }).from(cameraSources).where(eq(cameraSources.cameraCode, input.cameraCode)).limit(1))[0];
  if (existing) throw new Error("Camera code is already registered for this project.");
  const result = await db.insert(cameraSources).values(input).returning({ id: cameraSources.id });
  const cameraSourceId = insertId(result);
  await db.insert(auditEvents).values({ actorId: input.createdBy, action: "accountability.camera_registered", details: { cameraSourceId, cameraCode: input.cameraCode, zoneLabel: input.zoneLabel, retentionUntil: input.retentionUntil.toISOString() } });
  return { cameraSourceId };
}

export async function createCctvCandidateRecord(input: { cameraSourceId: number; evidenceId: number; assetId?: number; candidateType: string; zoneLabel: string; latitude?: string; longitude?: string; bridgeIdentity: string; dedupeKey: string; detectionConfidence: number; localizationConfidence: number; evidenceQuality: number; temporalObservationCount: number; qualitySignals: Record<string, unknown>; observedAt: Date; createdBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable. Configure PostgreSQL before registering CCTV candidates.");
  const camera = (await db.select().from(cameraSources).where(eq(cameraSources.id, input.cameraSourceId)).limit(1))[0];
  if (!camera) throw new Error("Authorized camera source does not exist.");
  if (camera.retentionUntil <= new Date()) throw new Error("Camera retention policy has expired; new candidate intake is blocked.");
  const media = (await db.select({ id: evidence.id, source: evidence.source, cameraId: evidence.cameraId }).from(evidence).where(eq(evidence.id, input.evidenceId)).limit(1))[0];
  if (!media || media.source !== "cctv") throw new Error("A real authorized CCTV evidence record is required.");
  if (media.cameraId !== camera.cameraCode) throw new Error("CCTV evidence camera identity does not match the registered source.");
  const existing = (await db.select({ id: cctvCandidates.id, status: cctvCandidates.status }).from(cctvCandidates).where(eq(cctvCandidates.dedupeKey, input.dedupeKey)).limit(1))[0];
  if (existing) return { candidateId: existing.id, status: existing.status, duplicate: true };
  const result = await db.insert(cctvCandidates).values({ ...input, status: "pending_review" }).returning({ id: cctvCandidates.id });
  const candidateId = insertId(result);
  await db.insert(auditEvents).values({ actorId: input.createdBy, action: "accountability.cctv_candidate_registered", details: { candidateId, cameraSourceId: input.cameraSourceId, evidenceId: input.evidenceId, candidateType: input.candidateType, detectionConfidence: input.detectionConfidence, temporalObservationCount: input.temporalObservationCount } });
  return { candidateId, status: "pending_review" as const, duplicate: false };
}

export async function reviewCctvCandidateRecord(input: { candidateId: number; decision: "rejected" | "ground_check" | "uav_preflight_recommended"; operatorNote: string; reviewedBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const candidate = (await db.select().from(cctvCandidates).where(eq(cctvCandidates.id, input.candidateId)).limit(1))[0];
  if (!candidate) throw new Error("CCTV candidate does not exist.");
  if (candidate.status !== "pending_review") throw new Error("Only pending CCTV candidates can be reviewed.");
  await db.update(cctvCandidates).set({ status: input.decision, operatorNote: input.operatorNote, reviewedBy: input.reviewedBy, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(cctvCandidates.id, input.candidateId));
  await db.insert(auditEvents).values({ actorId: input.reviewedBy, action: `accountability.cctv_candidate_${input.decision}`, details: { candidateId: input.candidateId, evidenceId: candidate.evidenceId, cameraSourceId: candidate.cameraSourceId, humanReviewRequired: true } });
  return { success: true, status: input.decision };
}

export async function registerAuthorizedSecurityObservationRecord(input: { assetId?: number; cameraSourceId?: number; source: "authorized_bridge_health" | "approved_security_adapter"; integrationName: string; sourceRecordReference: string; observationType: "bridge_health_signal" | "security_adapter_alert"; observationSummary: string; authorizedScope: string; retentionUntil: Date; observedAt: Date; integrityMetadata: Record<string, unknown>; createdBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable. Configure PostgreSQL before registering authorized security observations.");
  if (input.retentionUntil <= new Date()) throw new Error("A future authorized retention deadline is required.");
  if (input.observedAt > new Date(Date.now() + 5 * 60_000)) throw new Error("Observed time cannot be materially in the future.");
  if (!input.integrationName.trim() || !input.sourceRecordReference.trim()) throw new Error("A named authorized integration and source record reference are required.");
  if (!input.authorizedScope.trim() || Object.keys(input.integrityMetadata).length === 0) throw new Error("Authorized scope and integrity metadata are required.");
  if (input.assetId) { const asset = (await db.select({ id: assets.id }).from(assets).where(eq(assets.id, input.assetId)).limit(1))[0]; if (!asset) throw new Error("The referenced project asset does not exist."); }
  if (input.cameraSourceId) { const camera = (await db.select({ id: cameraSources.id, retentionUntil: cameraSources.retentionUntil }).from(cameraSources).where(eq(cameraSources.id, input.cameraSourceId)).limit(1))[0]; if (!camera) throw new Error("The referenced authorized camera source does not exist."); if (camera.retentionUntil <= new Date()) throw new Error("The referenced camera authorization has expired."); }
  const existing = (await db.select({ id: securityObservations.id, status: securityObservations.status }).from(securityObservations).where(eq(securityObservations.sourceRecordReference, input.sourceRecordReference)).limit(1))[0];
  if (existing) return { securityObservationId: existing.id, status: existing.status, duplicate: true };
  const result = await db.insert(securityObservations).values({ ...input, status: "pending_review" }).returning({ id: securityObservations.id });
  const securityObservationId = insertId(result);
  await db.insert(auditEvents).values({ actorId: input.createdBy, action: "accountability.security_observation_registered", details: { securityObservationId, source: input.source, integrationName: input.integrationName, sourceRecordReference: input.sourceRecordReference, observationType: input.observationType, humanReviewRequired: true, noAutomatedSecurityClaim: true } });
  return { securityObservationId, status: "pending_review" as const, duplicate: false };
}

export async function createAuthorityRecord(input: { legalName: string; authorityType: "municipal" | "state" | "national" | "utility" | "private_operator" | "contractor_internal"; contactChannel?: string; createdBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable. Configure PostgreSQL before adding authority records.");
  const existing = (await db.select({ id: authorities.id }).from(authorities).where(eq(authorities.legalName, input.legalName)).limit(1))[0];
  if (existing) throw new Error("An authority with this legal name already exists.");
  const result = await db.insert(authorities).values(input).returning({ id: authorities.id });
  return { id: insertId(result) };
}

export async function createSlaRuleRecord(input: { authorityId: number; contractReference: string; responseTargetHours: number; closureTargetHours: number; escalationPolicy: Record<string, unknown>; businessCalendar?: Record<string, unknown>; policyVersion: string; effectiveFrom: Date; effectiveUntil?: Date; createdBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const authority = (await db.select({ id: authorities.id }).from(authorities).where(eq(authorities.id, input.authorityId)).limit(1))[0];
  if (!authority) throw new Error("Authority record does not exist.");
  const result = await db.insert(slaRules).values(input).returning({ id: slaRules.id });
  return { id: insertId(result) };
}

export async function createRoutingRuleRecord(input: { authorityId: number; contractorId?: number; slaRuleId?: number; assetType?: "bridge" | "road" | "rail" | "building" | "utility"; zoneReference: string; boundarySourceReference: string; responsibleTeam: string; effectiveFrom: Date; effectiveUntil?: Date; createdBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const authority = (await db.select({ id: authorities.id }).from(authorities).where(eq(authorities.id, input.authorityId)).limit(1))[0];
  if (!authority) throw new Error("Authority record does not exist.");
  if (input.contractorId) {
    const contractor = (await db.select({ id: contractors.id }).from(contractors).where(eq(contractors.id, input.contractorId)).limit(1))[0];
    if (!contractor) throw new Error("Assigned contractor record does not exist.");
  }
  const result = await db.insert(routingRules).values(input).returning({ id: routingRules.id });
  return { id: insertId(result) };
}

async function assertAssignedContractorActor(ticket: { contractorId: number | null; assignedUserId: number | null }, actorId: number) {
  if (!ticket.contractorId || ticket.assignedUserId !== actorId) throw new Error("Only the assigned authenticated contractor user can perform this ticket action.");
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const assignment = (await db.select({ userId: contractorUserAssignments.userId, active: contractorUserAssignments.active }).from(contractorUserAssignments).where(eq(contractorUserAssignments.contractorId, ticket.contractorId))).find(row => row.userId === actorId && row.active === 1);
  if (!assignment) throw new Error("The assigned contractor user does not have an active project assignment.");
}

export async function createContractorTicketRecord(input: { assetId: number; defectId?: number; contractorId?: number; assignedUserId?: number; title: string; scopeNote: string; zoneLabel?: string; latitude?: string; longitude?: string; dueAt?: Date; verificationCriterion: string; evidenceId?: number; evidenceQuality?: number; locationConfidence?: number; approvedImpact?: number; repeatCount?: number; createdBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable. Configure PostgreSQL before creating tickets.");
  const asset = (await db.select().from(assets).where(eq(assets.id, input.assetId)).limit(1))[0];
  if (!asset) throw new Error("Asset record does not exist.");
  if (input.contractorId) {
    const contractor = (await db.select({ id: contractors.id, status: contractors.status }).from(contractors).where(eq(contractors.id, input.contractorId)).limit(1))[0];
    if (!contractor || contractor.status !== "active") throw new Error("An active real contractor record is required for assignment.");
    if (!input.assignedUserId) throw new Error("An authenticated contractor user assignment is required before ticket assignment.");
    const assignment = (await db.select({ userId: contractorUserAssignments.userId, active: contractorUserAssignments.active }).from(contractorUserAssignments).where(eq(contractorUserAssignments.contractorId, input.contractorId))).find(row => row.userId === input.assignedUserId && row.active === 1);
    if (!assignment) throw new Error("The selected user is not an active project user for this contractor.");
  }
  if (input.evidenceId) {
    const evidenceRow = (await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.id, input.evidenceId)).limit(1))[0];
    if (!evidenceRow) throw new Error("Opening evidence record does not exist.");
  }
  const dsi = calculateDsi({ assetCriticality: asset.criticality, evidenceQuality: input.evidenceQuality, locationConfidence: input.locationConfidence, approvedImpact: input.approvedImpact, repeatCount: input.repeatCount, verificationState: "open" });
  const assessmentResult = await db.insert(dsiAssessments).values({ assetId: asset.id, defectId: input.defectId, evidenceId: input.evidenceId, policyVersion: "dsi-v1.0", priority: dsi.priority, advisoryScore: dsi.advisoryScore, factorBreakdown: dsi.factorBreakdown, requiresEngineerReview: 1, createdBy: input.createdBy }).returning({ id: dsiAssessments.id });
  const dsiAssessmentId = insertId(assessmentResult);
  const ticketResult = await db.insert(contractorTickets).values({ assetId: input.assetId, defectId: input.defectId, dsiAssessmentId, contractorId: input.contractorId, assignedUserId: input.assignedUserId, title: input.title, scopeNote: input.scopeNote, zoneLabel: input.zoneLabel, latitude: input.latitude, longitude: input.longitude, priority: dsi.priority, status: input.contractorId ? "assigned" : "open", dueAt: input.dueAt, verificationCriterion: input.verificationCriterion, createdBy: input.createdBy }).returning({ id: contractorTickets.id });
  const ticketId = insertId(ticketResult);
  if (input.evidenceId) await db.insert(contractorTicketEvidence).values({ ticketId, evidenceId: input.evidenceId, role: "opening", createdBy: input.createdBy });
  await db.insert(auditEvents).values({ defectId: input.defectId, actorId: input.createdBy, action: "accountability.ticket_created", details: { ticketId, dsiAssessmentId, priority: dsi.priority, advisoryScore: dsi.advisoryScore, contractorAssigned: Boolean(input.contractorId), assignedUserId: input.assignedUserId ?? null } });
  return { ticketId, dsiAssessmentId, priority: dsi.priority, advisoryScore: dsi.advisoryScore, factorBreakdown: dsi.factorBreakdown };
}

export async function acceptContractorTicketRecord(input: { ticketId: number; actorId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const ticket = (await db.select().from(contractorTickets).where(eq(contractorTickets.id, input.ticketId)).limit(1))[0];
  if (!ticket) throw new Error("Ticket does not exist.");
  if (ticket.status !== "assigned") throw new Error("Only assigned tickets can be accepted.");
  await assertAssignedContractorActor(ticket, input.actorId);
  await db.update(contractorTickets).set({ acceptedAt: new Date(), updatedAt: new Date() }).where(eq(contractorTickets.id, input.ticketId));
  await db.insert(auditEvents).values({ actorId: input.actorId, action: "accountability.ticket_accepted", details: { ticketId: input.ticketId } });
  return { success: true, status: "assigned" as const };
}

export async function startContractorTicketRecord(input: { ticketId: number; actorId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const ticket = (await db.select().from(contractorTickets).where(eq(contractorTickets.id, input.ticketId)).limit(1))[0];
  if (!ticket) throw new Error("Ticket does not exist.");
  if (ticket.status !== "assigned") throw new Error("Only assigned tickets can move to in progress.");
  await assertAssignedContractorActor(ticket, input.actorId);
  await db.update(contractorTickets).set({ status: "in_progress", inProgressAt: new Date(), updatedAt: new Date() }).where(eq(contractorTickets.id, input.ticketId));
  await db.insert(auditEvents).values({ actorId: input.actorId, action: "accountability.ticket_in_progress", details: { ticketId: input.ticketId } });
  return { success: true, status: "in_progress" as const };
}

export async function addContractorTicketNoteRecord(input: { ticketId: number; note: string; actorId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const ticket = (await db.select().from(contractorTickets).where(eq(contractorTickets.id, input.ticketId)).limit(1))[0];
  if (!ticket) throw new Error("Ticket does not exist.");
  await assertAssignedContractorActor(ticket, input.actorId);
  const result = await db.insert(contractorTicketNotes).values({ ticketId: input.ticketId, authorId: input.actorId, note: input.note }).returning({ id: contractorTicketNotes.id });
  const noteId = insertId(result);
  await db.insert(auditEvents).values({ actorId: input.actorId, action: "accountability.ticket_note_added", details: { ticketId: input.ticketId, noteId } });
  return { noteId };
}

export async function closeContractorTicketRecord(input: { ticketId: number; contractorClosureNote: string; closureEvidenceIds: number[]; actorId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const ticket = (await db.select().from(contractorTickets).where(eq(contractorTickets.id, input.ticketId)).limit(1))[0];
  if (!ticket) throw new Error("Ticket does not exist.");
  if (ticket.status !== "in_progress") throw new Error("A contractor must mark the assigned ticket in progress before requesting closure.");
  await assertAssignedContractorActor(ticket, input.actorId);
  if (!input.closureEvidenceIds.length) throw new Error("At least one original closure-proof reference is required.");
  const closureEvidence = await db.select({ id: evidence.id }).from(evidence).where(inArray(evidence.id, input.closureEvidenceIds));
  if (closureEvidence.length !== input.closureEvidenceIds.length) throw new Error("One or more closure evidence records do not exist.");
  await db.update(contractorTickets).set({ status: "contractor_closed", contractorClosureNote: input.contractorClosureNote, contractorClosedAt: new Date(), updatedAt: new Date() }).where(eq(contractorTickets.id, input.ticketId));
  await db.insert(contractorTicketEvidence).values(input.closureEvidenceIds.map(evidenceId => ({ ticketId: input.ticketId, evidenceId, role: "closure_proof" as const, createdBy: input.actorId })));
  await db.insert(auditEvents).values({ actorId: input.actorId, action: "accountability.contractor_closed", details: { ticketId: input.ticketId, closureEvidenceIds: input.closureEvidenceIds } });
  return { success: true, status: "contractor_closed" as const };
}

export async function verifyContractorTicketRecord(input: { ticketId: number; decision: "fixed" | "needs_rework" | "cannot_verify"; verificationNote: string; followUpEvidenceIds: number[]; engineerId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const ticket = (await db.select().from(contractorTickets).where(eq(contractorTickets.id, input.ticketId)).limit(1))[0];
  if (!ticket) throw new Error("Ticket does not exist.");
  if (ticket.status !== "contractor_closed" && ticket.status !== "verification_pending") throw new Error("A contractor closure claim must exist before engineer verification.");
  if (input.decision !== "cannot_verify" && !input.followUpEvidenceIds.length) throw new Error("Follow-up evidence is required to verify a fix or request rework.");
  if (input.followUpEvidenceIds.length) {
    const rows = await db.select({ id: evidence.id }).from(evidence).where(inArray(evidence.id, input.followUpEvidenceIds));
    if (rows.length !== input.followUpEvidenceIds.length) throw new Error("One or more follow-up evidence records do not exist.");
    await db.insert(contractorTicketEvidence).values(input.followUpEvidenceIds.map(evidenceId => ({ ticketId: input.ticketId, evidenceId, role: "follow_up" as const, createdBy: input.engineerId })));
  }
  await db.update(contractorTickets).set({ status: input.decision, verificationNote: input.verificationNote, verifiedBy: input.engineerId, verifiedAt: new Date(), updatedAt: new Date() }).where(eq(contractorTickets.id, input.ticketId));
  await db.insert(auditEvents).values({ actorId: input.engineerId, action: `accountability.ticket_${input.decision}`, details: { ticketId: input.ticketId, followUpEvidenceIds: input.followUpEvidenceIds } });
  return { success: true, status: input.decision };
}

export async function prepareUavFollowUpRecommendationRecord(input: { ticketId: number; cctvCandidateId?: number; triggerReason: string; expiresAt: Date; preparedBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable. Configure PostgreSQL before preparing a UAV follow-up recommendation.");
  const ticket = (await db.select().from(contractorTickets).where(eq(contractorTickets.id, input.ticketId)).limit(1))[0];
  if (!ticket) throw new Error("Ticket does not exist.");
  if (ticket.status !== "contractor_closed") throw new Error("A real contractor closure claim is required before preparing UAV follow-up.");
  const closureProof = await db.select({ id: contractorTicketEvidence.id }).from(contractorTicketEvidence).where(eq(contractorTicketEvidence.ticketId, input.ticketId));
  if (!closureProof.length) throw new Error("Original contractor closure-proof references are required before UAV follow-up preparation.");
  if (input.cctvCandidateId) {
    const candidate = (await db.select({ id: cctvCandidates.id, assetId: cctvCandidates.assetId, status: cctvCandidates.status }).from(cctvCandidates).where(eq(cctvCandidates.id, input.cctvCandidateId)).limit(1))[0];
    if (!candidate || candidate.status !== "uav_preflight_recommended" || (candidate.assetId && candidate.assetId !== ticket.assetId)) throw new Error("Only an engineer-reviewed CCTV candidate for the same asset can be linked to UAV follow-up.");
  }
  if (input.expiresAt <= new Date()) throw new Error("UAV follow-up expiry must be in the future.");
  const requiredChecks = { preparedOnly: true, noAircraftCommand: true, operatorIdentityRequired: true, assetOwnerAuthorizationRequired: true, airspaceAndJurisdictionCheckRequired: true, weatherAndPreflightCheckRequired: true, originalFollowUpMediaRequired: true };
  const result = await db.insert(uavFollowUpRecommendations).values({ ticketId: ticket.id, cctvCandidateId: input.cctvCandidateId, assetId: ticket.assetId, zoneLabel: ticket.zoneLabel, latitude: ticket.latitude, longitude: ticket.longitude, triggerReason: input.triggerReason, requiredChecks, status: "prepared", expiresAt: input.expiresAt, preparedBy: input.preparedBy }).returning({ id: uavFollowUpRecommendations.id });
  const recommendationId = insertId(result);
  await db.insert(auditEvents).values({ actorId: input.preparedBy, action: "accountability.uav_follow_up_prepared", details: { recommendationId, ticketId: ticket.id, cctvCandidateId: input.cctvCandidateId ?? null, preparedOnly: true, noFlightCommandIssued: true } });
  return { recommendationId, status: "prepared" as const, requiredChecks };
}

export async function resolveTicketRoutingRecord(input: { ticketId: number; reviewerId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const ticket = (await db.select().from(contractorTickets).where(eq(contractorTickets.id, input.ticketId)).limit(1))[0];
  if (!ticket) throw new Error("Ticket does not exist.");
  const asset = (await db.select().from(assets).where(eq(assets.id, ticket.assetId)).limit(1))[0];
  if (!asset) throw new Error("Ticket asset does not exist.");
  const now = new Date();
  const rules = (await db.select().from(routingRules).orderBy(desc(routingRules.createdAt))).filter(rule => rule.effectiveFrom <= now && (!rule.effectiveUntil || rule.effectiveUntil >= now) && (!rule.assetType || rule.assetType === asset.assetType) && (!ticket.zoneLabel || rule.zoneReference === ticket.zoneLabel));
  const matched = rules.length === 1 ? rules[0] : undefined;
  const status = matched ? "proposed" as const : "unresolved" as const;
  const rationale = matched ? "Exactly one active project routing rule matched the ticket asset type and approved zone reference. Engineer approval remains required." : rules.length > 1 ? "Multiple active project routing rules matched. Select an authoritative route before handoff." : "No active project routing rule matched. Add or review ownership, zone, contract, and SLA data.";
  const result = await db.insert(routingDecisions).values({ ticketId: input.ticketId, routingRuleId: matched?.id, status, sourceReferences: { assetId: asset.id, assetType: asset.assetType, ticketZone: ticket.zoneLabel ?? null, matchedRuleIds: rules.map(rule => rule.id) }, rationale, reviewedBy: input.reviewerId, reviewedAt: new Date() }).returning({ id: routingDecisions.id });
  return { routingDecisionId: insertId(result), status, rationale, matchedRuleId: matched?.id ?? null };
}

export async function approveRoutingDecisionRecord(input: { routingDecisionId: number; reviewerId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const decision = (await db.select().from(routingDecisions).where(eq(routingDecisions.id, input.routingDecisionId)).limit(1))[0];
  if (!decision || decision.status !== "proposed" || !decision.routingRuleId) throw new Error("Only a proposed route with an approved project rule can be approved.");
  await db.update(routingDecisions).set({ status: "approved", reviewedBy: input.reviewerId, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(routingDecisions.id, input.routingDecisionId));
  return { success: true, status: "approved" as const };
}

export async function prepareHandoffPackageRecord(input: { ticketId: number; routingDecisionId: number; recipientSystem?: string; expiresAt?: Date; preparedBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const ticket = (await db.select().from(contractorTickets).where(eq(contractorTickets.id, input.ticketId)).limit(1))[0];
  const decision = (await db.select().from(routingDecisions).where(eq(routingDecisions.id, input.routingDecisionId)).limit(1))[0];
  if (!ticket || !decision || decision.ticketId !== ticket.id || decision.status !== "approved" || !decision.routingRuleId) throw new Error("An approved routing decision for this ticket is required before preparing a handoff.");
  const rule = (await db.select().from(routingRules).where(eq(routingRules.id, decision.routingRuleId)).limit(1))[0];
  if (!rule) throw new Error("Approved routing rule no longer exists.");
  const payload = { ticketId: ticket.id, title: ticket.title, scopeNote: ticket.scopeNote, priority: ticket.priority, status: ticket.status, verificationCriterion: ticket.verificationCriterion, assetId: ticket.assetId, zoneLabel: ticket.zoneLabel ?? null, routingDecisionId: decision.id, evidence: "Access through authorized DRIFT evidence view only", exportState: "prepared-not-delivered" };
  const result = await db.insert(handoffPackages).values({ ticketId: ticket.id, recipientAuthorityId: rule.authorityId, recipientSystem: input.recipientSystem, status: "prepared", expiresAt: input.expiresAt, payload, accessScope: { purpose: "authorized-maintenance-review", rawCctvExcluded: true, requiresRecipientAuthorization: true }, preparedBy: input.preparedBy }).returning({ id: handoffPackages.id });
  return { handoffPackageId: insertId(result), status: "prepared" as const, payload };
}

export async function publishPublicStatusRecord(input: { ticketId: number; publicSummary: string; expectedCompletionAt?: Date; privacyReviewNote: string; approvedBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const ticket = (await db.select({ id: contractorTickets.id }).from(contractorTickets).where(eq(contractorTickets.id, input.ticketId)).limit(1))[0];
  if (!ticket) throw new Error("Ticket does not exist.");
  const result = await db.insert(publicStatusPublications).values({ ticketId: input.ticketId, publicSummary: input.publicSummary, expectedCompletionAt: input.expectedCompletionAt, privacyReviewNote: input.privacyReviewNote, approvedBy: input.approvedBy, approvedAt: new Date(), publishedAt: new Date(), status: "published" }).returning({ id: publicStatusPublications.id });
  return { id: insertId(result), status: "published" as const };
}

export async function listPublishedPublicStatuses() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: publicStatusPublications.id, ticketId: publicStatusPublications.ticketId, publicSummary: publicStatusPublications.publicSummary, expectedCompletionAt: publicStatusPublications.expectedCompletionAt, publishedAt: publicStatusPublications.publishedAt }).from(publicStatusPublications).where(eq(publicStatusPublications.status, "published")).orderBy(desc(publicStatusPublications.publishedAt)).limit(100);
}
