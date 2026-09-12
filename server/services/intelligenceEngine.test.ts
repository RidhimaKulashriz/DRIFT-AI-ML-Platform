import { describe, expect, it } from "vitest";
import { buildIntelligenceSnapshot, simulateTwinFailure, type SnapshotInput } from "./intelligenceEngine";

const base: SnapshotInput = {
  assets: [{ id: 1, name: "Bridge A", assetType: "bridge", locality: "Delhi", latitude: "28.6139", longitude: "77.2090", criticality: 5, status: "operational", campusId: null, createdAt: new Date(), updatedAt: new Date() }],
  missions: [],
  telemetry: [{ id: 1, missionId: 1, latitude: "28.6139", longitude: "77.2090", altitudeMeters: 30, speedMps: 4, batteryPercent: 80, capturedAt: new Date() }],
  evidence: [{ id: 8, missionId: 1, uploadedBy: 1, fileName: "bridge.jpg", mimeType: "image/jpeg", storageKey: "x", storageUrl: "x", mediaKind: "photo", latitude: "28.6139", longitude: "77.2090", locationSource: "device_gps", playbackSeconds: null, source: "upload", sha256: "hash-8", capturedAt: new Date(), cameraId: null, provenance: null, captureZone: null, headingDegrees: null, qualityStatus: "pass", imageQuality: null, attachmentData: null, createdAt: new Date() }],
  defects: [{ id: 4, missionId: 1, assetId: 1, evidenceId: 8, defectType: "crack", label: "deck crack", confidencePercent: 82, zeroErrorScore: 70, severity: "high", status: "detected", reviewState: "pending", latitude: "28.6139", longitude: "77.2090", boundingBox: null, explanation: null, inferenceModel: "test", inferenceSource: "production-cv", inferenceAnnotation: null, inferenceCapturedAt: new Date(), inspectionDomain: "bridges", coveragePercent: 80, uncertainty: null, correlationKey: "m1-a1", reviewRequired: 1, createdAt: new Date(), updatedAt: new Date() }],
};

describe("DRIFT intelligence engine", () => {
  it("builds evidence-backed uncertainty and lineage", () => {
    const result = buildIntelligenceSnapshot(base);
    expect(result.algorithm).toBe("drift-intelligence-v1");
    expect(result.dataQuality.score).toBeGreaterThan(80);
    expect(result.lineage[0]).toMatchObject({ assetId: 1, supportingEvidenceIds: [8], defectIds: [4] });
    expect(result.eventGraph.some(edge => edge.relation === "affects")).toBe(true);
    expect(result.inspectionTargets[0]?.assetId).toBe(1);
  });

  it("detects source conflict and keeps failure simulation isolated", () => {
    const conflicted = buildIntelligenceSnapshot({ ...base, evidence: base.evidence.map(item => ({ ...item, qualityStatus: "fail" as const })), defects: base.defects.map(item => ({ ...item, reviewState: "rejected" as const })) });
    expect(conflicted.uncertainty.status).toBe("conflicting_evidence");
    const simulation = simulateTwinFailure(conflicted, [1]);
    expect(simulation.productionStateChanged).toBe(false);
    expect(simulation.affected.some(item => item.assetId === 1 && item.relation === "direct_effect")).toBe(true);
  });
});
