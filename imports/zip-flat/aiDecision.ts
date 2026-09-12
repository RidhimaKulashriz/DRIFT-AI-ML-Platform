import { invokeLLM } from "../_core/llm";
import type { ScoreResult } from "./scoring";

export type DecisionNarrative = {
  maintenanceDirective: string;
  engineeringNarrative: string;
  manualReviewRequired: boolean;
  confidenceNote: string;
};

export async function generateDecisionNarrative(input: {
  defectType: string;
  location: string;
  score: ScoreResult;
  missionName: string;
}): Promise<DecisionNarrative> {
  const deterministic: DecisionNarrative = {
    maintenanceDirective: input.score.urgency,
    engineeringNarrative: `${input.defectType} was detected during ${input.missionName} at ${input.location}. The ZeroError score is ${input.score.score}/100 (${input.score.severity}). Priority is driven by ${input.score.explanation.join(", ")}. Confirm the evidence and field conditions before issuing work orders.`,
    manualReviewRequired: true,
    confidenceNote: "Decision support is advisory. An authorised engineer must verify or override the priority.",
  };

  try {
    const response = await invokeLLM({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "You are a civil-infrastructure decision-support assistant. Return concise, cautious operational text only. Never state that an automated result is final or safe without engineer review." },
        { role: "user", content: `Create a maintenance directive and an engineering report narrative for ${input.defectType} at ${input.location}. Mission: ${input.missionName}. Score: ${input.score.score}/100. Severity: ${input.score.severity}. Factors: ${input.score.explanation.join("; ")}. Required urgency: ${input.score.urgency}.` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "drift_decision_narrative",
          strict: true,
          schema: {
            type: "object",
            properties: {
              maintenanceDirective: { type: "string" },
              engineeringNarrative: { type: "string" },
              manualReviewRequired: { type: "boolean" },
              confidenceNote: { type: "string" },
            },
            required: ["maintenanceDirective", "engineeringNarrative", "manualReviewRequired", "confidenceNote"],
            additionalProperties: false,
          },
        },
      },
      max_tokens: 700,
    });
    const content = response.choices[0]?.message?.content;
    if (typeof content === "string") {
      const parsed: unknown = JSON.parse(content);
      if (parsed && typeof parsed === "object") {
        const value = parsed as Record<string, unknown>;
        if (typeof value.maintenanceDirective === "string" && typeof value.engineeringNarrative === "string" && typeof value.confidenceNote === "string") return { maintenanceDirective: value.maintenanceDirective, engineeringNarrative: value.engineeringNarrative, manualReviewRequired: true, confidenceNote: value.confidenceNote };
      }
    }
  } catch (error) {
    console.warn("[DRIFT AI] Falling back to deterministic narrative:", error);
  }
  return deterministic;
}
