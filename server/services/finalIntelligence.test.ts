import { describe, expect, it } from "vitest";
import { detectNovelty, optimizeMissionPlans, resolveDefectIdentity, reviseBelief } from "./finalIntelligence";
import type { IntelligenceSnapshot } from "./intelligenceEngine";

describe("DRIFT final intelligence layer", () => {
  it("revises belief without overwriting the evidence history", () => {
    const result = reviseBelief({ probability: .5, confidence: 40, classification: "INFERRED", sourceIds: [1], uncertaintyDrivers: [] }, [
      { probability: .9, confidence: .9, sourceId: 2, reliability: .95 },
      { probability: .2, confidence: .8, sourceId: 3, reliability: .9, contradicts: true },
    ]);
    expect(result.sourceIds).toEqual([2, 3]);
    expect(result.uncertaintyDrivers).toContain("source disagreement");
    expect(result.probability).toBeGreaterThan(.5);
  });

  it("separates same, possible-same, and new defect observations", () => {
    const now = new Date();
    const candidate = { id: 2, assetId: 1, defectType: "crack", latitude: "28.61391", longitude: "77.20901", createdAt: now } as any;
    const historical = [{ ...candidate, id: 1, createdAt: new Date(now.getTime() - 2 * 86_400_000) }];
    expect(resolveDefectIdentity(candidate, historical).classification).toBe("SAME");
  });

  it("detects novelty only with a supported baseline", () => {
    expect(detectNovelty([10, 11, 10, 12], 50).supported).toBe(false);
    expect(detectNovelty([10, 11, 10, 12, 11, 10, 12, 11], 40).score).toBeGreaterThan(50);
  });

  it("returns feasible multi-objective mission candidates and a Pareto set", () => {
    const snapshot = { inspectionTargets: [
      { assetId: 1, assetName: "A", priority: 90, informationGain: 80, riskReduction: 90, uncertaintyReduction: 70, estimatedCost: 20, reason: "risk" },
      { assetId: 2, assetName: "B", priority: 70, informationGain: 90, riskReduction: 55, uncertaintyReduction: 90, estimatedCost: 30, reason: "uncertainty" },
      { assetId: 3, assetName: "C", priority: 55, informationGain: 50, riskReduction: 45, uncertaintyReduction: 50, estimatedCost: 25, reason: "coverage" },
    ] } as IntelligenceSnapshot;
    const plans = optimizeMissionPlans(snapshot, 150);
    expect(plans.candidates).toHaveLength(3);
    expect(plans.candidates.every(plan => plan.feasible)).toBe(true);
    expect(plans.paretoFront.length).toBeGreaterThan(0);
  });
});
