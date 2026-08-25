import crypto from "node:crypto";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { acknowledgeAlert, addReview, addTelemetryRecord, createAssetRecord, createDemoMissionRecord, createEvidenceRecord, deleteAssetRecord, generateMissionReport, getMapData, getMissionOverview, listAlerts, listAssets, listAuditEvents, listCorrelatedDefects, listDemoEvidence, listFilteredDefects, listMissionEvidence, listReportRecords, persistInferenceDefect, updateAssetRecord } from "./db";
import { requireDriftRole } from "./services/authorization";
import { generateDecisionNarrative } from "./services/aiDecision";
import { probeHardwareConnection, validateTelemetryPayload } from "./services/hardwareAdapter";
import { runVisionInference } from "./services/mlInference";
import { buildSimulatorMission } from "./services/simulator";
import { askDriftAi } from "./services/driftAi";
import { storagePut } from "./storage";
import { CAPTURE_ZONES, INSPECTION_DOMAINS, QUALITY_STATUSES } from "@shared/types";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  drift: router({
    overview: publicProcedure.query(() => getMissionOverview()),
    correlatedDefects: publicProcedure.input(z.object({ correlationKey: z.string().min(3).max(160) })).query(({ input }) => listCorrelatedDefects(input.correlationKey)),
    hardwareStatus: publicProcedure.query(() => probeHardwareConnection()),
    validateTelemetry: protectedProcedure.input(z.unknown()).mutation(({ input }) => validateTelemetryPayload(input)),
    ingestTelemetry: protectedProcedure.input(z.object({ missionId: z.number().int().positive(), latitude: z.number(), longitude: z.number(), altitude: z.number().nonnegative(), speedMps: z.number().nonnegative(), batteryPercent: z.number().min(0).max(100), timestamp: z.number().int().positive() })).mutation(async ({ input }) => {
      const validation = validateTelemetryPayload(input);
      if (!validation.valid) throw new Error(validation.message);
      return addTelemetryRecord(input);
    }),
    runSimulator: publicProcedure.input(z.object({ name: z.string().min(3).max(180).default("Demo corridor patrol") })).mutation(async ({ ctx, input }) => {
      const simulator = await buildSimulatorMission(input.name);
      const record = await createDemoMissionRecord({ name: input.name, createdBy: ctx.user?.id ?? null, simulator });
      return { ...record, findings: simulator.findings, telemetry: simulator.telemetry };
    }),
    inferEvidence: protectedProcedure.input(z.object({ fileName: z.string().min(1), latitude: z.number(), longitude: z.number(), assetCriticality: z.number().int().min(1).max(5), priorOpenDefects: z.number().int().min(0).max(20), inspectionDomain: z.enum(INSPECTION_DOMAINS).optional(), captureZone: z.enum(CAPTURE_ZONES).optional(), demo: z.boolean().default(false) })).mutation(({ input }) => runVisionInference(input)),
    decisionSupport: protectedProcedure.input(z.object({ defectType: z.string(), location: z.string(), missionName: z.string(), score: z.object({ score: z.number(), severity: z.enum(["low", "medium", "high", "critical"]), urgency: z.string(), explanation: z.array(z.string()), repairEstimateCents: z.number() }) })).mutation(({ input }) => generateDecisionNarrative(input)),
    ai: router({
      ask: protectedProcedure.input(z.object({ question: z.string().trim().min(2).max(2000), context: z.object({ missionName: z.string().nullable().optional(), missionStatus: z.string().nullable().optional(), telemetryPoints: z.number().int().nonnegative().optional(), latestBatteryPercent: z.number().nullable().optional(), evidenceCount: z.number().int().nonnegative().optional(), selectedFinding: z.object({ id: z.number(), label: z.string(), defectType: z.string(), inspectionDomain: z.string().nullable().optional(), severity: z.string(), status: z.string().nullable().optional(), reviewState: z.string().nullable().optional(), zeroErrorScore: z.number().nullable().optional(), confidencePercent: z.number().nullable().optional(), coveragePercent: z.number().nullable().optional(), latitude: z.union([z.string(), z.number()]).nullable().optional(), longitude: z.union([z.string(), z.number()]).nullable().optional(), assetId: z.number().nullable().optional(), missionId: z.number().nullable().optional(), evidenceId: z.number().nullable().optional(), qualityGate: z.string().nullable().optional(), captureZone: z.string().nullable().optional(), repairEstimateCents: z.number().nullable().optional(), urgency: z.string().nullable().optional(), explanation: z.array(z.string()).nullable().optional(), annotationNote: z.string().nullable().optional() }).nullable().optional(), findings: z.array(z.object({ id: z.number(), label: z.string(), defectType: z.string(), inspectionDomain: z.string().nullable().optional(), severity: z.string(), status: z.string().nullable().optional(), reviewState: z.string().nullable().optional(), zeroErrorScore: z.number().nullable().optional(), confidencePercent: z.number().nullable().optional(), coveragePercent: z.number().nullable().optional(), latitude: z.union([z.string(), z.number()]).nullable().optional(), longitude: z.union([z.string(), z.number()]).nullable().optional(), assetId: z.number().nullable().optional(), missionId: z.number().nullable().optional(), evidenceId: z.number().nullable().optional(), qualityGate: z.string().nullable().optional(), captureZone: z.string().nullable().optional(), repairEstimateCents: z.number().nullable().optional(), urgency: z.string().nullable().optional(), explanation: z.array(z.string()).nullable().optional(), annotationNote: z.string().nullable().optional() })).max(50).optional(), history: z.array(z.object({ name: z.string(), status: z.string(), findingsCount: z.number().int().nonnegative() })).max(20).optional() }) })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer", "user"]); return askDriftAi(input.question, input.context); }),
    }),
    evidence: router({
      list: protectedProcedure.input(z.object({ missionId: z.number().int().positive() })).query(({ input }) => listMissionEvidence(input.missionId)),
      demoList: publicProcedure.input(z.object({ missionId: z.number().int().positive() })).query(({ input }) => listDemoEvidence(input.missionId)),
      upload: protectedProcedure.input(z.object({ missionId: z.number().int().positive(), fileName: z.string().min(1).max(255), mimeType: z.string().min(3).max(120), base64: z.string().min(8), mediaKind: z.enum(["photo", "video", "annotation", "report"]), latitude: z.string().optional(), longitude: z.string().optional(), playbackSeconds: z.number().int().nonnegative().optional(), assetId: z.number().int().positive().optional(), assetCriticality: z.number().int().min(1).max(5).optional(), priorOpenDefects: z.number().int().min(0).max(100).optional(), runInference: z.boolean().default(true), capturedAt: z.number().int().positive().optional(), cameraId: z.string().max(120).optional(), captureZone: z.enum(CAPTURE_ZONES).optional(), headingDegrees: z.number().int().min(0).max(359).optional(), qualityStatus: z.enum(QUALITY_STATUSES).optional(), imageQuality: z.record(z.string(), z.unknown()).optional(), inspectionDomain: z.enum(INSPECTION_DOMAINS).optional(), correlationKey: z.string().max(160).optional() })).mutation(async ({ ctx, input }) => {
        const bytes = Buffer.from(input.base64.split(",").pop() ?? "", "base64");
        if (bytes.byteLength === 0 || bytes.byteLength > 50 * 1024 * 1024) throw new Error("Evidence upload must be between 1 byte and 50 MB.");
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const stored = await storagePut(`drift/${ctx.user.id}/missions/${input.missionId}/${Date.now()}-${safeName}`, bytes, input.mimeType);
        const evidenceRecord = await createEvidenceRecord({ missionId: input.missionId, uploadedBy: ctx.user.id, fileName: input.fileName, mimeType: input.mimeType, storageKey: stored.key, storageUrl: stored.url, mediaKind: input.mediaKind, latitude: input.latitude, longitude: input.longitude, playbackSeconds: input.playbackSeconds, source: "upload", sha256: crypto.createHash("sha256").update(bytes).digest("hex"), capturedAt: input.capturedAt ? new Date(input.capturedAt) : undefined, cameraId: input.cameraId, captureZone: input.captureZone, headingDegrees: input.headingDegrees, qualityStatus: input.qualityStatus, imageQuality: input.imageQuality, provenance: { inspectionDomain: input.inspectionDomain, correlationKey: input.correlationKey } });
        const qualityGate = input.qualityStatus === "fail" ? { status: "fail", action: "blocked-from-inference" } : input.qualityStatus === "review" ? { status: "review", action: "engineer-review-required" } : { status: input.qualityStatus ?? "pending", action: "review-policy-applies" };
        if (input.qualityStatus === "fail" || input.mediaKind !== "photo" || !input.runInference || !input.assetId || !input.assetCriticality || !input.latitude || !input.longitude) return { ...evidenceRecord, inference: null, qualityGate };
        const inference = await runVisionInference({ fileName: input.fileName, imageBase64: input.base64, latitude: Number(input.latitude), longitude: Number(input.longitude), assetCriticality: input.assetCriticality, priorOpenDefects: input.priorOpenDefects ?? 0 });
        const persisted = await persistInferenceDefect({ missionId: input.missionId, assetId: input.assetId, evidenceId: evidenceRecord.id, latitude: Number(input.latitude), longitude: Number(input.longitude), inference, inspectionDomain: input.inspectionDomain, correlationKey: input.correlationKey, createdBy: ctx.user.id });
        return { ...evidenceRecord, inference: persisted };
      }),
    }),
    assets: router({
      list: publicProcedure.query(() => listAssets()),
      create: protectedProcedure.input(z.object({ name: z.string().min(3).max(160), assetType: z.enum(["bridge", "road", "rail", "building", "utility"]), locality: z.string().min(3).max(160), latitude: z.string().min(3), longitude: z.string().min(3), criticality: z.number().int().min(1).max(5) })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin"]); return createAssetRecord(input); }),
      update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(3).max(160).optional(), assetType: z.enum(["bridge", "road", "rail", "building", "utility"]).optional(), locality: z.string().min(3).max(160).optional(), latitude: z.string().min(3).optional(), longitude: z.string().min(3).optional(), criticality: z.number().int().min(1).max(5).optional(), status: z.enum(["operational", "watch", "restricted", "closed"]).optional() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin"]); const { id, ...changes } = input; return updateAssetRecord(id, changes); }),
      delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin"]); return deleteAssetRecord(input.id); }),
    }),
    filters: router({
      defects: publicProcedure.input(z.object({ assetId: z.number().int().positive().optional(), missionId: z.number().int().positive().optional(), defectType: z.enum(["pothole", "crack", "structural", "corrosion", "spalling", "exposed_rebar", "water_intrusion", "settlement", "rail_alignment", "obstruction", "lighting_failure"]).optional(), inspectionDomain: z.enum(INSPECTION_DOMAINS).optional(), severity: z.enum(["low", "medium", "high", "critical"]).optional(), status: z.enum(["detected", "under_review", "verified", "scheduled", "resolved", "dismissed"]).optional(), reviewState: z.enum(["pending", "approved", "overridden", "rejected"]).optional() })).query(({ input }) => listFilteredDefects(input)),
      mapData: publicProcedure.input(z.object({ assetId: z.number().int().positive().optional(), missionId: z.number().int().positive().optional(), defectType: z.enum(["pothole", "crack", "structural", "corrosion", "spalling", "exposed_rebar", "water_intrusion", "settlement", "rail_alignment", "obstruction", "lighting_failure"]).optional(), inspectionDomain: z.enum(INSPECTION_DOMAINS).optional(), severity: z.enum(["low", "medium", "high", "critical"]).optional(), status: z.enum(["detected", "under_review", "verified", "scheduled", "resolved", "dismissed"]).optional(), reviewState: z.enum(["pending", "approved", "overridden", "rejected"]).optional() })).query(({ input }) => getMapData(input)),
    }),
    alerts: router({
      list: publicProcedure.query(() => listAlerts()),
      acknowledge: protectedProcedure.input(z.object({ alertId: z.number().int().positive() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer", "user"]); return acknowledgeAlert(input.alertId, ctx.user.id); }),
    }),
    reports: router({
      list: publicProcedure.query(() => listReportRecords()),
      generate: protectedProcedure.input(z.object({ missionId: z.number().int().positive() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer", "user"]); return generateMissionReport({ missionId: input.missionId, generatedBy: ctx.user.id }); }),
    }),
    workspace: protectedProcedure.query(({ ctx }) => { const role = ctx.user.role; return { role, permissions: role === "admin" ? ["asset:create", "asset:update", "asset:delete", "review", "audit", "alert:acknowledge"] : role === "engineer" || role === "user" ? ["review", "audit", "alert:acknowledge"] : ["public:read"] }; }),
    audit: router({ list: protectedProcedure.input(z.object({ missionId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer", "user"]); return listAuditEvents(input?.missionId); }) }),
    review: protectedProcedure.input(z.object({ defectId: z.number().int().positive(), decision: z.enum(["approve", "override", "reject", "needs_site_visit"]), priorityOverride: z.enum(["low", "medium", "high", "critical"]).optional(), note: z.string().min(4).max(2000) })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer", "user"]); return addReview({ ...input, reviewerId: ctx.user.id }); }),
  }),
});

export type AppRouter = typeof appRouter;
