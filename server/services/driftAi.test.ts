import { afterEach, describe, expect, it, vi } from "vitest";
import { askDriftAi } from "./driftAi";

const context = { missionName: "North span verification", telemetryPoints: 12, evidenceCount: 3, selectedFinding: { id: 101, label: "Deck crack", defectType: "crack", inspectionDomain: "bridges", severity: "critical", reviewState: "pending", zeroErrorScore: 93, confidencePercent: 91, coveragePercent: 78, latitude: "28.6139", longitude: "77.2090", qualityGate: "review", captureZone: "under-bridge" } };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DRIFT AI", () => {
  it("uses a deterministic, evidence-aware fallback when no provider key is configured", async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const result = await askDriftAi("Give me a status snapshot.", context);
    expect(result.source).toBe("deterministic-fallback");
    expect(result.answer).toContain("28.6139, 77.2090");
    expect(result.answer).toContain("Quality gate");
    if (previous) process.env.OPENAI_API_KEY = previous;
  });

  it("routes common questions to distinct grounded answers", async () => {
    const location = await askDriftAi("Where is this finding?", context);
    const severity = await askDriftAi("How serious is this finding?", context);
    const evidence = await askDriftAi("What is the evidence quality?", context);
    const comparison = await askDriftAi("How does this compare with other findings?", { ...context, findings: [{ ...context.selectedFinding, id: 2, label: "Deck joint", severity: "high" }, context.selectedFinding] });
    expect(location.source).toBe("deterministic-intent");
    expect(severity.source).toBe("deterministic-intent");
    expect(evidence.source).toBe("deterministic-intent");
    expect(comparison.source).toBe("deterministic-intent");
    expect(location.answer).toContain("28.6139, 77.2090");
    expect(severity.answer).toContain("critical");
    expect(evidence.answer).toContain("Quality gate");
    expect(comparison.answer).toContain("Historical/comparative context");
    expect(new Set([location.answer, severity.answer, evidence.answer, comparison.answer]).size).toBe(4);
  });

  it("sends bounded inspection context to the server-side provider and returns its answer", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-only-server-secret";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "The coordinate and critical priority require engineer verification." } }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await askDriftAi("Please respond as a concise field note.", context);
    expect(result.source).toBe("openai");
    expect(result.answer).toContain("engineer verification");
    const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { messages: Array<{ content: string }> };
    expect(request.messages[1]?.content).toContain("28.6139");
    expect(request.messages[1]?.content.length).toBeLessThan(13000);
    if (previous) process.env.OPENAI_API_KEY = previous; else delete process.env.OPENAI_API_KEY;
  });

  it("guards unsupported safety and certification claims from the provider", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-only-server-secret";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "The bridge is definitely safe and compliant." } }] }) }));
    const result = await askDriftAi("Provide a general assessment of this inspection context.", context);
    expect(result.answer).toContain("not independently verified as safe");
    expect(result.answer).toContain("not a certification");
    if (previous) process.env.OPENAI_API_KEY = previous; else delete process.env.OPENAI_API_KEY;
  });

  it("falls back when the external AI service is unavailable", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-only-server-secret";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const result = await askDriftAi("Give me a condition snapshot.", context);
    expect(result.source).toBe("deterministic-fallback");
    expect(result.providerStatus).toBe(503);
    if (previous) process.env.OPENAI_API_KEY = previous; else delete process.env.OPENAI_API_KEY;
  });
});
