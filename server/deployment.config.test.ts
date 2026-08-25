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

  it("uses externally accessible source media for the labelled public dataset demonstration", () => {
    const root = resolve(import.meta.dirname, "..");
    const consoleSource = readFileSync(resolve(root, "client/src/pages/DriftConsole.tsx"), "utf8");
    expect(consoleSource).toContain("raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset");
    expect(consoleSource).toContain("1097248_DF_070_070BDF0010_04158_RAW.jpg");
    expect(consoleSource).toContain("1097248_DF_070_070BDF0010_04158_CRACK.png");
    expect(consoleSource).not.toContain("/manus-storage/brazil-road-defect");
  });

  it("keeps the Vercel map surface independent of the Manus Forge proxy and serves a favicon", () => {
    const root = resolve(import.meta.dirname, "..");
    const driftMap = readFileSync(resolve(root, "client/src/components/DriftMap.tsx"), "utf8");
    const html = readFileSync(resolve(root, "client/index.html"), "utf8");
    const viteConfig = readFileSync(resolve(root, "vite.config.ts"), "utf8");
    const consoleSource = readFileSync(resolve(root, "client/src/pages/DriftConsole.tsx"), "utf8");
    expect(driftMap).not.toContain("MapView");
    expect(driftMap).not.toContain("forge.butterfly-effect.dev");
    expect(driftMap).toContain("Coordinate geospatial defect map");
    expect(html).toContain('href="/favicon.svg"');
    expect(html).not.toContain("%VITE_ANALYTICS_ENDPOINT%/umami");
    expect(viteConfig).not.toContain("vite-plugin-manus-runtime");
    expect(viteConfig).not.toContain("vitePluginManusRuntime");
    expect(consoleSource).toContain('workspace !== "evidence" && evidencePreview');
    expect(existsSync(resolve(root, "client/public/favicon.svg"))).toBe(true);
  });
});
