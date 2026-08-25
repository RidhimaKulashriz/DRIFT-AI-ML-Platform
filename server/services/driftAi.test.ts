import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askDriftAi } from "./driftAi";

const context = { missionName: "North span verification", telemetryPoints: 12, evidenceCount: 3, selectedFinding: { id: 101, label: "Deck crack", defectType: "crack", inspectionDomain: "bridges", severity: "critical", reviewState: "pending", zeroErrorScore: 93, confidencePercent: 91, coveragePercent: 78, latitude: "28.6139", longitude: "77.2090", qualityGate: "review", captureZone: "under-bridge" } };

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
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
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
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
    if (previous) process.env.OPENAI_API_KEY = previous;
  });

  it("normalizes short typo-filled inspection questions", async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const result = await askDriftAi("whre is this critial finding locat?", context);
    expect(result.source).toBe("deterministic-intent");
    expect(result.answer).toContain("28.6139, 77.2090");
    if (previous) process.env.OPENAI_API_KEY = previous;
  });

  it("sends general questions to the provider even when no finding is selected", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-only-server-secret";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "There is no selected finding; provide a mission or evidence record for a grounded answer." } }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await askDriftAi("What can you tell me about this mission?", { missionName: "North span verification", evidenceCount: 3 });
    expect(result.source).toBe("openai");
    expect(result.answer).toContain("no selected finding");
    expect(fetchMock).toHaveBeenCalledOnce();
    if (previous) process.env.OPENAI_API_KEY = previous; else delete process.env.OPENAI_API_KEY;
  });

  it("sends bounded inspection context to the server-side provider and returns its answer", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-only-server-secret";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "The coordinate and critical priority require engineer verification." } }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await askDriftAi("Please respond as a concise field note.", context, [{ role: "user", content: "What changed since the last pass?" }, { role: "assistant", content: "The prior pass had no linked evidence." }]);
    expect(result.source).toBe("openai");
    expect(result.answer).toContain("engineer verification");
    const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { messages: Array<{ content: string }> };
    expect(request.messages[1]?.content).toContain("What changed since the last pass?");
    expect(request.messages[2]?.content).toContain("The prior pass had no linked evidence.");
    expect(request.messages[3]?.content).toContain("28.6139");
    expect(request.messages[3]?.content.length).toBeLessThan(13000);
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

  it("returns a safe question-specific fallback when the provider network fails", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-only-server-secret";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    const result = await askDriftAi("What is the operational context for this inspection?", context);
    expect(result.source).toBe("deterministic-fallback");
    expect(result.providerStatus).toBe("openai-network-error");
    expect(result.answer).toContain("What is the operational context for this inspection?");
    if (previous) process.env.OPENAI_API_KEY = previous; else delete process.env.OPENAI_API_KEY;
  });

  it("labels an OpenAI quota failure distinctly", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-only-server-secret";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const result = await askDriftAi("Can you explain this finding?", context);
    expect(result.source).toBe("deterministic-fallback");
    expect(result.providerStatus).toBe("openai-429");
    expect(result.answer).toContain("OpenAI quota exhausted");
    if (previous) process.env.OPENAI_API_KEY = previous; else delete process.env.OPENAI_API_KEY;
  });

  it("falls back when the external AI service is unavailable", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-only-server-secret";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const result = await askDriftAi("Give me a condition snapshot.", context);
    expect(result.source).toBe("deterministic-fallback");
    expect(result.providerStatus).toBe("openai-503");
    if (previous) process.env.OPENAI_API_KEY = previous; else delete process.env.OPENAI_API_KEY;
  });

  it("prefers Gemini when a server-side Gemini key is configured", async () => {
    process.env.GEMINI_API_KEY = "test-only-gemini-secret";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "Gemini uses the selected mission context." }] } }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await askDriftAi("Summarize the active inspection.", context, [{ role: "user", content: "Keep this concise." }]);
    expect(result.source).toBe("gemini");
    expect(result.model).toBe("gemini-2.5-flash");
    expect(result.providerStatus).toBe("gemini-connected");
    const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { contents: Array<{ role: string; parts: Array<{ text: string }> }> };
    expect(fetchMock.mock.calls[0]?.[0]).toContain("gemini-2.5-flash:generateContent");
    expect(request.contents[0]?.role).toBe("user");
    expect(request.contents[1]?.parts[0]?.text).toContain("28.6139");
  });
});
