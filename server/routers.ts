import crypto from "node:crypto";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { acknowledgeAlert, acceptContractorTicketRecord, addContractorTicketNoteRecord, addReview, addTelemetryRecord, approveKnowledgeDocumentRecord, approveRoutingDecisionRecord, assignContractorUserRecord, closeContractorTicketRecord, createAssetRecord, createAuthorityRecord, createCameraSourceRecord, createContractorRecord, createContractorTicketRecord, createCctvCandidateRecord, createDemoMissionRecord, createEvidenceRecord, createHardwareCaptureMission, createKnowledgeDocumentRecord, createRoutingRuleRecord, createSlaRuleRecord, deleteAssetRecord, generateMissionReport, getAccountabilityOverview, getMapData, getMissionOverview, getPublicAccountabilityOverview, getPublicMissionOverview, getReadOnlySchemaReadiness, listAlerts, listAssets, listAssignedContractorTickets, listAuditEvents, listCorrelatedDefects, listDemoEvidence, listFilteredDefects, listKnowledgeRetrievalRuns, listMissionEvidence, listPublishedPublicStatuses, listReportRecords, persistInferenceDefect, prepareHandoffPackageRecord, prepareUavFollowUpRecommendationRecord, publishPublicStatusRecord, registerAuthorizedSecurityObservationRecord, resolveTicketRoutingRecord, retrieveApprovedKnowledge, reviewCctvCandidateRecord, startContractorTicketRecord, updateAssetRecord, verifyContractorTicketRecord } from "./db";
import { canReview, requireDriftRole } from "./services/authorization";
import { generateDecisionNarrative } from "./services/aiDecision";
import { probeHardwareConnection, validateTelemetryPayload } from "./services/hardwareAdapter";
import { runVisionInference } from "./services/mlInference";
import { buildSimulatorMission } from "./services/simulator";
import { renderInspectionPdf } from "./services/reportPdf";
import { askDriftAi } from "./services/driftAi";
import { storagePut } from "./storage";
import { browserStorageUrl, supabasePortableStorageConfigured } from "./services/supabaseStorage";
import { deliverContractorReport } from "./services/contractorDelivery";
import { featureRouter } from "./featureRouter";
import { runDemoDetection } from "./demoDetection";
import { CAPTURE_ZONES, INSPECTION_DOMAINS, QUALITY_STATUSES } from "@shared/types";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  features: featureRouter,
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
    overview: publicProcedure.query(({ ctx }) => canReview(ctx.user) ? getMissionOverview() : getPublicMissionOverview()),
    schemaReadiness: publicProcedure.query(() => getReadOnlySchemaReadiness()),
    correlatedDefects: protectedProcedure.input(z.object({ correlationKey: z.string().min(3).max(160) })).query(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer", "user"]); return listCorrelatedDefects(input.correlationKey); }),
    hardwareStatus: publicProcedure.query(() => probeHardwareConnection()),
    validateTelemetry: protectedProcedure.input(z.unknown()).mutation(({ input }) => validateTelemetryPayload(input)),
    ingestTelemetry: protectedProcedure.input(z.object({ missionId: z.number().int().positive(), latitude: z.number(), longitude: z.number(), altitude: z.number().nonnegative(), speedMps: z.number().nonnegative(), batteryPercent: z.number().min(0).max(100), timestamp: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      requireDriftRole(ctx.user, ["admin", "engineer"]);
      const validation = validateTelemetryPayload(input);
      if (!validation.valid) throw new Error(validation.message);
      return addTelemetryRecord(input);
    }),
    runSimulator: protectedProcedure.input(z.object({ name: z.string().min(3).max(180).default("Demo corridor patrol") })).mutation(async ({ ctx, input }) => {
      requireDriftRole(ctx.user, ["admin", "engineer"]);
      const simulator = await buildSimulatorMission(input.name);
      const record = await createDemoMissionRecord({ name: input.name, createdBy: ctx.user.id, simulator });
      return { ...record, findings: simulator.findings, telemetry: simulator.telemetry };
    }),
    runStatelessSimulator: publicProcedure.input(z.object({ name: z.string().min(3).max(180).default("Demo corridor patrol") })).mutation(async ({ input }) => {
      const simulator = await buildSimulatorMission(input.name);
      return { mode: "stateless_demo" as const, transient: true, storage: "none" as const, message: "Transient simulated walkthrough only. No mission, finding, telemetry, evidence, ticket, report, CCTV candidate, security observation, or UAV action was stored or created.", ...simulator };
    }),
    demoDetect: publicProcedure.input(z.object({
      defectType: z.string().min(1).max(120),
      confidence: z.number().min(0).max(1),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      infrastructureType: z.string().default("roads"),
      imageUrl: z.string().optional(),
      sensorContribution: z.number().default(0),
    })).mutation(async ({ input }) => {
      return runDemoDetection(input);
    }),
    runDemoScan: publicProcedure.input(z.object({ name: z.string().default("Campus inspection scan") })).mutation(async ({ input }) => {
      const simulator = await buildSimulatorMission(input.name);
      const results = [];
      for (const finding of simulator.findings) {
        try {
          const result = await runDemoDetection({
            defectType: finding.label,
            confidence: finding.confidence,
            latitude: finding.latitude,
            longitude: finding.longitude,
            infrastructureType: (finding as typeof finding & { infrastructureType?: string }).infrastructureType ?? "roads",
          });
          results.push(result);
        } catch (error) {
          console.error("[DRIFT] Demo detection failed for", finding.label, error);
        }
      }
      return {
        mode: "demo_scan" as const,
        message: `${results.length} detections persisted to database.`,
        findings: simulator.findings,
        telemetry: simulator.telemetry,
        detections: results,
      };
    }),
    createHardwareCaptureMission: protectedProcedure.input(z.object({ name: z.string().trim().min(3).max(180), aircraftProfile: z.string().trim().min(2).max(120), adapter: z.enum(["mavlink-bridge", "http-webhook", "rtsp-media"]), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), operatorNote: z.string().trim().max(500).optional() })).mutation(({ ctx, input }) => {
      requireDriftRole(ctx.user, ["admin", "engineer"]);
      return createHardwareCaptureMission({ ...input, createdBy: ctx.user.id });
    }),
    inferEvidence: protectedProcedure.input(z.object({ fileName: z.string().min(1), latitude: z.number(), longitude: z.number(), assetCriticality: z.number().int().min(1).max(5), priorOpenDefects: z.number().int().min(0).max(20), inspectionDomain: z.enum(INSPECTION_DOMAINS).optional(), captureZone: z.enum(CAPTURE_ZONES).optional(), demo: z.boolean().default(false) })).mutation(({ input }) => runVisionInference(input)),
    decisionSupport: publicProcedure.input(z.object({ defectType: z.string(), location: z.string(), missionName: z.string(), score: z.object({ score: z.number(), severity: z.enum(["low", "medium", "high", "critical"]), urgency: z.string(), explanation: z.array(z.string()), repairEstimateCents: z.number() }) })).mutation(({ input }) => generateDecisionNarrative(input)),
    ai: router({
      ask: publicProcedure.input(z.object({ question: z.string().trim().min(2).max(2000), context: z.object({ missionName: z.string().nullable().optional(), missionStatus: z.string().nullable().optional(), telemetryPoints: z.number().int().nonnegative().optional(), latestBatteryPercent: z.number().nullable().optional(), evidenceCount: z.number().int().nonnegative().optional(), selectedFinding: z.object({ id: z.number(), label: z.string(), defectType: z.string(), inspectionDomain: z.string().nullable().optional(), severity: z.string(), status: z.string().nullable().optional(), reviewState: z.string().nullable().optional(), zeroErrorScore: z.number().nullable().optional(), confidencePercent: z.number().nullable().optional(), coveragePercent: z.number().nullable().optional(), latitude: z.union([z.string(), z.number()]).nullable().optional(), longitude: z.union([z.string(), z.number()]).nullable().optional(), assetId: z.number().nullable().optional(), missionId: z.number().nullable().optional(), evidenceId: z.number().nullable().optional(), qualityGate: z.string().nullable().optional(), captureZone: z.string().nullable().optional(), repairEstimateCents: z.number().nullable().optional(), urgency: z.string().nullable().optional(), explanation: z.array(z.string()).nullable().optional(), annotationNote: z.string().nullable().optional() }).nullable().optional(), findings: z.array(z.object({ id: z.number(), label: z.string(), defectType: z.string(), inspectionDomain: z.string().nullable().optional(), severity: z.string(), status: z.string().nullable().optional(), reviewState: z.string().nullable().optional(), zeroErrorScore: z.number().nullable().optional(), confidencePercent: z.number().nullable().optional(), coveragePercent: z.number().nullable().optional(), latitude: z.union([z.string(), z.number()]).nullable().optional(), longitude: z.union([z.string(), z.number()]).nullable().optional(), assetId: z.number().nullable().optional(), missionId: z.number().nullable().optional(), evidenceId: z.number().nullable().optional(), qualityGate: z.string().nullable().optional(), captureZone: z.string().nullable().optional(), repairEstimateCents: z.number().nullable().optional(), urgency: z.string().nullable().optional(), explanation: z.array(z.string()).nullable().optional(), annotationNote: z.string().nullable().optional() })).max(50).optional(), history: z.array(z.object({ name: z.string(), status: z.string(), findingsCount: z.number().int().nonnegative() })).max(20).optional() }), conversation: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) })).max(8).optional() })).mutation(({ input }) => askDriftAi(input.question, input.context, input.conversation ?? [])),
    }),
    evidence: router({
      list: protectedProcedure.input(z.object({ missionId: z.number().int().positive() })).query(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer", "user"]); return listMissionEvidence(input.missionId); }),
      demoList: protectedProcedure.input(z.object({ missionId: z.number().int().positive() })).query(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer", "user"]); return listDemoEvidence(input.missionId); }),
      upload: protectedProcedure.input(z.object({ missionId: z.number().int().positive(), fileName: z.string().min(1).max(255), mimeType: z.string().min(3).max(120), base64: z.string().min(8), mediaKind: z.enum(["photo", "video", "annotation", "report"]), latitude: z.string().optional(), longitude: z.string().optional(), playbackSeconds: z.number().int().nonnegative().optional(), assetId: z.number().int().positive().optional(), assetCriticality: z.number().int().min(1).max(5).optional(), priorOpenDefects: z.number().int().min(0).max(100).optional(), runInference: z.boolean().default(true), capturedAt: z.number().int().positive().optional(), cameraId: z.string().max(120).optional(), captureZone: z.enum(CAPTURE_ZONES).optional(), headingDegrees: z.number().int().min(0).max(359).optional(), qualityStatus: z.enum(QUALITY_STATUSES).optional(), imageQuality: z.record(z.string(), z.unknown()).optional(), inspectionDomain: z.enum(INSPECTION_DOMAINS).optional(), correlationKey: z.string().max(160).optional(), captureSource: z.enum(["hardware", "upload"]).default("upload"), aircraftProfile: z.string().max(120).optional() })).mutation(async ({ ctx, input }) => {
        const bytes = Buffer.from(input.base64.split(",").pop() ?? "", "base64");
        if (bytes.byteLength === 0 || bytes.byteLength > 50 * 1024 * 1024) throw new Error("Evidence upload must be between 1 byte and 50 MB.");
        if (!supabasePortableStorageConfigured()) throw new Error("Portable evidence storage is not configured for this deployment.");
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const stored = await storagePut(`drift/${ctx.user.id}/missions/${input.missionId}/${Date.now()}-${safeName}`, bytes, input.mimeType);
        const evidenceRecord = await createEvidenceRecord({ missionId: input.missionId, uploadedBy: ctx.user.id, fileName: input.fileName, mimeType: input.mimeType, storageKey: stored.key, storageUrl: browserStorageUrl(stored.key, stored.url), mediaKind: input.mediaKind, latitude: input.latitude, longitude: input.longitude, playbackSeconds: input.playbackSeconds, source: input.captureSource, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), capturedAt: input.capturedAt ? new Date(input.capturedAt) : undefined, cameraId: input.cameraId, captureZone: input.captureZone, headingDegrees: input.headingDegrees, qualityStatus: input.qualityStatus, imageQuality: input.imageQuality, provenance: { inspectionDomain: input.inspectionDomain, correlationKey: input.correlationKey, kind: input.captureSource === "hardware" ? "operator-uav-capture" : "operator-upload", aircraftProfile: input.aircraftProfile ?? null, originalCaptureRequired: true, notSimulator: true } });
        const qualityGate = input.qualityStatus === "fail" ? { status: "fail", action: "blocked-from-inference" } : input.qualityStatus === "review" ? { status: "review", action: "engineer-review-required" } : { status: input.qualityStatus ?? "pending", action: "review-policy-applies" };
        if (input.qualityStatus === "fail" || input.mediaKind !== "photo" || !input.runInference || !input.assetId || !input.assetCriticality || !input.latitude || !input.longitude) return { ...evidenceRecord, inference: null, qualityGate };
        const inference = await runVisionInference({ fileName: input.fileName, imageBase64: input.base64, latitude: Number(input.latitude), longitude: Number(input.longitude), assetCriticality: input.assetCriticality, priorOpenDefects: input.priorOpenDefects ?? 0 });
        const persisted = await persistInferenceDefect({ missionId: input.missionId, assetId: input.assetId, evidenceId: evidenceRecord.id, latitude: Number(input.latitude), longitude: Number(input.longitude), inference, inspectionDomain: input.inspectionDomain, correlationKey: input.correlationKey, createdBy: ctx.user.id });
        return { ...evidenceRecord, inference: persisted };
      }),
    }),
    assets: router({
      list: protectedProcedure.query(({ ctx }) => { requireDriftRole(ctx.user, ["admin", "engineer", "user"]); return listAssets(); }),
      create: protectedProcedure.input(z.object({ name: z.string().min(3).max(160), assetType: z.enum(["bridge", "road", "rail", "building", "utility"]), locality: z.string().min(3).max(160), latitude: z.string().min(3), longitude: z.string().min(3), criticality: z.number().int().min(1).max(5) })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin"]); return createAssetRecord(input); }),
      update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(3).max(160).optional(), assetType: z.enum(["bridge", "road", "rail", "building", "utility"]).optional(), locality: z.string().min(3).max(160).optional(), latitude: z.string().min(3).optional(), longitude: z.string().min(3).optional(), criticality: z.number().int().min(1).max(5).optional(), status: z.enum(["operational", "watch", "restricted", "closed"]).optional() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin"]); const { id, ...changes } = input; return updateAssetRecord(id, changes); }),
      delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin"]); return deleteAssetRecord(input.id); }),
    }),
    filters: router({
      defects: protectedProcedure.input(z.object({ assetId: z.number().int().positive().optional(), missionId: z.number().int().positive().optional(), defectType: z.enum(["pothole", "crack", "structural", "corrosion", "spalling", "exposed_rebar", "water_intrusion", "settlement", "rail_alignment", "obstruction", "lighting_failure"]).optional(), inspectionDomain: z.enum(INSPECTION_DOMAINS).optional(), severity: z.enum(["low", "medium", "high", "critical"]).optional(), status: z.enum(["detected", "under_review", "verified", "scheduled", "resolved", "dismissed"]).optional(), reviewState: z.enum(["pending", "approved", "overridden", "rejected"]).optional() })).query(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer", "user"]); return listFilteredDefects(input); }),
      mapData: protectedProcedure.input(z.object({ assetId: z.number().int().positive().optional(), missionId: z.number().int().positive().optional(), defectType: z.enum(["pothole", "crack", "structural", "corrosion", "spalling", "exposed_rebar", "water_intrusion", "settlement", "rail_alignment", "obstruction", "lighting_failure"]).optional(), inspectionDomain: z.enum(INSPECTION_DOMAINS).optional(), severity: z.enum(["low", "medium", "high", "critical"]).optional(), status: z.enum(["detected", "under_review", "verified", "scheduled", "resolved", "dismissed"]).optional(), reviewState: z.enum(["pending", "approved", "overridden", "rejected"]).optional() })).query(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer", "user"]); return getMapData(input); }),
    }),
    alerts: router({
      list: protectedProcedure.query(({ ctx }) => { requireDriftRole(ctx.user, ["admin", "engineer", "user"]); return listAlerts(); }),
      acknowledge: protectedProcedure.input(z.object({ alertId: z.number().int().positive() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer", "user"]); return acknowledgeAlert(input.alertId, ctx.user.id); }),
    }),
    reports: router({
      list: protectedProcedure.query(({ ctx }) => { requireDriftRole(ctx.user, ["admin", "engineer", "user"]); return listReportRecords(); }),
      generate: protectedProcedure.input(z.object({ missionId: z.number().int().positive() })).mutation(({ ctx, input }) => {
        requireDriftRole(ctx.user, ["admin", "engineer", "user"]);
        return generateMissionReport({ missionId: input.missionId });
      }),
      demoPdf: publicProcedure.input(z.object({ name: z.string().trim().min(3).max(180).default("Demo corridor patrol"), findingId: z.number().int().min(1).max(15).optional() })).mutation(async ({ input }) => {
        const simulator = await buildSimulatorMission(input.name);
        const selectedFindings = input.findingId ? simulator.findings.filter((_, index) => index + 1 === input.findingId) : simulator.findings;
        const contractorRoute = (() => {
          const label = selectedFindings[0]?.label ?? "pothole";
          if (label === "rail_alignment") return { contractorName: "IRCON International Limited", ragStatus: "amber" as const, workProfile: "railway engineering and infrastructure works", sourceLabel: "Public company profile candidate", sourceUrl: "https://ircon.org/", disclaimer: "Candidate only; not assigned, vetted, or endorsed by DRIFT." };
          if (label === "structural" || label === "spalling" || label === "exposed_rebar") return { contractorName: "Afcons Infrastructure Limited", ragStatus: "amber" as const, workProfile: "transport and bridge infrastructure works", sourceLabel: "Public company profile candidate", sourceUrl: "https://www.afcons.com/", disclaimer: "Candidate only; not assigned, vetted, or endorsed by DRIFT." };
          return { contractorName: "Larsen & Toubro Limited", ragStatus: "amber" as const, workProfile: "transport, civil, and infrastructure works", sourceLabel: "Public company profile candidate", sourceUrl: "https://www.larsentoubro.com/", disclaimer: "Candidate only; not assigned, vetted, or endorsed by DRIFT." };
        })();
        const demoEvidence = selectedFindings.map((finding, index) => ({
          id: index + 1,
          fileName: `simulated-detection-${index + 1}.svg`,
          source: "simulator" as const,
          captureZone: finding.label === "structural" ? "under-bridge" : "oblique",
          qualityStatus: "review",
          latitude: String(finding.latitude),
          longitude: String(finding.longitude),
          cameraId: "DRIFT simulator",
          storageUrl: "synthetic://simulator-evidence",
          provenance: { kind: "generated-simulator", note: "Synthetic visual for repeatable demo only; not live drone evidence." },
          imageBuffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="100%" height="100%" fill="#18232e"/><path d="M0 600 L420 210 L860 720" stroke="#778692" stroke-width="92" fill="none"/><rect x="460" y="240" width="230" height="150" fill="none" stroke="#15b8c9" stroke-width="6"/><text x="60" y="72" fill="#ffffff" font-size="30" font-family="Arial" letter-spacing="6">DRIFT / SIMULATED DETECTION</text><text x="60" y="670" fill="#ffffff" font-size="24" font-family="Arial">${finding.title.toUpperCase()} · ${Math.round(finding.confidence * 100)}% CONFIDENCE</text></svg>`),
        }));
        const pdf = await renderInspectionPdf({
          mission: { id: 0, name: simulator.name, startedAt: new Date(simulator.startedAt), completedAt: new Date(), mode: "stateless_demo", status: "completed" },
          evidence: demoEvidence,
          defects: selectedFindings.map((finding, index) => ({
            id: index + 1,
            label: finding.title,
            defectType: finding.label,
            severity: finding.score.severity,
            zeroErrorScore: finding.score.score,
            confidencePercent: Math.round(finding.confidence * 100),
            coveragePercent: null,
            status: "simulated",
            reviewState: "pending",
            inspectionDomain: "transient browser demo",
            latitude: String(finding.latitude),
            longitude: String(finding.longitude),
            evidenceId: null,
            explanation: finding.score.explanation,
            uncertainty: ["Temporary simulator output; original authorised evidence and engineer review are required."],
            correlationKey: `transient-demo-${index + 1}`,
          })),
          repairTotalCents: selectedFindings.reduce((sum, finding) => sum + finding.score.repairEstimateCents, 0),
          contractorRoute,
        });
        const suffix = input.findingId ? `-finding-${input.findingId}` : "";
        return { title: `${simulator.name} · ${input.findingId ? `Finding ${input.findingId}` : "Transient demo"} PDF`, filename: `drift-transient-demo-report${suffix}.pdf`, contentType: "application/pdf", base64: pdf.toString("base64"), transient: true, contractorRoute };
      }),
    }),
    accountability: router({
      overview: publicProcedure.query(({ ctx }) => canReview(ctx.user) ? getAccountabilityOverview() : getPublicAccountabilityOverview()),
      assignedWork: protectedProcedure.query(({ ctx }) => { requireDriftRole(ctx.user, ["contractor"]); return listAssignedContractorTickets(ctx.user.id); }),
      publicStatuses: publicProcedure.query(() => listPublishedPublicStatuses()),
      knowledge: router({
        registerDraft: protectedProcedure.input(z.object({ projectScope: z.string().trim().min(2).max(160), title: z.string().trim().min(3).max(300), documentType: z.string().trim().min(2).max(120), version: z.string().trim().min(1).max(80), permittedRoles: z.array(z.enum(["admin", "engineer", "contractor", "user", "citizen"])).min(1).max(5), sourceReference: z.string().url().max(768).optional(), content: z.string().trim().min(80).max(100000) })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin"]); return createKnowledgeDocumentRecord({ ...input, createdBy: ctx.user.id }); }),
        approve: protectedProcedure.input(z.object({ documentId: z.number().int().positive() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin"]); return approveKnowledgeDocumentRecord({ documentId: input.documentId, approvedBy: ctx.user.id }); }),
        ask: protectedProcedure.input(z.object({ question: z.string().trim().min(3).max(2000), projectScope: z.string().trim().min(2).max(160).optional() })).mutation(async ({ ctx, input }) => {
          const retrieval = await retrieveApprovedKnowledge({ question: input.question, projectScope: input.projectScope, role: ctx.user.role, actorId: ctx.user.id });
          const answer = await askDriftAi(input.question, {}, [], { sourceOnly: true, citations: retrieval.citations });
          return { ...answer, retrieval: { status: retrieval.status, message: retrieval.message, citations: retrieval.citations.map(({ content, ...citation }) => citation) } };
        }),
        retrievalRuns: protectedProcedure.query(({ ctx }) => { requireDriftRole(ctx.user, ["admin"]); return listKnowledgeRetrievalRuns(); }),
      }),
      contractors: router({
        create: protectedProcedure.input(z.object({ legalName: z.string().trim().min(2).max(220), externalReference: z.string().trim().min(2).max(160).optional() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin"]); return createContractorRecord({ ...input, createdBy: ctx.user.id }); }),
        assignUser: protectedProcedure.input(z.object({ contractorId: z.number().int().positive(), userId: z.number().int().positive() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin"]); return assignContractorUserRecord({ ...input, assignedBy: ctx.user.id }); }),
      }),
      cameras: router({
        register: protectedProcedure.input(z.object({ ownerName: z.string().trim().min(2).max(220), cameraCode: z.string().trim().min(2).max(160), displayName: z.string().trim().min(2).max(220), authorizedPurpose: z.string().trim().min(12).max(2000), zoneLabel: z.string().trim().min(2).max(160), latitude: z.string().trim().max(32).optional(), longitude: z.string().trim().max(32).optional(), retentionUntil: z.number().int().positive(), accessClassification: z.string().trim().min(2).max(80), consentAndPrivacyNote: z.string().trim().min(12).max(2000) })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin"]); return createCameraSourceRecord({ ...input, retentionUntil: new Date(input.retentionUntil), createdBy: ctx.user.id }); }),
        registerCandidate: protectedProcedure.input(z.object({ cameraSourceId: z.number().int().positive(), evidenceId: z.number().int().positive(), assetId: z.number().int().positive().optional(), candidateType: z.string().trim().min(2).max(120), zoneLabel: z.string().trim().min(2).max(160), latitude: z.string().trim().max(32).optional(), longitude: z.string().trim().max(32).optional(), bridgeIdentity: z.string().trim().min(3).max(180), dedupeKey: z.string().trim().min(12).max(180), detectionConfidence: z.number().int().min(0).max(100), localizationConfidence: z.number().int().min(0).max(100), evidenceQuality: z.number().int().min(0).max(100), temporalObservationCount: z.number().int().min(1).max(100), qualitySignals: z.record(z.string(), z.unknown()), observedAt: z.number().int().positive() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer"]); return createCctvCandidateRecord({ ...input, observedAt: new Date(input.observedAt), createdBy: ctx.user.id }); }),
        reviewCandidate: protectedProcedure.input(z.object({ candidateId: z.number().int().positive(), decision: z.enum(["rejected", "ground_check", "uav_preflight_recommended"]), operatorNote: z.string().trim().min(8).max(5000) })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer"]); return reviewCctvCandidateRecord({ ...input, reviewedBy: ctx.user.id }); }),
      }),
      security: router({
        registerObservation: protectedProcedure.input(z.object({ assetId: z.number().int().positive().optional(), cameraSourceId: z.number().int().positive().optional(), source: z.enum(["authorized_bridge_health", "approved_security_adapter"]), integrationName: z.string().trim().min(3).max(160), sourceRecordReference: z.string().trim().min(6).max(240), observationType: z.enum(["bridge_health_signal", "security_adapter_alert"]), observationSummary: z.string().trim().min(12).max(5000), authorizedScope: z.string().trim().min(12).max(5000), retentionUntil: z.number().int().positive(), observedAt: z.number().int().positive(), integrityMetadata: z.record(z.string(), z.unknown()) })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer"]); return registerAuthorizedSecurityObservationRecord({ ...input, retentionUntil: new Date(input.retentionUntil), observedAt: new Date(input.observedAt), createdBy: ctx.user.id }); }),
      }),
      authorities: router({
        create: protectedProcedure.input(z.object({ legalName: z.string().trim().min(2).max(220), authorityType: z.enum(["municipal", "state", "national", "utility", "private_operator", "contractor_internal"]), contactChannel: z.string().trim().max(300).optional() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin"]); return createAuthorityRecord({ ...input, createdBy: ctx.user.id }); }),
        createSla: protectedProcedure.input(z.object({ authorityId: z.number().int().positive(), contractReference: z.string().trim().min(2).max(200), responseTargetHours: z.number().int().positive().max(24 * 365), closureTargetHours: z.number().int().positive().max(24 * 365), escalationPolicy: z.record(z.string(), z.unknown()), businessCalendar: z.record(z.string(), z.unknown()).optional(), policyVersion: z.string().trim().min(1).max(80), effectiveFrom: z.number().int().positive(), effectiveUntil: z.number().int().positive().optional() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin"]); return createSlaRuleRecord({ ...input, effectiveFrom: new Date(input.effectiveFrom), effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : undefined, createdBy: ctx.user.id }); }),
        createRoutingRule: protectedProcedure.input(z.object({ authorityId: z.number().int().positive(), contractorId: z.number().int().positive().optional(), slaRuleId: z.number().int().positive().optional(), assetType: z.enum(["bridge", "road", "rail", "building", "utility"]).optional(), zoneReference: z.string().trim().min(2).max(200), boundarySourceReference: z.string().url().max(768), responsibleTeam: z.string().trim().min(2).max(180), effectiveFrom: z.number().int().positive(), effectiveUntil: z.number().int().positive().optional() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin"]); return createRoutingRuleRecord({ ...input, effectiveFrom: new Date(input.effectiveFrom), effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : undefined, createdBy: ctx.user.id }); }),
      }),
      tickets: router({
        create: protectedProcedure.input(z.object({ assetId: z.number().int().positive(), defectId: z.number().int().positive().optional(), contractorId: z.number().int().positive().optional(), assignedUserId: z.number().int().positive().optional(), title: z.string().trim().min(4).max(220), scopeNote: z.string().trim().min(8).max(5000), zoneLabel: z.string().trim().min(2).max(160).optional(), latitude: z.string().trim().max(32).optional(), longitude: z.string().trim().max(32).optional(), dueAt: z.number().int().positive().optional(), verificationCriterion: z.string().trim().min(8).max(2000), evidenceId: z.number().int().positive().optional(), evidenceQuality: z.number().int().min(0).max(100).optional(), locationConfidence: z.number().int().min(0).max(100).optional(), approvedImpact: z.number().int().min(0).max(100).optional(), repeatCount: z.number().int().min(0).max(100).optional() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer"]); return createContractorTicketRecord({ ...input, dueAt: input.dueAt ? new Date(input.dueAt) : undefined, createdBy: ctx.user.id }); }),
        accept: protectedProcedure.input(z.object({ ticketId: z.number().int().positive() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["contractor"]); return acceptContractorTicketRecord({ ...input, actorId: ctx.user.id }); }),
        start: protectedProcedure.input(z.object({ ticketId: z.number().int().positive() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["contractor"]); return startContractorTicketRecord({ ...input, actorId: ctx.user.id }); }),
        addNote: protectedProcedure.input(z.object({ ticketId: z.number().int().positive(), note: z.string().trim().min(2).max(5000) })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["contractor"]); return addContractorTicketNoteRecord({ ...input, actorId: ctx.user.id }); }),
        close: protectedProcedure.input(z.object({ ticketId: z.number().int().positive(), contractorClosureNote: z.string().trim().min(8).max(5000), closureEvidenceIds: z.array(z.number().int().positive()).min(1).max(20) })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["contractor"]); return closeContractorTicketRecord({ ...input, actorId: ctx.user.id }); }),
        verify: protectedProcedure.input(z.object({ ticketId: z.number().int().positive(), decision: z.enum(["fixed", "needs_rework", "cannot_verify"]), verificationNote: z.string().trim().min(8).max(5000), followUpEvidenceIds: z.array(z.number().int().positive()).max(20) })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer"]); return verifyContractorTicketRecord({ ...input, engineerId: ctx.user.id }); }),
        prepareUavFollowUp: protectedProcedure.input(z.object({ ticketId: z.number().int().positive(), cctvCandidateId: z.number().int().positive().optional(), triggerReason: z.string().trim().min(12).max(2000), expiresAt: z.number().int().positive() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer"]); return prepareUavFollowUpRecommendationRecord({ ...input, expiresAt: new Date(input.expiresAt), preparedBy: ctx.user.id }); }),
        resolveRouting: protectedProcedure.input(z.object({ ticketId: z.number().int().positive() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer"]); return resolveTicketRoutingRecord({ ticketId: input.ticketId, reviewerId: ctx.user.id }); }),
        approveRouting: protectedProcedure.input(z.object({ routingDecisionId: z.number().int().positive() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer"]); return approveRoutingDecisionRecord({ routingDecisionId: input.routingDecisionId, reviewerId: ctx.user.id }); }),
        prepareHandoff: protectedProcedure.input(z.object({ ticketId: z.number().int().positive(), routingDecisionId: z.number().int().positive(), recipientSystem: z.string().trim().max(160).optional(), expiresAt: z.number().int().positive().optional() })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer"]); return prepareHandoffPackageRecord({ ...input, expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined, preparedBy: ctx.user.id }); }),
        publishStatus: protectedProcedure.input(z.object({ ticketId: z.number().int().positive(), publicSummary: z.string().trim().min(8).max(2000), expectedCompletionAt: z.number().int().positive().optional(), privacyReviewNote: z.string().trim().min(8).max(2000) })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin"]); return publishPublicStatusRecord({ ...input, expectedCompletionAt: input.expectedCompletionAt ? new Date(input.expectedCompletionAt) : undefined, approvedBy: ctx.user.id }); }),
        sendReportEmail: protectedProcedure.input(z.object({ ticketId: z.number().int().positive().optional(), subject: z.string().trim().min(4).max(240), contractor: z.string().trim().min(2).max(220), defect: z.string().trim().min(2).max(160), confidencePercent: z.number().int().min(0).max(100), severity: z.string().trim().min(2).max(40), latitude: z.string().trim().max(32), longitude: z.string().trim().max(32), estimatedRepairCost: z.string().trim().max(80), recommendedDeadline: z.string().trim().max(160), reportUrl: z.string().url().optional(), evidenceUrl: z.string().url().optional() })).mutation(async ({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer"]); return deliverContractorReport(input); }),
      }),
    }),
    workspace: protectedProcedure.query(({ ctx }) => { const role = ctx.user.role; return { role, permissions: role === "admin" ? ["asset:create", "asset:update", "asset:delete", "review", "audit", "alert:acknowledge"] : role === "engineer" || role === "user" ? ["review", "audit", "alert:acknowledge"] : ["public:read"] }; }),
    audit: router({ list: protectedProcedure.input(z.object({ missionId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer", "user"]); return listAuditEvents(input?.missionId); }) }),
    review: protectedProcedure.input(z.object({ defectId: z.number().int().positive(), decision: z.enum(["approve", "override", "reject", "needs_site_visit"]), priorityOverride: z.enum(["low", "medium", "high", "critical"]).optional(), note: z.string().min(4).max(2000) })).mutation(({ ctx, input }) => { requireDriftRole(ctx.user, ["admin", "engineer", "user"]); return addReview({ ...input, reviewerId: ctx.user.id }); }),
  }),
});

export type AppRouter = typeof appRouter;
