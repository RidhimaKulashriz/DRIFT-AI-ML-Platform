import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { addTelemetryRecord, createEvidenceRecord, getDatabaseAttachment, persistInferenceDefect, ensureCampusSchema } from "../db";
import { storagePutWithFallback } from "../storage";
import { authorizeBridgeToken, validateTelemetryPayload } from "../services/hardwareAdapter";
import { runVisionInference } from "../services/mlInference";
import { createCorsMiddleware } from "../services/cors";
import { runDemoDetection } from "../demoDetection";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(createCorsMiddleware());
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  const bridgeRateWindows = new Map<string, { count: number; resetAt: number }>();
  const bridgeAuthorized = (req: express.Request) => {
    const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const token = bearer ?? req.header("x-drift-ingest-token");
    if (!authorizeBridgeToken(token)) return false;
    const now = Date.now();
    const current = bridgeRateWindows.get(token!);
    if (!current || current.resetAt <= now) bridgeRateWindows.set(token!, { count: 1, resetAt: now + 60_000 });
    else if (current.count >= 120) return false;
    else current.count += 1;
    return true;
  };

  app.post("/api/drift/telemetry", async (req, res) => {
    if (!bridgeAuthorized(req)) return res.status(401).json({ error: "Bridge authentication required." });
    const validation = validateTelemetryPayload(req.body);
    if (!validation.valid || !validation.value) return res.status(400).json({ error: validation.message });
    try {
      const result = await addTelemetryRecord(validation.value);
      return res.status(201).json({ ...result, acceptedAt: Date.now() });
    } catch (error) {
      console.error("[DRIFT] Telemetry ingestion failed", error);
      return res.status(503).json({ error: "Telemetry could not be persisted." });
    }
  });

  // Public demo detection endpoint — no auth required
  app.post("/api/drift/demo-detect", async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const { defectType, confidence, latitude, longitude, infrastructureType, imageUrl, sensorContribution } = body as {
      defectType?: string; confidence?: number; latitude?: number; longitude?: number;
      infrastructureType?: string; imageUrl?: string; sensorContribution?: number;
    };
    if (!defectType || typeof confidence !== "number" || typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({ error: "Missing required fields: defectType, confidence, latitude, longitude" });
    }
    try {
      const result = await runDemoDetection({
        defectType, confidence, latitude, longitude,
        infrastructureType: infrastructureType ?? "roads",
        imageUrl,
        sensorContribution: sensorContribution ?? 0,
      });
      return res.status(201).json(result);
    } catch (error) {
      console.error("[DRIFT] Demo detection failed:", error);
      return res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/drift/evidence", async (req, res) => {
    if (!bridgeAuthorized(req)) return res.status(401).json({ error: "Bridge authentication required." });
    const body = req.body as Record<string, unknown>;
    const required = ["missionId", "fileName", "mimeType", "base64", "mediaKind"];
    const missing = required.filter(key => body[key] === undefined);
    if (missing.length) return res.status(400).json({ error: `Missing evidence fields: ${missing.join(", ")}` });
    if (!Number.isInteger(body.missionId) || Number(body.missionId) <= 0 || typeof body.fileName !== "string" || typeof body.mimeType !== "string" || typeof body.base64 !== "string" || !["photo", "video"].includes(String(body.mediaKind))) return res.status(400).json({ error: "Evidence payload is invalid." });
    const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "video/mp4", "video/webm", "video/quicktime"]);
    const base64Payload = String(body.base64);
    const hasSafeDataUri = /^data:(?:image|video)\/[a-z0-9.+-]+;base64,/i.test(base64Payload);
    const encodedPayload = hasSafeDataUri ? base64Payload.split(",").slice(1).join(",") : base64Payload;
    if (!allowedMimeTypes.has(String(body.mimeType).toLowerCase()) || !/^[A-Za-z0-9+/=\s]+$/.test(encodedPayload)) return res.status(400).json({ error: "Only supported image/video media and base64 payloads are accepted." });
    const bytes = Buffer.from(encodedPayload, "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > 50 * 1024 * 1024) return res.status(413).json({ error: "Evidence must be between 1 byte and 50 MB." });
    try {
      const safeName = String(body.fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
      const stored = await storagePutWithFallback(`drift/bridge/missions/${Number(body.missionId)}/${Date.now()}-${safeName}`, bytes, String(body.mimeType));
      const result = await createEvidenceRecord({ missionId: Number(body.missionId), fileName: String(body.fileName), mimeType: String(body.mimeType), storageKey: stored.key, storageUrl: stored.url, attachmentData: stored.attachmentData, mediaKind: body.mediaKind as "photo" | "video", source: "hardware", latitude: typeof body.latitude === "number" ? body.latitude.toFixed(6) : undefined, longitude: typeof body.longitude === "number" ? body.longitude.toFixed(6) : undefined, playbackSeconds: typeof body.playbackSeconds === "number" ? Math.max(0, Math.floor(body.playbackSeconds)) : undefined, cameraId: typeof body.cameraId === "string" ? body.cameraId : undefined, captureZone: typeof body.captureZone === "string" ? body.captureZone : undefined, headingDegrees: typeof body.headingDegrees === "number" ? body.headingDegrees : undefined, provenance: { kind: "operator-uav-capture", inspectionDomain: typeof body.inspectionDomain === "string" ? body.inspectionDomain : undefined, correlationKey: typeof body.correlationKey === "string" ? body.correlationKey : undefined, aircraftProfile: typeof body.aircraftProfile === "string" ? body.aircraftProfile : "operator bridge profile not reported", originalCaptureRequired: true, notSimulator: true } });
      if (body.runInference === true && body.mediaKind === "photo" && typeof body.assetId === "number" && typeof body.assetCriticality === "number" && typeof body.latitude === "number" && typeof body.longitude === "number") {
        const inference = await runVisionInference({ fileName: String(body.fileName), imageBase64: base64Payload, latitude: body.latitude, longitude: body.longitude, assetCriticality: body.assetCriticality, priorOpenDefects: typeof body.priorOpenDefects === "number" ? body.priorOpenDefects : 0, inspectionDomain: typeof body.inspectionDomain === "string" ? body.inspectionDomain : undefined, captureZone: typeof body.captureZone === "string" ? body.captureZone : undefined });
        const defect = await persistInferenceDefect({ missionId: Number(body.missionId), assetId: body.assetId, evidenceId: result.id, latitude: body.latitude, longitude: body.longitude, inference, inspectionDomain: typeof body.inspectionDomain === "string" ? body.inspectionDomain : undefined, correlationKey: typeof body.correlationKey === "string" ? body.correlationKey : undefined });
        return res.status(201).json({ ...result, inference: defect, qualityGate: { status: "review", action: "engineer-review-required" } });
      }
      return res.status(201).json({ ...result, inference: null });
    } catch (error) {
      console.error("[DRIFT] Evidence ingestion failed", error);
      return res.status(503).json({ error: "Evidence could not be stored." });
    }
  });

  app.get("/api/drift/attachments/*", async (req, res) => {
    const key = decodeURIComponent((req.params as Record<string, string>)[0] ?? "");
    if (!key.startsWith("db:")) return res.status(404).send("Attachment not found");
    try {
      const attachment = await getDatabaseAttachment(key);
      if (!attachment) return res.status(404).send("Attachment not found");
      const safeFileName = attachment.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
      res.set({ "Content-Type": attachment.mimeType, "Content-Disposition": `inline; filename=\"${safeFileName}\"`, "Cache-Control": "private, no-store" });
      return res.send(attachment.data);
    } catch (error) {
      console.error("[DRIFT] Database attachment read failed", error);
      return res.status(503).send("Attachment unavailable");
    }
  });

  // PHASE 10/14/15: Apply campus schema + seed IGDTUW + IIIT-Delhi on startup
  await ensureCampusSchema();

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // PHASE 77: Health endpoint with dependency checks
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString(), service: "drift-api" });
  });

  app.get("/health/dependencies", async (_req, res) => {
    const checks: Record<string, { ok: boolean; detail: string }> = {};

    // Database
    try {
      const { getDb } = await import("../db");
      const db = await getDb();
      checks.database = { ok: Boolean(db), detail: db ? "connected" : "DATABASE_URL is not configured" };
    } catch (e) {
      checks.database = { ok: false, detail: String(e instanceof Error ? e.message : e) };
    }

    // Supabase
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    checks.supabase = { ok: Boolean(supabaseUrl), detail: supabaseUrl ? "configured" : "SUPABASE_URL is not configured" };

    // Email
    const webhook = process.env.DRIFT_EMAIL_WEBHOOK_URL?.trim();
    const smtp = process.env.EMAIL_USER && process.env.EMAIL_PASS;
    checks.email = webhook || smtp
      ? { ok: true, detail: webhook ? "webhook configured" : "Gmail SMTP configured" }
      : { ok: false, detail: "No email provider configured (set DRIFT_EMAIL_WEBHOOK_URL or EMAIL_USER+EMAIL_PASS)" };

    // ML inference
    const mlUrl = process.env.ML_INFERENCE_URL?.trim();
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    checks.ml_inference = mlUrl
      ? { ok: true, detail: `external inference URL configured: ${new URL(mlUrl).host}` }
      : geminiKey
        ? { ok: true, detail: "Gemini vision configured (server-side only)" }
        : { ok: false, detail: "Not configured. Set ML_INFERENCE_URL or GEMINI_API_KEY. Fallback uses deterministic mock." };

    // Hardware bridge
    const ingestToken = process.env.DRIFT_INGEST_TOKEN?.trim();
    checks.drone_bridge = { ok: Boolean(ingestToken), detail: ingestToken ? "token configured" : "DRIFT_INGEST_TOKEN is not configured" };

    const allOk = Object.values(checks).every(c => c.ok);
    res.status(allOk ? 200 : 503).json({ status: allOk ? "healthy" : "degraded", timestamp: new Date().toISOString(), checks });
  });
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
