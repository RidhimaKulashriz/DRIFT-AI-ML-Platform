export type Severity = "low" | "medium" | "high" | "critical";
export type DefectKind = "pothole" | "crack" | "structural" | "corrosion" | "spalling" | "exposed_rebar" | "water_intrusion" | "settlement" | "rail_alignment" | "obstruction" | "lighting_failure";

export type ScoringInput = {
  defectType: DefectKind;
  confidence: number;
  latitude: number;
  longitude: number;
  priorOpenDefects: number;
  assetCriticality: number;
  observationCount?: number;
};

export type ScoreResult = {
  score: number;
  severity: Severity;
  urgency: string;
  explanation: string[];
  repairEstimateCents: number;
};

const baseRepairCents: Record<DefectKind, number> = { pothole: 180000, crack: 420000, structural: 1250000, corrosion: 680000, spalling: 900000, exposed_rebar: 1100000, water_intrusion: 560000, settlement: 1450000, rail_alignment: 1750000, obstruction: 240000, lighting_failure: 160000 };

export function scoreZeroError(input: ScoringInput): ScoreResult {
  const defectWeight: Record<DefectKind, number> = { pothole: 24, crack: 42, structural: 62, corrosion: 54, spalling: 58, exposed_rebar: 68, water_intrusion: 48, settlement: 72, rail_alignment: 70, obstruction: 36, lighting_failure: 40 };
  const confidencePoints = Math.round(Math.max(0, Math.min(1, input.confidence)) * 22);
  const historyPoints = Math.min(9, input.priorOpenDefects * 3);
  const assetPoints = Math.min(7, Math.max(0, input.assetCriticality - 1) * 2);
  const repeatPoints = Math.min(6, Math.max(0, (input.observationCount ?? 1) - 1) * 2);
  const score = Math.min(100, defectWeight[input.defectType] + confidencePoints + historyPoints + assetPoints + repeatPoints);
  const severity: Severity = score >= 82 ? "critical" : score >= 64 ? "high" : score >= 40 ? "medium" : "low";
  const urgency = severity === "critical" ? "Isolate and dispatch within 4 hours" : severity === "high" ? "Engineer review within 24 hours" : severity === "medium" ? "Plan repair in the next maintenance cycle" : "Monitor and verify on the next pass";
  const explanation = [
    `${Math.round(input.confidence * 100)}% model confidence`,
    `${input.defectType} risk baseline`,
    input.priorOpenDefects > 0 ? `${input.priorOpenDefects} related open defects nearby` : "No related open defects nearby",
    `Asset criticality ${input.assetCriticality}/5`,
  ];

  return {
    score,
    severity,
    urgency,
    explanation,
    repairEstimateCents: Math.round(baseRepairCents[input.defectType] * (1 + score / 250)),
  };
}
