import { describe, expect, it } from "vitest";

describe("DRIFT AI Gemini credential", () => {
  it("can reach the Gemini model catalog when a server key is configured", async () => {
    const key = process.env.GEMINI_API_KEY;
    expect(key, "GEMINI_API_KEY must be configured server-side").toBeTruthy();

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key!)}`);
    expect(response.ok, `Gemini model catalog returned ${response.status}`).toBe(true);

    const body = await response.json() as { models?: unknown[] };
    expect(Array.isArray(body.models)).toBe(true);
  }, 15000);
});
