import { describe, expect, it, vi } from "vitest";
import type { ScoreResult } from "./services/scoring";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockRejectedValue(new Error("LLM service unavailable")),
}));

const { generateDecisionNarrative } = await import("./services/aiDecision");

const score: ScoreResult = {
  score: 92,
  severity: "critical",
  urgency: "Immediate engineer review required.",
  explanation: ["structural risk", "high asset criticality"],
  repairEstimateCents: 185000,
};

describe("DRIFT AI decision-support fallback", () => {
  it("returns deterministic advisory text and requires manual review when AI is unavailable", async () => {
    const result = await generateDecisionNarrative({ defectType: "structural", location: "28.6139, 77.2090", missionName: "North span patrol", score });

    expect(result.maintenanceDirective).toBe(score.urgency);
    expect(result.engineeringNarrative).toContain("ZeroError score is 92/100");
    expect(result.manualReviewRequired).toBe(true);
    expect(result.confidenceNote).toMatch(/engineer must verify or override/i);
  });
});
