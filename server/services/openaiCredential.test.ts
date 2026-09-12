import { describe, expect, it } from "vitest";

describe("DRIFT AI OpenAI credential", () => {
  it.skipIf(process.env.DRIFT_RUN_EXTERNAL_CONNECTIVITY_TESTS !== "true" || !process.env.OPENAI_API_KEY)("can reach the lightweight models endpoint when a server key is configured", async () => {
    const key = process.env.OPENAI_API_KEY;
    expect(key, "OPENAI_API_KEY must be configured server-side").toBeTruthy();
    const response = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
    expect(response.ok, `OpenAI models endpoint returned ${response.status}`).toBe(true);
    const body = await response.json() as { data?: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  }, 15000);
});
