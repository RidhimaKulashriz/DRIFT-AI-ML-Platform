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
import { addTelemetryRecord, createEvidenceRecord, persistInferenceDefect } from "../db";
import { storagePut } from "../storage";
import { authorizeBridgeToken, validateTelemetryPayload } from "../services/hardwareAdapter";
import { runVisionInference } from "../services/mlInference";
import { createCorsMiddleware } from "../services/cors";

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
      const stored = await storagePut(`drift/bridge/missions/${Number(body.missionId)}/${Date.now()}-${safeName}`, bytes, String(body.mimeType));
      const result = await createEvidenceRecord({ missionId: Number(body.missionId), fileName: String(body.fileName), mimeType: String(body.mimeType), storageKey: stored.key, storageUrl: stored.url, mediaKind: body.mediaKind as "photo" | "video", source: "hardware", latitude: typeof body.latitude === "number" ? body.latitude.toFixed(6) : undefined, longitude: typeof body.longitude === "number" ? body.longitude.toFixed(6) : undefined, playbackSeconds: typeof body.playbackSeconds === "number" ? Math.max(0, Math.floor(body.playbackSeconds)) : undefined, cameraId: typeof body.cameraId === "string" ? body.cameraId : undefined, captureZone: typeof body.captureZone === "string" ? body.captureZone : undefined, headingDegrees: typeof body.headingDegrees === "number" ? body.headingDegrees : undefined, provenance: { kind: "operator-uav-capture", inspectionDomain: typeof body.inspectionDomain === "string" ? body.inspectionDomain : undefined, correlationKey: typeof body.correlationKey === "string" ? body.correlationKey : undefined, aircraftProfile: typeof body.aircraftProfile === "string" ? body.aircraftProfile : "operator bridge profile not reported", originalCaptureRequired: true, notSimulator: true } });
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

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
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
