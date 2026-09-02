#!/usr/bin/env node
/**
 * DRIFT Bridge — DJI Mini 3 Pro → Laptop → Backend
 *
 * Run this on your laptop while the drone is connected via DJI Fly app:
 *
 *   node tools/dji-export-to-drift.mjs --backend https://drift-node-api.onrender.com \
 *     --token drift_ingest_2026_secure \
 *     --mission-id 1
 *
 * How it works:
 *   1. DJI Mini 3 Pro streams video via the DJI Fly mobile app
 *   2. You can save photos/videos from the DJI Fly app to a watched folder
 *   3. This script watches that folder for new media
 *   4. For each new photo: reads GPS from EXIF, sends to backend via /api/drift/evidence
 *   5. Backend runs ML inference and maps the defect with contractor assignment
 *   6. Results appear on the frontend map in real-time
 */

import fs from "fs";
import path from "path";
import { parse } from "exifr";
import chokidar from "chokidar";
import https from "https";
import { Command } from "commander";
import mime from "mime-types";

// ─── Defaults ──────────────────────────────────────────────────────────────
const DEFAULT_BACKEND = "https://drift-node-api.onrender.com";
const DEFAULT_TOKEN = "drift_ingest_2026_secure";
const DEFAULT_MISSION_ID = 1;
const DEFAULT_WATCH_DIR = path.join(process.cwd(), "drift-media");

// ─── Types ───────────────────────────────────────────────────────────────────
type GpsCoords = { latitude: number; longitude: number };
type ExifData = {
  Latitude?: number;
  Longitude?: number;
  GPSLatitude?: number;
  GPSLongitude?: number;
  GPSLatitudeRef?: string;
  GPSLongitudeRef?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function extractGps(exif: ExifData): GpsCoords | null {
  // DD format (already decimal)
  if (typeof exif.Latitude === "number" && typeof exif.Longitude === "number") {
    return { latitude: exif.Latitude, longitude: exif.Longitude };
  }
  // DMS format
  if (typeof exif.GPSLatitude === "number" && typeof exif.GPSLongitude === "number") {
    return {
      latitude: exif.GPSLatitudeRef === "S" ? -exif.GPSLatitude : exif.GPSLatitude,
      longitude: exif.GPSLongitudeRef === "W" ? -exif.GPSLongitude : exif.GPSLongitude,
    };
  }
  return null;
}

async function getFileBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) reject(err);
      else resolve(data.toString("base64"));
    });
  });
}

function distanceCheck(coords: GpsCoords, igdtuw: GpsCoords, iiitd: GpsCoords): string {
  const degToKm = (deg: number) => deg * 111;

  const distIgdtuw = Math.sqrt(
    Math.pow(coords.latitude - igdtuw.latitude, 2) + Math.pow(coords.longitude - igdtuw.longitude, 2)
  );
  const distIiitd = Math.sqrt(
    Math.pow(coords.latitude - iiitd.latitude, 2) + Math.pow(coords.longitude - iiitd.longitude, 2)
  );

  // threshold: ~2km (0.018 degrees)
  if (distIgdtuw < 0.018) return "IGDTUW";
  if (distIiitd < 0.018) return "IIIT-Delhi";
  return "Corridor";
}

function sendEvidence(args: {
  backend: string;
  token: string;
  missionId: number;
  fileName: string;
  mimeType: string;
  base64: string;
  mediaKind: "photo" | "video";
  latitude: number;
  longitude: number;
  altitude: number;
  timestamp: number;
  batteryPercent: number;
  cameraId: string;
}): Promise<{ status: number; body: any }> {
  const payload = JSON.stringify({
    missionId: args.missionId,
    fileName: args.fileName,
    mimeType: args.mimeType,
    base64: `data:${args.mimeType};base64,${args.base64}`,
    mediaKind: args.mediaKind,
    latitude: args.latitude,
    longitude: args.longitude,
    altitude: args.altitude,
    timestamp: args.timestamp,
    batteryPercent: args.batteryPercent,
    cameraId: args.cameraId,
    inspectionDomain: "roads",
    aircraftProfile: "DJI Mini 3 Pro",
    captureZone: "oblique",
    runInference: true,
    assetId: args.latitude > 28.6 ? 10 : 9,
    assetCriticality: 3,
    priorOpenDefects: 0,
    correlationKey: `dji-bridge:${args.missionId}:${Date.now()}`,
  });

  const url = new URL(args.backend);
  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: url.port || 443,
    path: "/api/drift/evidence",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.token}`,
      "Content-Length": Buffer.byteLength(payload),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: data });
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function sendTelemetry(args: {
  backend: string;
  token: string;
  missionId: number;
  latitude: number;
  longitude: number;
  altitude: number;
  speedMps: number;
  batteryPercent: number;
}): Promise<{ status: number; body: any }> {
  const payload = JSON.stringify({
    missionId: args.missionId,
    latitude: args.latitude,
    longitude: args.longitude,
    altitude: args.altitude,
    speedMps: args.speedMps,
    batteryPercent: args.batteryPercent,
    timestamp: Date.now(),
  });

  const url = new URL(args.backend);
  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: url.port || 443,
    path: "/api/drift/telemetry",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.token}`,
      "Content-Length": Buffer.byteLength(payload),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: data });
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────
const program = new Command();
program
  .name("dji-export-to-drift")
  .description("Bridge DJI Mini 3 Pro media to the DRIFT backend")
  .option("--backend <url>", "Backend API URL", DEFAULT_BACKEND)
  .option("--token <token>", "DRIFT ingest token", DEFAULT_TOKEN)
  .option("--mission-id <n>", "Mission ID", String(DEFAULT_MISSION_ID))
  .option("--watch-dir <path>", "Folder to watch for new photos", DEFAULT_WATCH_DIR)
  .option("--camera-id <id>", "Camera identifier", "DJI Mini 3 Pro")
  .parse(process.argv);

const opts = program.opts();
const backend = opts.backend ?? DEFAULT_BACKEND;
const token = opts.token ?? DEFAULT_TOKEN;
const missionId = Number(opts.missionId ?? DEFAULT_MISSION_ID);
const watchDir = path.resolve(opts.watchDir ?? DEFAULT_WATCH_DIR);

const igdtuwCoords = { latitude: 28.6876, longitude: 77.21 };
const iiitdCoords = { latitude: 28.5449, longitude: 77.275 };

console.log("┌────────────────────────────────────────────────┐");
console.log("│  DRIFT Bridge — DJI Mini 3 Pro → Backend     │");
console.log("├────────────────────────────────────────────────┤");
console.log(`│  Backend:  ${backend}`);
console.log(`│  Mission:  #${missionId}`);
console.log(`│  Watch:    ${watchDir}`);
console.log(`│  Token:    ${token.substring(0, 4)}...${"*".repeat(token.length - 8)}`);
console.log("└────────────────────────────────────────────────┘");
console.log("");
console.log("📁 Ensure DJI Fly app saves photos to the watched folder.");
console.log("📡 New photos will be auto-sent to the backend with GPS + ML inference.");
console.log("🗺️  Defects will appear on the map with contractor assignment (Manu=IGDTUW, Ridhima=IIIT-Delhi).");
console.log("");

// Ensure watch dir exists
if (!fs.existsSync(watchDir)) {
  fs.mkdirSync(watchDir, { recursive: true });
  console.log(`📁 Created watch directory: ${watchDir}`);
  console.log("   ➜ Save photos here (or set DJI Fly to auto-save to this folder)");
}

// Start watcher
const watcher = chokidar.watch(watchDir, {
  ignored: /(?:\$|\.)/\w/, // ignore dotfiles
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 },
});

console.log("👀 Watching for new photos...\n");

watcher.on("add", async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return;

  const fileName = path.basename(filePath);
  const mimeType = mime.lookup(ext) || "image/jpeg";
  console.log(`📸 New photo: ${fileName}`);

  try {
    // Read image as base64
    const base64 = await getFileBase64(filePath);
    console.log(`   → Base64 extracted (${(base64.length / 1024).toFixed(0)} KB)`);

    // Read EXIF for GPS
    let gps: GpsCoords | null = null;
    try {
      const exif = await parse(filePath) as any;
      if (exif) {
        gps = extractGps(exif as ExifData) ?? null;
      }
    } catch (exifErr) {
      console.log(`   → No GPS EXIF data (drone media may not embed GPS)`);
    }

    // If no GPS in EXIF, try to use last known telemetry or fallback to a default
    let latitude: number;
    let longitude: number;
    if (gps) {
      latitude = gps.latitude;
      longitude = gps.longitude;
      console.log(`   → GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
    } else {
      // Fallback: alternate between campuses for demo
      const toggle = Math.random() > 0.5;
      latitude = toggle ? igdtuwCoords.latitude : iiitdCoords.latitude;
      longitude = toggle ? igdtuwCoords.longitude : iiitdCoords.longitude;
      console.log(`   → No GPS found — assigning to ${distanceCheck({ latitude, longitude }, igdtuwCoords, iiitdCoords)} (demo fallback)`);
    }

    // Determine campus
    const campus = distanceCheck({ latitude, longitude }, igdtuwCoords, iiitdCoords);
    console.log(`   → Campus: ${campus}`);

    // Send telemetry (simulated drone position)
    const telResult = await sendTelemetry({
      backend,
      token,
      missionId,
      latitude,
      longitude,
      altitude: 45,
      speedMps: 6,
      batteryPercent: 92,
    });
    console.log(`   → Telemetry: ${telResult.status} ${telResult.body?.acceptedAt ? "accepted" : telResult.body?.error || ""}`);

    // Send evidence with inference enabled
    const result = await sendEvidence({
      backend,
      token,
      missionId,
      fileName,
      mimeType: mimeType as string,
      base64,
      mediaKind: "photo",
      latitude,
      longitude,
      altitude: 45,
      timestamp: Date.now(),
      batteryPercent: 92,
      cameraId: opts.cameraId ?? "DJI Mini 3 Pro",
    });

    if (result.status === 201) {
      console.log(`   ✅ Evidence ingested!`);
      if (result.body?.inference) {
        const inf = result.body.inference;
        console.log(`   🤖 ML Detection: ${inf.label} — ${Math.round((inf.confidencePercent || 0) * 100)}% confidence`);
        console.log(`   📍 GPS: ${inf.latitude}, ${inf.longitude}`);
        console.log(`   🏗️  Priority: ${inf.priority?.priorityLevel || inf.severity} (score ${inf.priority?.overallScore || "?"})`);
        if (result.body?.contractor) {
          console.log(`   👤 Contractor: ${result.body.contractor.name} → ${result.body.contractor.email}`);
        }
        if (result.body?.report?.ticketId) {
          console.log(`   🎫 Ticket: ${result.body.report.ticketId}`);
        }
      }
    } else if (result.status === 401) {
      console.log(`   ❌ AUTH FAILED — check DRIFT_INGEST_TOKEN`);
    } else {
      console.log(`   ❌ Failed (${result.status}): ${JSON.stringify(result.body)}`);
    }
  } catch (error) {
    console.error(`   ❌ Error processing ${fileName}:`, error);
  }
  console.log("");
});

watcher.on("error", (err) => {
  console.error("❌ Watcher error:", err);
});
