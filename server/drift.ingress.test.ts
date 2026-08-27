import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const addTelemetryRecord = vi.fn();
const createEvidenceRecord = vi.fn();
const persistInferenceDefect = vi.fn();
const storagePut = vi.fn();
const supabasePortableStorageConfigured = vi.fn();

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, addTelemetryRecord, createEvidenceRecord, persistInferenceDefect };
});

vi.mock("./storage", () => ({ storagePut, storagePutWithFallback: storagePut }));
vi.mock("./services/supabaseStorage", () => ({ supabasePortableStorageConfigured }));

const { appRouter } = await import("./routers");

const context = {
  user: {
    id: 91,
    openId: "engineer-ingress-test",
    name: "Ingress Test Engineer",
    email: null,
    loginMethod: "test",
    role: "engineer",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
} as TrpcContext;

describe("DRIFT ingress route persistence", () => {
  const anonymousContext = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;

  beforeEach(() => {
    vi.clearAllMocks();
    addTelemetryRecord.mockResolvedValue({ id: 501 });
    storagePut.mockResolvedValue({ key: "drift/91/missions/77/inspection.jpg", url: "https://storage.test/inspection.jpg" });
    createEvidenceRecord.mockResolvedValue({ id: 502 });
    persistInferenceDefect.mockResolvedValue({ defectId: 503, source: "deterministic-fallback", model: "DRIFT-CV deterministic fallback v1" });
    supabasePortableStorageConfigured.mockReturnValue(true);
  });

  it("persists a validated telemetry payload through the protected tRPC route", async () => {
    const caller = appRouter.createCaller(context);
    const payload = { missionId: 77, latitude: 28.6139, longitude: 77.209, altitude: 42, speedMps: 8, batteryPercent: 86, timestamp: Date.now() };

    await expect(caller.drift.ingestTelemetry(payload)).resolves.toEqual({ id: 501 });
    expect(addTelemetryRecord).toHaveBeenCalledWith(payload);
  });

  it("rejects unauthorized telemetry and evidence callers", async () => {
    const caller = appRouter.createCaller(anonymousContext);
    await expect(caller.drift.ingestTelemetry({ missionId: 77, latitude: 28.6139, longitude: 77.209, altitude: 42, speedMps: 8, batteryPercent: 86, timestamp: Date.now() })).rejects.toThrow(/UNAUTHORIZED|logged in|Please login/i);
    await expect(caller.drift.evidence.upload({ missionId: 77, fileName: "bridge-frame.jpg", mimeType: "image/jpeg", base64: "data:image/jpeg;base64,AA==", mediaKind: "photo" })).rejects.toThrow(/UNAUTHORIZED|logged in|Please login/i);
  });

  it("rejects invalid telemetry and empty evidence bytes before persistence", async () => {
    const caller = appRouter.createCaller(context);
    await expect(caller.drift.ingestTelemetry({ missionId: 77, latitude: 95, longitude: 77.209, altitude: 42, speedMps: 8, batteryPercent: 86, timestamp: Date.now() })).rejects.toThrow(/geographic bounds|outside valid/i);
    await expect(caller.drift.evidence.upload({ missionId: 77, fileName: "empty.jpg", mimeType: "image/jpeg", base64: "data:image/jpeg;base64,====", mediaKind: "photo" })).rejects.toThrow(/between 1 byte and 50 MB/i);
    expect(addTelemetryRecord).not.toHaveBeenCalled();
    expect(createEvidenceRecord).not.toHaveBeenCalled();
  });

  it("blocks inference when the image-quality gate fails while retaining the evidence record", async () => {
    const caller = appRouter.createCaller(context);
    const result = await caller.drift.evidence.upload({ missionId: 77, fileName: "low-light-frame.jpg", mimeType: "image/jpeg", base64: "data:image/jpeg;base64,AA==", mediaKind: "photo", latitude: "28.6139", longitude: "77.2090", assetId: 14, assetCriticality: 5, priorOpenDefects: 0, runInference: true, qualityStatus: "fail", captureZone: "low-light", inspectionDomain: "bridges" });
    expect(result).toEqual(expect.objectContaining({ id: 502, inference: null, qualityGate: { status: "fail", action: "blocked-from-inference" } }));
    expect(persistInferenceDefect).not.toHaveBeenCalled();
  });

  it("stores uploaded evidence with SHA-256 provenance and persists the inference defect", async () => {
    const caller = appRouter.createCaller(context);
    const result = await caller.drift.evidence.upload({
      missionId: 77,
      fileName: "bridge-frame.jpg",
      mimeType: "image/jpeg",
      base64: "data:image/jpeg;base64,AA==",
      mediaKind: "photo",
      latitude: "28.6139",
      longitude: "77.2090",
      assetId: 14,
      assetCriticality: 5,
      priorOpenDefects: 1,
      runInference: true,
      cameraId: "PX4-CAM-01",
      captureZone: "under-bridge",
      headingDegrees: 182,
      qualityStatus: "review",
      imageQuality: { blurScore: 0.18, gpsLock: true },
      inspectionDomain: "bridges",
      correlationKey: "mission-77-asset-14-pass-01",
      captureSource: "hardware",
      aircraftProfile: "PX4 / ArduPilot MAVLink-compatible UAV",
    });

    expect(storagePut).toHaveBeenCalledWith(expect.stringMatching(/^drift\/91\/missions\/77\/.*-bridge-frame\.jpg$/), expect.any(Buffer), "image/jpeg");
    expect(createEvidenceRecord).toHaveBeenCalledWith(expect.objectContaining({
      missionId: 77,
      uploadedBy: 91,
      fileName: "bridge-frame.jpg",
      source: "hardware",
      cameraId: "PX4-CAM-01",
      captureZone: "under-bridge",
      qualityStatus: "review",
      provenance: { inspectionDomain: "bridges", correlationKey: "mission-77-asset-14-pass-01", kind: "operator-uav-capture", aircraftProfile: "PX4 / ArduPilot MAVLink-compatible UAV", originalCaptureRequired: true, notSimulator: true },
      sha256: "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d",
      storageKey: "drift/91/missions/77/inspection.jpg",
    }));
    expect(persistInferenceDefect).toHaveBeenCalledWith(expect.objectContaining({ missionId: 77, assetId: 14, evidenceId: 502, latitude: 28.6139, longitude: 77.209, inspectionDomain: "bridges", correlationKey: "mission-77-asset-14-pass-01" }));
    expect(result).toEqual(expect.objectContaining({ id: 502, inference: { defectId: 503, source: "deterministic-fallback", model: "DRIFT-CV deterministic fallback v1" } }));
  });
});
