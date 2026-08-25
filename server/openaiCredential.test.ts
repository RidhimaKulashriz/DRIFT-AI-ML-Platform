import { describe, expect, it } from "vitest";

describe("server-side OpenAI credential", () => {
  it("is accepted by the lightweight models endpoint without exposing the key", async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    expect(apiKey, "OPENAI_API_KEY must be configured for this connectivity check").toBeTruthy();
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
    expect(response.ok).toBe(true);
    const payload = await response.json() as { data?: unknown };
    expect(Array.isArray(payload.data)).toBe(true);
  }, 20_000);
});
