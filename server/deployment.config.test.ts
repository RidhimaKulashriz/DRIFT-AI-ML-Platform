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

  it("keeps the split-host API client pointed at Render when Vercel omits VITE_BACKEND_URL", () => {
    const root = resolve(import.meta.dirname, "..");
    const constants = readFileSync(resolve(root, "client/src/const.ts"), "utf8");
    const main = readFileSync(resolve(root, "client/src/main.tsx"), "utf8");
    expect(constants).toContain('export const DEFAULT_BACKEND_ORIGIN = "https://drift-node-api.onrender.com"');
    expect(constants).toContain("import.meta.env.PROD ? DEFAULT_BACKEND_ORIGIN");
    expect(main).toContain("const backendOrigin = getBackendOrigin();");
    expect(main).not.toContain('const backendOrigin = (import.meta.env.VITE_BACKEND_URL ?? "").replace');
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
    expect(inspectionMap).toContain("tile.openstreetmap.org");
    expect(inspectionMap).toContain("DRIFT real geographic inspection map");
    expect(inspectionMap).toContain("NBI context");
    expect(inspectionMap).toContain("Public third-party imagery only.");
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
    expect(consoleSource).toContain("BROWSER-ONLY AI-ANALYSIS · NO PERSISTENCE");
    expect(consoleSource).toContain("Transient simulator briefing is ready");
    expect(consoleSource).toContain("# DRIFT transient AI-analysis briefing");
    expect(consoleSource).toContain("Numbered temporary advisory register");
    expect(consoleSource).toContain("AI-analysis interpretation");
    expect(consoleSource).toContain("**Persistence:** None. This briefing is held only in the current browser session and is discarded when the session ends.");
    expect(consoleSource).toContain("DOWNLOAD AI-ANALYSIS");
    expect(consoleSource).toContain("DOWNLOAD DEMO PDF");
    expect(consoleSource).toContain("demoPdf");
    expect(consoleSource).toContain("Persistent PDF reports are protected");
    expect(consoleSource).toContain("SIGN IN TO VIEW APPROVED REPORTS");
  });

  it("keeps transient simulator metrics visibly separate from persisted Operations metrics", () => {
    const root = resolve(import.meta.dirname, "..");
    const consoleSource = readFileSync(resolve(root, "client/src/pages/DriftConsole.tsx"), "utf8");
    expect(consoleSource).toContain("TRANSIENT CANDIDATES");
    expect(consoleSource).toContain("TRANSIENT TELEMETRY");
    expect(consoleSource).toContain("PERSISTENT LINKAGE");
    expect(consoleSource).toContain("no asset, evidence, ticket, report, CCTV, security, or UAV action");
  });

  it("keeps KartaView and numbered temporary markers available without treating public imagery as DRIFT evidence", () => {
    const root = resolve(import.meta.dirname, "..");
    const inspectionMap = readFileSync(resolve(root, "client/src/components/InspectionMap.tsx"), "utf8");
    const consoleSource = readFileSync(resolve(root, "client/src/pages/DriftConsole.tsx"), "utf8");
    expect(inspectionMap).toContain("OPEN STREET IMAGE");
    expect(inspectionMap).toContain("KARTAVIEW · STREET-LEVEL IMAGERY");
    expect(inspectionMap).toContain("KartaView could not be reached");
    expect(inspectionMap).toContain("not DRIFT evidence, not a crack confirmation");
    expect(inspectionMap).toContain("Advisory");
    expect(inspectionMap).toContain("colored findings");
    expect(consoleSource).toContain("isTransient: true");
    expect(consoleSource).toContain("scrollIntoView({ behavior: \"smooth\", block: \"center\" })");
  });

  it("gives every temporary report advisory its own map and KartaView inspection action", () => {
    const root = resolve(import.meta.dirname, "..");
    const inspectionMap = readFileSync(resolve(root, "client/src/components/InspectionMap.tsx"), "utf8");
    const consoleSource = readFileSync(resolve(root, "client/src/pages/DriftConsole.tsx"), "utf8");
    expect(consoleSource).toContain("Infrastructure inspection set");
    expect(consoleSource).toContain("VISIBLE LONGITUDINAL RAIL CRACK");
    expect(consoleSource).toContain("VISIBLE CONCRETE SPALLING / EXPOSED REBAR");
    expect(consoleSource).toContain("upload.wikimedia.org");
    expect(consoleSource).not.toContain("TRACK CONDITION REVIEW ZONE · NOT CONFIRMED DAMAGE");
    expect(consoleSource).not.toContain("UNDERSIDE INSPECTION ZONE · NOT CONFIRMED CRACK");
    expect(consoleSource).toContain("transientSimulatorRun.findings.map");
    expect(consoleSource).toContain("View marker + KartaView");
    expect(consoleSource).toContain("inspectTransientAdvisory");
    expect(consoleSource).toContain("imageryRequest={imageryRequest}");
    expect(inspectionMap).toContain("imageryRequest?: number");
    expect(inspectionMap).toContain("completedImageryRequest");
    expect(inspectionMap).toContain("select any marker");
    expect(inspectionMap).toContain("OPEN FULL STREET IMAGE");
    expect(inspectionMap).toContain("Green marker = public street image");
  });

  it("keeps the temporary advisory grid readable by making telemetry optional and focusing the simulated grid", () => {
    const root = resolve(import.meta.dirname, "..");
    const inspectionMap = readFileSync(resolve(root, "client/src/components/InspectionMap.tsx"), "utf8");
    expect(inspectionMap).toContain("const [telemetryVisible, setTelemetryVisible] = useState(false)");
    expect(inspectionMap).toContain("const showTelemetry = telemetryVisible || validDefects.length === 0");
    expect(inspectionMap).toContain("FOCUS 15-POINT GRID");
    expect(inspectionMap).toContain("SHOW ${validTelemetry.length} TELEMETRY");
    expect(inspectionMap).toContain("map.setView([selectedDefect?.point.lat");
    expect(inspectionMap).toContain("map.fitBounds(L.latLngBounds");
  });

  it("allows a personal-email magic-link request without implying protected-role access", () => {
    const root = resolve(import.meta.dirname, "..");
    const signInSource = readFileSync(resolve(root, "client/src/const.ts"), "utf8");
    const consoleSource = readFileSync(resolve(root, "client/src/pages/DriftConsole.tsx"), "utf8");
    expect(signInSource).toContain("Personal email is accepted");
    expect(signInSource).toContain("protected DRIFT roles require separate approval");
    expect(signInSource).not.toContain("approved work email");
    expect(consoleSource).toContain("Sign in with any email. Protected DRIFT roles require separate approval.");
  });

  it("explains Supabase magic-link input, rate-limit, and redirect failures without exposing configuration", () => {
    const root = resolve(import.meta.dirname, "..");
    const supabaseSource = readFileSync(resolve(root, "client/src/lib/supabase.ts"), "utf8");
    const signInSource = readFileSync(resolve(root, "client/src/const.ts"), "utf8");
    expect(supabaseSource).toContain("const emailPattern");
    expect(supabaseSource).toContain("Wait at least 60 seconds before retrying");
    expect(supabaseSource).toContain("Supabase Auth URL Configuration");
    expect(supabaseSource).toContain("A work email is not required");
    expect(signInSource).toContain("magicLinkErrorMessage(error)");
  });

  it("keeps Defect Control, reports, and DRIFT AI usable during an active transient walkthrough", () => {
    const root = resolve(import.meta.dirname, "..");
    const consoleSource = readFileSync(resolve(root, "client/src/pages/DriftConsole.tsx"), "utf8");
    const styleSource = readFileSync(resolve(root, "client/src/index.css"), "utf8");
    expect(consoleSource).toContain("OPEN DRIFT AI");
    expect(consoleSource).toContain("transient-workspace-banner");
    expect(consoleSource).toContain("const displayDefects = transientSimulatorRun ? transientMapDefects : defects");
    expect(consoleSource).toContain("<span className=\"queue-count\">{displayDefects.length}</span>");
    expect(consoleSource).toContain("temporary advisories are available below");
    expect(consoleSource).toContain("SIMULATED · NOT SAVED");
    expect(consoleSource).toContain("No persistent findings in this public session");
    expect(styleSource).toContain(".transient-workspace-banner");
    expect(styleSource).toContain(".transient-defect-row");
    expect(styleSource).toContain(".reports-workspace .report-preview-panel .ai-brief");
  });

  it("keeps public walkthroughs transient even when production persistence is available", () => {
    const root = resolve(import.meta.dirname, "..");
    const consoleSource = readFileSync(resolve(root, "client/src/pages/DriftConsole.tsx"), "utf8");
    const routerSource = readFileSync(resolve(root, "server/routers.ts"), "utf8");
    expect(consoleSource).toContain("const canPersistSimulation = canOperate && persistenceAvailable");
    expect(consoleSource).toContain("RUN PERSISTENT ENGINEERING DEMO");
    expect(consoleSource).toContain("const canRunDemo = true;");
    expect(consoleSource).toContain("OPEN LIVE MAP");
    expect(consoleSource).toContain("scrollIntoView");
    expect(consoleSource).toContain('onClick={() => startLogin()}');
    expect(consoleSource).toContain(">SIGN IN</button>");
    expect(consoleSource).toContain("{transientSimulatorRun && <article className=\"report-preview-panel\">");
    expect(routerSource).toContain("runStatelessSimulator");
    expect(routerSource).toContain("demoPdf");
    expect(routerSource).toContain("renderInspectionPdf");
    expect(routerSource).toContain("transient: true");
    expect(routerSource).toContain("runSimulator: protectedProcedure");
    expect(routerSource).toContain('requireDriftRole(ctx.user, ["admin", "engineer"])');
  });
});
