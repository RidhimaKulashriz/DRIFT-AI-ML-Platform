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
    expect(docs).toContain("VITE_SUPABASE_URL");
    expect(docs).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(docs).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(docs).toContain("DRIFT_SUPABASE_STORAGE_ENABLED");
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
    const inspectionMap = readFileSync(resolve(root, "client/src/components/InspectionMap.tsx"), "utf8");
    const html = readFileSync(resolve(root, "client/index.html"), "utf8");
    const viteConfig = readFileSync(resolve(root, "vite.config.ts"), "utf8");
    const consoleSource = readFileSync(resolve(root, "client/src/pages/DriftConsole.tsx"), "utf8");
    expect(inspectionMap).not.toContain("MapView");
    expect(inspectionMap).not.toContain("forge.butterfly-effect.dev");
    expect(inspectionMap).toContain("maps.googleapis.com/maps/api/js");
    expect(inspectionMap).toContain("Google Maps infrastructure context");
    expect(inspectionMap).toContain("Public NBI context only");
    expect(inspectionMap).toContain("Not a DRIFT site, live defect, ticket, or safety determination");
    expect(html).toContain('href="/favicon.svg"');
    expect(html).not.toContain("%VITE_ANALYTICS_ENDPOINT%/umami");
    expect(viteConfig).not.toContain("vite-plugin-manus-runtime");
    expect(viteConfig).not.toContain("vitePluginManusRuntime");
    expect(consoleSource).toContain('workspace !== "evidence" && evidencePreview');
    expect(existsSync(resolve(root, "client/public/favicon.svg"))).toBe(true);
  });

  it("keeps authentic reference visuals and seven contractor-ready USPs outside the project evidence workflow", () => {
    const root = resolve(import.meta.dirname, "..");
    const readinessBoard = readFileSync(resolve(root, "client/src/components/ContractorReadinessBoard.tsx"), "utf8");
    expect(readinessBoard).toContain("7 CONTRACTOR-READY USPs");
    expect((readinessBoard.match(/id: \"(?:provenance|quality|duplicate|dsi|sla|closure|audit)\"/g) ?? [])).toHaveLength(7);
    expect(readinessBoard).toContain("Real images, never site evidence");
    expect(readinessBoard).toContain("excluded from DRIFT assets, maps, tickets, reports, model claims, and closure verification");
    expect(readinessBoard).toContain("Public domain");
    expect(readinessBoard).toContain("U.S. federal government public domain");
  });

  it("bounds the public operational report list without altering the stored history", () => {
    const root = resolve(import.meta.dirname, "..");
    const consoleSource = readFileSync(resolve(root, "client/src/pages/DriftConsole.tsx"), "utf8");
    expect(consoleSource).toContain("const visibleReports = reports.slice(0, 8)");
    expect(consoleSource).toContain("Showing the most recent {visibleReports.length} records");
    expect(consoleSource).toContain("older report record");
  });

  it("keeps hardware security observations unavailable without an approved security adapter", () => {
    const root = resolve(import.meta.dirname, "..");
    const consoleSource = readFileSync(resolve(root, "client/src/pages/DriftConsole.tsx"), "utf8");
    expect(consoleSource).toContain("Security adapter not configured");
    expect(consoleSource).toContain("does not scan camera firmware, traffic, devices, or CCTV feeds");
    expect(consoleSource).toContain("does not claim malware, tamper, or intrusion detection");
    expect(consoleSource).toContain("SECURITY INTEGRATION REQUIRED");
  });

  it("keeps transient simulator briefings browser-only and distinct from stored engineering reports", () => {
    const root = resolve(import.meta.dirname, "..");
    const consoleSource = readFileSync(resolve(root, "client/src/pages/DriftConsole.tsx"), "utf8");
    expect(consoleSource).toContain("BROWSER-ONLY WALKTHROUGH · NO PERSISTENCE");
    expect(consoleSource).toContain("Not an engineering report, not field evidence, not a safety determination");
    expect(consoleSource).toContain("**Persistence:** None. This content is discarded when the page session ends.");
    expect(consoleSource).toContain("BUILD TRANSIENT BRIEFING");
  });

  it("keeps transient simulator metrics visibly separate from persisted Operations metrics", () => {
    const root = resolve(import.meta.dirname, "..");
    const consoleSource = readFileSync(resolve(root, "client/src/pages/DriftConsole.tsx"), "utf8");
    expect(consoleSource).toContain("TRANSIENT CANDIDATES");
    expect(consoleSource).toContain("TRANSIENT TELEMETRY");
    expect(consoleSource).toContain("PERSISTENT LINKAGE");
    expect(consoleSource).toContain("no asset, evidence, ticket, report, CCTV, security, or UAV action");
  });

  it("keeps public walkthroughs transient even when production persistence is available", () => {
    const root = resolve(import.meta.dirname, "..");
    const consoleSource = readFileSync(resolve(root, "client/src/pages/DriftConsole.tsx"), "utf8");
    const routerSource = readFileSync(resolve(root, "server/routers.ts"), "utf8");
    expect(consoleSource).toContain("const canPersistSimulation = canOperate && persistenceAvailable");
    expect(consoleSource).toContain("RUN PERSISTENT ENGINEERING DEMO");
    expect(consoleSource).toContain('onClick={() => startLogin()}');
    expect(consoleSource).toContain(">SIGN IN</button>");
    expect(consoleSource).toContain("{transientSimulatorRun && <article className=\"report-preview-panel\">");
    expect(routerSource).toContain("runSimulator: protectedProcedure");
    expect(routerSource).toContain('requireDriftRole(ctx.user, ["admin", "engineer"])');
  });
});
