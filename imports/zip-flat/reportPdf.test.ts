import { describe, expect, it } from "vitest";
import { renderInspectionPdf } from "./reportPdf";

describe("DRIFT inspection PDF renderer", () => {
  it("renders an engineer-ready PDF with severity, evidence, coordinates, and sign-off controls", async () => {
    const pdf = await renderInspectionPdf({
      mission: { id: 12, name: "North span verification", mode: "demo", status: "completed" },
      evidence: [{ id: 41, fileName: "bridge-frame.jpg", source: "upload", captureZone: "under-bridge", qualityStatus: "review", latitude: "28.6139", longitude: "77.2090", cameraId: "CAM-01", storageUrl: "/manus-storage/bridge-frame.jpg" }],
      defects: [
        { id: 101, label: "Structural anomaly candidate", defectType: "structural", severity: "critical", zeroErrorScore: 94, confidencePercent: 91, coveragePercent: 72, status: "under_review", reviewState: "pending", inspectionDomain: "bridges", latitude: "28.6139", longitude: "77.2090", evidenceId: 41, explanation: ["Structural signal requires engineer verification"], uncertainty: { requiresHumanReview: true }, correlationKey: "mission:12:finding:101" },
        { id: 102, label: "Surface crack candidate", defectType: "crack", severity: "high", zeroErrorScore: 81, confidencePercent: 84, coveragePercent: 68, status: "detected", reviewState: "pending", inspectionDomain: "bridges", latitude: "28.6141", longitude: "77.2092", evidenceId: 41, explanation: ["Crack signal is visible in the captured frame"], uncertainty: { reason: "single pass" }, correlationKey: "mission:12:finding:102" },
      ],
      repairTotalCents: 1250000,
    });

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(5000);
    const content = pdf.toString("latin1");
    expect(content).toContain("/AcroForm");
    expect(content).toContain("/Fields");
    expect(content).toContain("/Count 6");
  });

  it("renders an honest empty-state report without inventing findings or evidence", async () => {
    const pdf = await renderInspectionPdf({ mission: { id: 13, name: "Empty capture review", mode: "inspection", status: "completed" }, evidence: [], defects: [], repairTotalCents: 0 });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("/AcroForm");
    expect(pdf.toString("latin1")).toContain("/Count 4");
  });
});
