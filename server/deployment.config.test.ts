import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

describe("external deployment artifacts", () => {
  it("keeps Vercel and Render configuration checked in without secrets", () => {
    const root = resolve(import.meta.dirname, "..");
    expect(existsSync(resolve(root, "vercel.json"))).toBe(true);
    expect(existsSync(resolve(root, "render.yaml"))).toBe(true);
    const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as { buildCommand?: string; outputDirectory?: string };
    const docs = readFileSync(resolve(root, "docs/external_hosting.md"), "utf8");
    const render = readFileSync(resolve(root, "render.yaml"), "utf8");
    expect(vercel.buildCommand).toBe("pnpm build");
    expect(vercel.outputDirectory).toBe("dist/public");
    expect(docs).toContain("VITE_BACKEND_URL");
    expect(docs).toContain("DRIFT_INGEST_TOKEN");
    expect(docs).toContain("Provider adapters versus hosting");
    expect(render).toContain("DATABASE_URL");
    expect(render).toContain("FRONTEND_APP_URL");
    expect(render).toContain("DRIFT_ALLOWED_ORIGINS");
    expect(render).toContain("DRIFT_INGEST_TOKEN");
    expect(render).toContain("OPENAI_API_KEY");
    expect(render).not.toMatch(/mysql:\/\/[^\n]+/i);
  });
});
