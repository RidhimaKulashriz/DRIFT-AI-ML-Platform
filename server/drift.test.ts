import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { requireDriftRole } from "./services/authorization";
import { authorizeBridgeToken, getHardwareConnection, probeHardwareConnection, validateTelemetryPayload } from "./services/hardwareAdapter";
import { runVisionInference } from "./services/mlInference";
import { resolveReviewState } from "./services/reviewState";
import { scoreZeroError } from "./services/scoring";
import { buildSimulatorMission } from "./services/simulator";
import { summarizeSeverity, toMapMarker } from "./services/reportPresentation";

const hasPostgresTestDatabase = /^(postgres|postgresql):\/\//.test(process.env.DATABASE_URL ?? "");

describe("ZeroError scoring", () => {
  it("prioritizes a high-confidence structural finding above routine defects", () => {
    const critical = scoreZeroError({ defectType: "structural", confidence: 0.94, latitude: 28.61, longitude: 77.2, priorOpenDefects: 2, assetCriticality: 5 });
    const low = scoreZeroError({ defectType: "pothole", confidence: 0.76, latitude: 28.61, longitude: 77.2, priorOpenDefects: 0, assetCriticality: 1 });
    expect(critical.score).toBeGreaterThan(low.score);
    expect(critical.severity).toBe("critical");
  });

  it("scores expanded infrastructure defect categories with explainable outputs", () => {
    const categories = ["corrosion", "spalling", "exposed_rebar", "water_intrusion", "settlement", "rail_alignment", "obstruction", "lighting_failure"] as const;
    for (const defectType of categories) {
      const result = scoreZeroError({ defectType, confidence: 0.88, latitude: 28.61, longitude: 77.2, priorOpenDefects: 1, assetCriticality: 4 });
      expect(result.score).toBeGreaterThan(0);
      expect(result.explanation.join(" ")).toContain(defectType);
      expect(result.repairEstimateCents).toBeGreaterThan(0);
    }
  });
});

describe("hardware adapter safeguards", () => {
  it("falls back safely when no hardware endpoint is configured", () => {
    expect(getHardwareConnection().status).toBe("offline");
    expect(getHardwareConnection().operatorMessage).toMatch(/Simulator mode/);
  });

  it("rejects incomplete telemetry payloads", () => {
    expect(validateTelemetryPayload({ latitude: 1 }).valid).toBe(false);
    expect(validateTelemetryPayload({ missionId: 42, latitude: 1, longitude: 2, altitude: 5, speedMps: 2, batteryPercent: 90, timestamp: Date.now() }).valid).toBe(true);
    expect(validateTelemetryPayload({ missionId: 42, latitude: 91, longitude: 2, altitude: 5, speedMps: 2, batteryPercent: 90, timestamp: Date.now() }).valid).toBe(false);
  });

  it("requires a configured bridge token and compares it safely", () => {
    expect(authorizeBridgeToken("secret", "secret")).toBe(true);
    expect(authorizeBridgeToken("wrong", "secret")).toBe(false);
    expect(authorizeBridgeToken(undefined, "secret")).toBe(false);
  });

  it("surfaces a retry state when a configured bridge is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const result = await probeHardwareConnection("https://bridge.example.test/health");
    expect(result.status).toBe("retrying");
    expect(result.retryAfterSeconds).toBe(30);
    vi.unstubAllGlobals();
  });

  it("surfaces a connected state after a successful health response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const result = await probeHardwareConnection("https://bridge.example.test/health");
    expect(result.status).toBe("connected");
    expect(result.lastHeartbeatAt).toEqual(expect.any(Number));
    vi.unstubAllGlobals();
  });
});

describe("vision inference adapter", () => {
  it("returns explainable structural inference for bridge evidence", async () => {
    const inference = await runVisionInference({ fileName: "bridge_structural_frame.jpg", latitude: 28.61, longitude: 77.2, assetCriticality: 5, priorOpenDefects: 1, demo: true });
    expect(inference.label).toBe("structural");
    expect(inference.coveragePercent).toBe(72);
    expect(inference.uncertainty.requiresHumanReview).toBe(true);
    expect(inference.source).toBe("deterministic-fallback");
    expect(inference.score.explanation.length).toBeGreaterThan(2);
  });

  it("uses a validated production CV response when configured", async () => {
    const previousEndpoint = process.env.ML_INFERENCE_URL;
    process.env.ML_INFERENCE_URL = "https://cv.example.test/infer";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ model: "inspection-yolo-v2", label: "crack", confidence: 0.91, boundingBox: { x: 10, y: 20, width: 30, height: 25 } }) }));
    const inference = await runVisionInference({ fileName: "frame.jpg", imageBase64: "data:image/jpeg;base64,AA==", latitude: 28.61, longitude: 77.2, assetCriticality: 4, priorOpenDefects: 0 });
    expect(inference.source).toBe("production-cv");
    expect(inference.model).toBe("inspection-yolo-v2");
    expect(inference.label).toBe("crack");
    vi.unstubAllGlobals();
    if (previousEndpoint === undefined) delete process.env.ML_INFERENCE_URL; else process.env.ML_INFERENCE_URL = previousEndpoint;
  });

  it("falls back when a CV service response is malformed", async () => {
    const previousEndpoint = process.env.ML_INFERENCE_URL;
    process.env.ML_INFERENCE_URL = "https://cv.example.test/infer";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ label: "unknown" }) }));
    const inference = await runVisionInference({ fileName: "crack_frame.jpg", imageBase64: "data:image/jpeg;base64,AA==", latitude: 28.61, longitude: 77.2, assetCriticality: 4, priorOpenDefects: 0 });
    expect(inference.source).toBe("deterministic-fallback");
    expect(inference.label).toBe("crack");
    vi.unstubAllGlobals();
    if (previousEndpoint === undefined) delete process.env.ML_INFERENCE_URL; else process.env.ML_INFERENCE_URL = previousEndpoint;
  });
});

describe("simulator lifecycle", () => {
  it("creates a complete no-hardware patrol with telemetry and prioritized findings", async () => {
    const mission = await buildSimulatorMission("Integration demo");
    expect(mission.name).toBe("Integration demo");
    expect(mission.telemetry).toHaveLength(12);
    expect(mission.findings).toHaveLength(3);
    expect(mission.findings.map(finding => finding.label)).toEqual(expect.arrayContaining(["structural", "crack", "pothole"]));
    expect(mission.findings[0]?.score.severity).toBe("critical");
    expect(mission.findings.some(finding => finding.label === "pothole")).toBe(true);
  });
});

describe("engineering review state and role boundary", () => {
  it("records an explicit severity override while retaining a verified outcome", () => {
    expect(resolveReviewState("override", "critical", "high")).toEqual({ severity: "high", reviewState: "overridden", status: "verified" });
    expect(resolveReviewState("needs_site_visit", "medium")).toEqual({ severity: "medium", reviewState: "pending", status: "under_review" });
  });

  it("allows engineers while blocking citizen operational changes", () => {
    expect(() => requireDriftRole({ role: "engineer" }, ["admin", "engineer"])).not.toThrow();
    expect(() => requireDriftRole({ role: "citizen" }, ["admin", "engineer"])).toThrow(/does not permit/);
  });
});

describe("report presentation contracts", () => {
  it("aggregates all severity buckets deterministically", () => {
    expect(summarizeSeverity([{ severity: "critical" }, { severity: "critical" }, { severity: "high" }, { severity: "medium" }, { severity: "unknown" }])).toEqual({ critical: 2, high: 1, medium: 1, low: 0 });
  });

  it("preserves the enriched map marker fields required by the review UI", () => {
    const marker = toMapMarker({ id: 7, missionId: 8, assetId: 9, defectType: "crack", label: "Deck crack", inspectionDomain: "bridges", severity: "high", status: "under_review", reviewState: "pending", zeroErrorScore: 82, confidencePercent: 88, coveragePercent: 71, evidenceId: 10, correlationKey: "mission:8:finding:7", explanation: ["visible signal"], latitude: "28.61", longitude: "77.20" });
    expect(marker).toMatchObject({ id: 7, missionId: 8, assetId: 9, severity: "high", confidencePercent: 88, coveragePercent: 71, evidenceId: 10, correlationKey: "mission:8:finding:7", latitude: 28.61, longitude: 77.2 });
  });
});

describe("report generation", () => {
  it("generates an evidence-linked report through the protected application procedure", async () => {
    const ctx = { user: { id: 1, role: "engineer" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;
    if (!hasPostgresTestDatabase) {
      await expect(appRouter.createCaller(ctx).drift.reports.generate({ missionId: 120001 })).rejects.toThrow(/Database is unavailable/);
      return;
    }
    const result = await appRouter.createCaller(ctx).drift.reports.generate({ missionId: 120001 });
    expect(result.title).toContain("Evidence-linked inspection report");
    expect(result.body).toContain("mission:120001:real-image-pass-02");
    expect(result.body).toContain("Next inspection");
    expect(result.body).toContain("Status: PENDING");
    expect(result.evidenceCount).toBeGreaterThan(0);
    expect(result.defectCount).toBeGreaterThan(0);
  }, 15000);

  it("fails explicitly when the requested mission is not present", async () => {
    const ctx = { user: { id: 1, role: "engineer" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;
    if (!hasPostgresTestDatabase) {
      await expect(appRouter.createCaller(ctx).drift.reports.generate({ missionId: 999999999 })).rejects.toThrow(/Database is unavailable/);
      return;
    }
    await expect(appRouter.createCaller(ctx).drift.reports.generate({ missionId: 999999999 })).rejects.toThrow(/Mission does not exist/);
  });
});

describe("tRPC operations", () => {
  it("exposes safe hardware, filter, map, alert, and report read operations", async () => {
    const ctx = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;
    const caller = appRouter.createCaller(ctx);
    const [overview, hardware, defects, mapData, alerts, reportRecords, demoEvidence] = await Promise.all([
      caller.drift.overview(),
      caller.drift.hardwareStatus(),
      caller.drift.filters.defects({}),
      caller.drift.filters.mapData({}),
      caller.drift.alerts.list(),
      caller.drift.reports.list(),
      caller.drift.evidence.demoList({ missionId: 60001 }),
    ]);
    expect(overview.persistence).toEqual(expect.objectContaining({ available: expect.any(Boolean), configured: expect.any(Boolean), driver: "postgresql", message: expect.any(String) }));
    expect(["offline", "connected", "retrying", "degraded"]).toContain(hardware.status);
    expect(Array.isArray(defects)).toBe(true);
    expect(Array.isArray(mapData)).toBe(true);
    expect(Array.isArray(alerts)).toBe(true);
    expect(Array.isArray(reportRecords)).toBe(true);
    expect(Array.isArray(demoEvidence)).toBe(true);
  });

  it("supports multi-pass defect correlation lookup by evidence key", async () => {
    const ctx = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;
    const rows = await appRouter.createCaller(ctx).drift.correlatedDefects({ correlationKey: "simulator:120001:0" });
    expect(Array.isArray(rows)).toBe(true);
  });

  it("returns source and provenance metadata for populated simulator evidence", async () => {
    const ctx = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;
    const caller = appRouter.createCaller(ctx);
    const rows = await caller.drift.evidence.demoList({ missionId: 120001 });
    if (!hasPostgresTestDatabase) {
      expect(rows).toEqual([]);
      return;
    }
    const reference = rows.find(item => item.fileName === "public-domain-pothole-reference.jpg");
    expect(reference?.source).toBe("simulator");
    expect(reference?.provenance).toEqual(expect.objectContaining({ kind: "reference-image", author: "Uncl3dad", license: "Public domain dedication", sourceUrl: "https://commons.wikimedia.org/wiki/File:Pothole_Big.jpg" }));
    expect(rows.some(item => item.provenance && typeof item.provenance === "object" && "kind" in item.provenance && item.provenance.kind === "generated-simulator")).toBe(true);
  });
});

describe("authorized workspace roles", () => {
  it("blocks citizen accounts from creating a UAV capture mission", async () => {
    const ctx = { user: { id: 7, role: "citizen" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;
    await expect(appRouter.createCaller(ctx).drift.createHardwareCaptureMission({ name: "Citizen UAV attempt", aircraftProfile: "PX4 / ArduPilot MAVLink-compatible UAV", adapter: "mavlink-bridge", latitude: 28.6139, longitude: 77.2090 })).rejects.toThrow(/does not permit/);
  });

  const baseContext = { req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
  const userFor = (role: "admin" | "engineer" | "citizen") => ({ id: 1, openId: `${role}-user`, name: role, email: null, loginMethod: "manus", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });

  it("returns role-specific server-authorized workspace permissions", async () => {
    const admin = await appRouter.createCaller({ ...baseContext, user: userFor("admin") } as TrpcContext).drift.workspace();
    const engineer = await appRouter.createCaller({ ...baseContext, user: userFor("engineer") } as TrpcContext).drift.workspace();
    const citizen = await appRouter.createCaller({ ...baseContext, user: userFor("citizen") } as TrpcContext).drift.workspace();
    expect(admin.permissions).toContain("asset:delete");
    expect(engineer.permissions).toContain("review");
    expect(citizen.permissions).toEqual(["public:read"]);
  });

  it("rejects protected administrator and engineering actions for unauthorized roles before database mutation", async () => {
    const citizen = appRouter.createCaller({ ...baseContext, user: userFor("citizen") } as TrpcContext);
    const engineer = appRouter.createCaller({ ...baseContext, user: userFor("engineer") } as TrpcContext);
    await expect(citizen.drift.assets.create({ name: "Blocked asset", assetType: "bridge", locality: "Delhi", latitude: "28.61", longitude: "77.20", criticality: 4 })).rejects.toThrow(/does not permit/);
    await expect(engineer.drift.assets.delete({ id: 999999 })).rejects.toThrow(/does not permit/);
    await expect(citizen.drift.review({ defectId: 1, decision: "approve", note: "Citizen review attempt" })).rejects.toThrow(/does not permit/);
  });
});
