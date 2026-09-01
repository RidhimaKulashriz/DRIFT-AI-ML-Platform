/**
 * Overall Priority Scoring System
 *
 * Overall Priority = Defect Severity + ML Confidence + Traffic Impact + Sensor Anomaly + Infrastructure Importance
 *
 * This is a rule-based scoring system that can be replaced with ML-based scoring later.
 */

export type PriorityInput = {
  /** Defect severity score (0-100) */
  defectSeverity: number;
  /** ML model confidence (0-1) */
  mlConfidence: number;
  /** Traffic density impact score (0-30) */
  trafficImpact: number;
  /** Vibration sensor anomaly contribution (0-40) */
  sensorAnomaly: number;
  /** Infrastructure criticality (1-5) */
  infrastructureCriticality: number;
};

export type PriorityResult = {
  /** Overall score 0-100 */
  overallScore: number;
  priorityLevel: "critical" | "high" | "moderate" | "low";
  repairCostEstimateINR: number;
  recommendedDeadline: string;
  breakdown: {
    defectSeverity: number;
    mlConfidence: number;
    trafficImpact: number;
    sensorAnomaly: number;
    infrastructureImportance: number;
  };
};

const baseRepairCost: Record<string, number> = {
  pothole: 18000,
  crack: 42000,
  structural: 125000,
  corrosion: 68000,
  spalling: 90000,
  exposed_rebar: 110000,
  water_intrusion: 56000,
  settlement: 145000,
  rail_alignment: 175000,
  obstruction: 24000,
  lighting_failure: 16000,
};

const severityMultiplier: Record<string, number> = {
  critical: 2.5,
  high: 1.8,
  moderate: 1.2,
  low: 1.0,
};

/**
 * Calculate overall priority score and repair estimates.
 */
export function calculateOverallPriority(
  input: PriorityInput,
  defectType: string = "structural",
  sensorPriorityContribution: number = 0,
): PriorityResult {
  // Weighted scoring formula
  const defectSeverityScore = Math.min(30, (input.defectSeverity / 100) * 30);
  const mlConfidenceScore = Math.min(20, input.mlConfidence * 20);
  const trafficScore = Math.min(25, input.trafficImpact);
  const sensorScore = Math.min(15, input.sensorAnomaly + sensorPriorityContribution);
  const infraScore = Math.min(10, (input.infrastructureCriticality / 5) * 10);

  const overallScore = Math.round(
    defectSeverityScore + mlConfidenceScore + trafficScore + sensorScore + infraScore,
  );

  let priorityLevel: PriorityResult["priorityLevel"];
  if (overallScore >= 80) priorityLevel = "critical";
  else if (overallScore >= 60) priorityLevel = "high";
  else if (overallScore >= 35) priorityLevel = "moderate";
  else priorityLevel = "low";

  const baseCost = baseRepairCost[defectType] ?? 50000;
  const multiplier = severityMultiplier[priorityLevel] ?? 1.0;
  const repairCostEstimateINR = Math.round(baseCost * multiplier);

  let recommendedDeadline: string;
  switch (priorityLevel) {
    case "critical":
      recommendedDeadline = "Within 4 hours — Emergency dispatch required";
      break;
    case "high":
      recommendedDeadline = "Within 24 hours — Engineer review and contractor mobilization";
      break;
    case "moderate":
      recommendedDeadline = "Within 7 days — Schedule repair in next maintenance cycle";
      break;
    default:
      recommendedDeadline = "Within 30 days — Monitor and verify on next inspection pass";
  }

  return {
    overallScore,
    priorityLevel,
    repairCostEstimateINR,
    recommendedDeadline,
    breakdown: {
      defectSeverity: Math.round(defectSeverityScore),
      mlConfidence: Math.round(mlConfidenceScore),
      trafficImpact: Math.round(trafficScore),
      sensorAnomaly: Math.round(sensorScore),
      infrastructureImportance: Math.round(infraScore),
    },
  };
}

/**
 * Format repair cost as Indian Rupees.
 */
export function formatRepairCost(cents: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(cents);
}
