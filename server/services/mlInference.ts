import { z } from "zod";
import { scoreZeroError, type DefectKind } from "./scoring";

export type InferenceInput = {
  fileName: string;
  latitude: number;
  longitude: number;
  assetCriticality: number;
  priorOpenDefects: number;
  demo?: boolean;
  imageBase64?: string;
  inspectionDomain?: string;
  captureZone?: string;
};

export type InferenceResult = {
  model: string;
  label: DefectKind;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  severityInput: Record<string, number>;
  score: ReturnType<typeof scoreZeroError>;
  annotationNote: string;
  source: "production-cv" | "deterministic-fallback";
  coveragePercent: number;
  uncertainty: { reason: string; requiresHumanReview: boolean };
  calibrationVersion: string;
};

const cvResponseSchema = z.object({
  model: z.string().min(1).max(200),
  label: z.enum(["pothole", "crack", "structural", "corrosion", "spalling", "exposed_rebar", "water_intrusion", "settlement", "rail_alignment", "obstruction", "lighting_failure"]),
  confidence: z.number().min(0).max(1),
  boundingBox: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100), width: z.number().min(0).max(100), height: z.number().min(0).max(100) }),
  coveragePercent: z.number().int().min(0).max(100).optional(),
  uncertainty: z.object({ reason: z.string().max(500), requiresHumanReview: z.boolean() }).optional(),
  calibrationVersion: z.string().max(80).optional(),
});

function calibrateConfidence(raw: number, input: InferenceInput) {
  const zonePenalty = input.captureZone === "low-light" || input.captureZone === "confined" ? 0.14 : input.captureZone === "under-bridge" || input.captureZone === "tunnel" ? 0.07 : 0;
  return Math.max(0.05, Math.min(0.99, raw - zonePenalty));
}

function fallbackInference(input: InferenceInput): InferenceResult {
  const normalized = input.fileName.toLowerCase();
  const label: DefectKind = normalized.includes("corrosion") || normalized.includes("rust") ? "corrosion" : normalized.includes("spall") ? "spalling" : normalized.includes("rebar") ? "exposed_rebar" : normalized.includes("water") || normalized.includes("leak") ? "water_intrusion" : normalized.includes("settle") || normalized.includes("subsidence") ? "settlement" : normalized.includes("rail") || input.inspectionDomain === "railways" ? "rail_alignment" : normalized.includes("light") || input.inspectionDomain === "lighting" ? "lighting_failure" : normalized.includes("obstruct") ? "obstruction" : normalized.includes("crack") ? "crack" : normalized.includes("struct") || normalized.includes("bridge") || input.inspectionDomain === "bridges" ? "structural" : "pothole";
  const seed = Array.from(input.fileName).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const confidence = calibrateConfidence(Math.min(0.97, 0.76 + (seed % 20) / 100), input);
  const score = scoreZeroError({ defectType: label, confidence, latitude: input.latitude, longitude: input.longitude, assetCriticality: input.assetCriticality, priorOpenDefects: input.priorOpenDefects, observationCount: 1 + (seed % 3) });
  return { model: input.demo ? "DRIFT-CV simulator adapter v1" : "DRIFT-CV deterministic fallback v1", label, confidence, boundingBox: { x: 18 + (seed % 22), y: 20 + (seed % 17), width: 38, height: 29 }, severityInput: { confidence, assetCriticality: input.assetCriticality, priorOpenDefects: input.priorOpenDefects }, score, annotationNote: `Detected ${label} candidate from ${input.demo ? "reproducible simulator evidence" : "fallback inference"}; manual engineer review is required before work-order release.`, source: "deterministic-fallback", coveragePercent: input.captureZone === "confined" || input.captureZone === "low-light" ? 35 : 72, uncertainty: { reason: "Single-frame visual inference without calibrated site baseline; zone and coverage penalties applied", requiresHumanReview: true }, calibrationVersion: "DRIFT-calibration-v1" };
}

async function callProductionCv(input: InferenceInput): Promise<z.infer<typeof cvResponseSchema> | null> {
  // Never contact an implicit or stale deployment. Production CV is opt-in through
  // an explicitly configured endpoint; otherwise the deterministic fallback is
  // immediate and remains available for local tests, demos, and offline operation.
  const endpoint = process.env.ML_INFERENCE_URL?.trim();
  if (!endpoint || !input.imageBase64 || input.demo) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", accept: "application/json", ...(process.env.ML_INFERENCE_TOKEN ? { authorization: `Bearer ${process.env.ML_INFERENCE_TOKEN}` } : {}) },
      body: JSON.stringify({ imageBase64: input.imageBase64, fileName: input.fileName, confidence: 0.55, imgsz: 960 }),
    });
    if (!response.ok) {
      console.error("[ML] Production CV HTTP error:", response.status);
      return null;
    }
    const raw = await response.json() as any;
    // Accept the canonical DRIFT envelope and the flat production-CV contract.
    if (raw && typeof raw.model === "string" && typeof raw.label === "string" && typeof raw.confidence === "number" && raw.boundingBox) {
      const parsed = cvResponseSchema.safeParse({ model: raw.model, label: mapDefectLabel(raw.label), confidence: raw.confidence, boundingBox: raw.boundingBox, coveragePercent: raw.coveragePercent, uncertainty: raw.uncertainty, calibrationVersion: raw.calibrationVersion });
      if (parsed.success) return parsed.data;
    }
    // Hitakshi's server returns { success, detections: [{model, label, confidence, boundingBox, severity}] }
    if (raw && raw.success && Array.isArray(raw.detections) && raw.detections.length > 0) {
      // Take the highest-confidence detection
      const best = raw.detections.sort((a: any, b: any) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
      const mappedLabel = mapDefectLabel(best.label);
      return {
        model: raw.model || best.model || "hitakshi-ml",
        label: mappedLabel,
        confidence: typeof best.confidence === "number" ? best.confidence : 0.5,
        boundingBox: best.boundingBox || { x: 10, y: 10, width: 30, height: 30 },
        coveragePercent: 85,
        uncertainty: { reason: "Hitakshi multi-model pipeline (CRACK+ROAD+RAILWAY+RUST)", requiresHumanReview: true },
        calibrationVersion: "hitakshi-v1",
      };
    }
    return null;
  } catch (err) {
    console.error("[ML] Production CV error:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Map Hitakshi's labels to DRIFT defect types */
function mapDefectLabel(label: string): DefectKind {
  const l = label.toLowerCase();
  const map: Record<string, DefectKind> = {
    crack: "crack", cracks: "crack",
    pothole: "pothole", potholes: "pothole",
    corrosion: "corrosion", rust: "corrosion",
    spalling: "spalling",
    exposed_rebar: "exposed_rebar",
    water_intrusion: "water_intrusion",
    settlement: "settlement",
    rail_alignment: "rail_alignment",
    obstruction: "obstruction",
    lighting_failure: "lighting_failure",
    structural: "structural",
  };
  return map[l] || "crack";
}

export async function runVisionInference(input: InferenceInput): Promise<InferenceResult> {
  const production = await callProductionCv(input);
  if (!production) return fallbackInference(input);
  const calibratedConfidence = calibrateConfidence(production.confidence, input);
  const score = scoreZeroError({ defectType: production.label, confidence: calibratedConfidence, latitude: input.latitude, longitude: input.longitude, assetCriticality: input.assetCriticality, priorOpenDefects: input.priorOpenDefects, observationCount: 1 });
  return { ...production, confidence: calibratedConfidence, coveragePercent: production.coveragePercent ?? 72, uncertainty: production.uncertainty ?? { reason: "Model response omitted uncertainty metadata; server calibration applied", requiresHumanReview: true }, calibrationVersion: production.calibrationVersion ?? "DRIFT-calibration-v1", severityInput: { confidence: calibratedConfidence, assetCriticality: input.assetCriticality, priorOpenDefects: input.priorOpenDefects }, score, annotationNote: `Detected ${production.label} candidate using ${production.model}; ZeroError prioritization is advisory and requires human review.`, source: "production-cv" };
}
