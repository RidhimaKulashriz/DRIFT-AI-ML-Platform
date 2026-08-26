import { desc, eq, getTableColumns, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { alerts, assets, auditEvents, defects, evidence, inspectionCorrelations, InsertUser, missions, repairEstimates, reports, reviews, severityHistory, telemetry, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { resolveReviewState } from "./services/reviewState";
import { summarizeSeverity, toMapMarker } from "./services/reportPresentation";
import { storageGetSignedUrl, storagePutWithFallback } from "./storage";
import { renderInspectionPdf } from "./services/reportPdf";
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
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "engineer");
  updateSet.role = values.role;
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
    ? { available: true, configured: true, driver: "postgresql", message: "Persistent mission, evidence, and report storage is ready." }
    : { available: false, configured: Boolean(postgresDatabaseUrl()), driver: "postgresql", message: "Persistent missions, original evidence, and PDF reports require a compatible PostgreSQL DATABASE_URL." };
  if (!db) return { assets: [], missions: [], defects: [], telemetry: [], reports: [], estimates: [], reviews: [], audit: [], alerts: [], persistence };
  const [assetRows, missionRows, defectRows, telemetryRows, reportRows, estimateRows, reviewRows, auditRows, alertRows] = await Promise.all([
    db.select().from(assets).orderBy(desc(assets.updatedAt)).limit(40),
    db.select().from(missions).orderBy(desc(missions.createdAt)).limit(30),
    db.select().from(defects).orderBy(desc(defects.zeroErrorScore)).limit(120),
    db.select().from(telemetry).orderBy(desc(telemetry.capturedAt)).limit(240),
    db.select(reportListColumns).from(reports).orderBy(desc(reports.createdAt)).limit(30),
    db.select().from(repairEstimates).orderBy(desc(repairEstimates.createdAt)).limit(120),
    db.select().from(reviews).orderBy(desc(reviews.createdAt)).limit(120),
    db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(120),
    db.select().from(alerts).orderBy(desc(alerts.createdAt)).limit(120),
  ]);
  return { assets: assetRows, missions: missionRows, defects: defectRows, telemetry: telemetryRows, reports: reportRows, estimates: estimateRows, reviews: reviewRows, audit: auditRows, alerts: alertRows, persistence };
}

export async function createDemoMissionRecord(input: { name: string; createdBy?: number | null; simulator: Awaited<ReturnType<typeof import("./services/simulator").buildSimulatorMission>> }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable. Configure DATABASE_URL before creating persistent missions.");
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
export async function listReportRecords() { const db = await getDb(); return db ? db.select(reportListColumns).from(reports).orderBy(desc(reports.createdAt)).limit(100) : []; }
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
