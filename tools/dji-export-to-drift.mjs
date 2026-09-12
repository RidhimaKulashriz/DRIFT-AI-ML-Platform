/**
 * DRIFT Bridge — DJI Mini 3 Pro → Laptop → Backend
 *
 * This is an operator-controlled receive-only bridge. It never arms, launches,
 * navigates, or sends flight commands to an aircraft.
 *
 * One original file:
 *
 *   DRIFT_BASE_URL="https://drift-node-api.onrender.com" \
 *   DRIFT_INGEST_TOKEN="<retrieve from Render; never commit>" \
 *   node tools/dji-export-to-drift.mjs \
 *     --file ./original-frame.jpg \
 *     --mission-id 123 \
 *     --asset-id 456 \
 *     --asset-criticality 4 \
 *     --latitude 28.6139 \
 *     --longitude 77.2090 \
 *     --capture-zone oblique \
 *     --inspection-domain bridges \
 *     --camera-id dji-mini-3-pro-camera \
 *     --captured-at 2026-09-01T10:30:00Z \
 *     --correlation-key mission-123-frame-0001
 *
 * Watch a folder:
 *
 *   DRIFT_BASE_URL="https://drift-node-api.onrender.com" \
 *   DRIFT_INGEST_TOKEN="<retrieve from Render; never commit>" \
 *   DRIFT_MISSION_ID=123 \
 *   node tools/dji-export-to-drift.mjs --watch-dir ./drift-media
 *
 * The ingest token is read only from DRIFT_INGEST_TOKEN. It is intentionally
 * not accepted as a command-line option because command arguments can appear
 * in shell history or process listings.
 */

import fs from "node:fs/promises";
import path from "node:path";
import exifr from "exifr";
import chokidar from "chokidar";
import { Command } from "commander";
import mime from "mime-types";

const { parse } = exifr;

const DEFAULT_BACKEND = process.env.DRIFT_BASE_URL ?? "https://drift-node-api.onrender.com";
const DEFAULT_WATCH_DIR = process.env.DRIFT_MEDIA_DIR ?? path.join(process.cwd(), "drift-media");
const SUPPORTED_MEDIA = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".heic", "image/heic"],
  [".mp4", "video/mp4"],
  [".mov", "video/quicktime"],
  [".m4v", "video/mp4"],
  [".webm", "video/webm"],
]);
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const DEFAULT_CAMERA_ID = "DJI Mini 3 Pro";

function parseNumber(value, label) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number.`);
  return parsed;
}

function parsePositiveInteger(value, label) {
  const parsed = parseNumber(value, label);
  if (parsed === undefined || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function parseCoordinatePair(latitude, longitude) {
  const hasLatitude = latitude !== undefined;
  const hasLongitude = longitude !== undefined;
  if (hasLatitude !== hasLongitude) throw new Error("latitude and longitude must be supplied together.");
  if (!hasLatitude) return { latitude: null, longitude: null };
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error("latitude or longitude is outside valid geographic bounds.");
  }
  return { latitude, longitude };
}

function extractGps(exif) {
  if (!exif || typeof exif !== "object") return null;
  if (typeof exif.Latitude === "number" && typeof exif.Longitude === "number") {
    return { latitude: exif.Latitude, longitude: exif.Longitude };
  }
  if (typeof exif.GPSLatitude === "number" && typeof exif.GPSLongitude === "number") {
    return {
      latitude: exif.GPSLatitudeRef === "S" ? -exif.GPSLatitude : exif.GPSLatitude,
      longitude: exif.GPSLongitudeRef === "W" ? -exif.GPSLongitude : exif.GPSLongitude,
    };
  }
  return null;
}

function extractCapturedAt(exif, explicitValue) {
  const candidate = explicitValue ?? exif?.DateTimeOriginal ?? exif?.CreateDate ?? exif?.ModifyDate;
  if (!candidate) return undefined;
  const date = candidate instanceof Date ? candidate : new Date(String(candidate));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeBackend(value) {
  const backend = new URL(String(value));
  if (!['http:', 'https:'].includes(backend.protocol)) throw new Error("backend must use http or https.");
  return backend.toString().replace(/\/$/, "");
}

function requireToken() {
  const token = process.env.DRIFT_INGEST_TOKEN?.trim();
  if (!token) {
    throw new Error("Set DRIFT_INGEST_TOKEN in the local shell or a protected secret manager; never pass it as a CLI argument.");
  }
  return token;
}

async function requestJson(url, payload, token) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep a bounded plain-text response for diagnostics.
    body = text.slice(0, 500);
  }
  return { status: response.status, body };
}

async function sendEvidence({ backend, token, missionId, fileName, mimeType, bytes, mediaKind, metadata }) {
  const payload = {
    missionId,
    fileName,
    mimeType,
    base64: `data:${mimeType};base64,${bytes.toString("base64")}`,
    mediaKind,
    ...(metadata.latitude !== null ? { latitude: metadata.latitude, longitude: metadata.longitude } : {}),
    ...(metadata.capturedAt ? { capturedAt: metadata.capturedAt } : {}),
    ...(metadata.cameraId ? { cameraId: metadata.cameraId } : {}),
    ...(metadata.captureZone ? { captureZone: metadata.captureZone } : {}),
    ...(metadata.headingDegrees !== undefined ? { headingDegrees: metadata.headingDegrees } : {}),
    ...(metadata.playbackSeconds !== undefined ? { playbackSeconds: metadata.playbackSeconds } : {}),
    ...(metadata.inspectionDomain ? { inspectionDomain: metadata.inspectionDomain } : {}),
    ...(metadata.aircraftProfile ? { aircraftProfile: metadata.aircraftProfile } : {}),
    ...(metadata.correlationKey ? { correlationKey: metadata.correlationKey } : {}),
    runInference: mediaKind === "photo" && metadata.runInference,
    ...(metadata.assetId !== undefined ? { assetId: metadata.assetId } : {}),
    ...(metadata.assetCriticality !== undefined ? { assetCriticality: metadata.assetCriticality } : {}),
    ...(metadata.priorOpenDefects !== undefined ? { priorOpenDefects: metadata.priorOpenDefects } : {}),
  };
  return requestJson(`${backend}/api/drift/evidence`, payload, token);
}

async function sendTelemetry({ backend, token, missionId, metadata }) {
  return requestJson(`${backend}/api/drift/telemetry`, {
    missionId,
    latitude: metadata.latitude,
    longitude: metadata.longitude,
    altitude: metadata.altitude,
    speedMps: metadata.speedMps,
    batteryPercent: metadata.batteryPercent,
    timestamp: metadata.capturedAt ? Date.parse(metadata.capturedAt) : Date.now(),
  }, token);
}

async function readFileMetadata(filePath, options) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = SUPPORTED_MEDIA.get(extension) ?? mime.lookup(extension);
  if (!mimeType || !SUPPORTED_MEDIA.has(extension)) return null;

  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error(`${filePath} is not a regular file.`);
  if (stat.size === 0 || stat.size > MAX_FILE_BYTES) throw new Error(`${path.basename(filePath)} must be between 1 byte and 50 MB.`);

  const bytes = await fs.readFile(filePath);
  let exif = null;
  try {
    exif = await parse(filePath);
  } catch {
    console.warn(`No readable EXIF metadata found for ${path.basename(filePath)}.`);
  }

  const exifGps = extractGps(exif);
  const explicitLatitude = parseNumber(options.latitude, "latitude");
  const explicitLongitude = parseNumber(options.longitude, "longitude");
  const explicitCoordinates = parseCoordinatePair(explicitLatitude, explicitLongitude);
  const coordinates = explicitCoordinates.latitude === null ? (exifGps ?? { latitude: null, longitude: null }) : explicitCoordinates;
  if (coordinates.latitude !== null) parseCoordinatePair(coordinates.latitude, coordinates.longitude);

  const capturedAt = extractCapturedAt(exif, options.capturedAt);
  const mediaKind = String(mimeType).startsWith("video/") ? "video" : "photo";
  const assetId = options.assetId === undefined ? undefined : parsePositiveInteger(options.assetId, "asset-id");
  const assetCriticality = parseNumber(options.assetCriticality, "asset-criticality");
  if (assetCriticality !== undefined && (!Number.isInteger(assetCriticality) || assetCriticality < 1 || assetCriticality > 5)) {
    throw new Error("asset-criticality must be an integer from 1 to 5.");
  }
  const priorOpenDefects = parseNumber(options.priorOpenDefects, "prior-open-defects");
  if (priorOpenDefects !== undefined && (!Number.isInteger(priorOpenDefects) || priorOpenDefects < 0)) {
    throw new Error("prior-open-defects must be a non-negative integer.");
  }

  return {
    bytes,
    fileName: path.basename(filePath),
    mimeType,
    mediaKind,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    altitude: parseNumber(options.altitude, "altitude") ?? 0,
    speedMps: parseNumber(options.speedMps, "speed-mps") ?? 0,
    batteryPercent: parseNumber(options.batteryPercent, "battery-percent") ?? 100,
    capturedAt,
    cameraId: options.cameraId ?? DEFAULT_CAMERA_ID,
    captureZone: options.captureZone,
    headingDegrees: parseNumber(options.headingDegrees, "heading-degrees"),
    playbackSeconds: options.playbackSeconds === undefined ? undefined : Math.max(0, Math.floor(parseNumber(options.playbackSeconds, "playback-seconds"))),
    inspectionDomain: options.inspectionDomain,
    aircraftProfile: options.aircraftProfile ?? "DJI Mini 3 Pro",
    correlationKey: options.correlationKey ?? `dji-bridge:${options.missionId}:${Date.now()}`,
    runInference: options.inference === true && mediaKind === "photo",
    assetId,
    assetCriticality,
    priorOpenDefects,
  };
}

async function processMedia(filePath, options, backend, token, missionId) {
  const metadata = await readFileMetadata(filePath, options);
  if (!metadata) return { skipped: true };

  console.log(`Processing ${metadata.mediaKind}: ${metadata.fileName}`);
  console.log(`  Source: operator DJI export; camera: ${metadata.cameraId}`);
  if (metadata.latitude !== null) {
    console.log(`  GPS: ${metadata.latitude.toFixed(6)}, ${metadata.longitude.toFixed(6)}`);
    const telemetryResult = await sendTelemetry({ backend, token, missionId, metadata });
    if (telemetryResult.status < 200 || telemetryResult.status >= 300) {
      throw new Error(`Telemetry rejected (${telemetryResult.status}): ${JSON.stringify(telemetryResult.body)}`);
    }
    console.log(`  Telemetry accepted (${telemetryResult.status}).`);
  } else {
    console.warn("  GPS unavailable; telemetry skipped and evidence will remain without an inferred coordinate.");
  }

  const evidenceResult = await sendEvidence({ backend, token, missionId, fileName: metadata.fileName, mimeType: metadata.mimeType, bytes: metadata.bytes, mediaKind: metadata.mediaKind, metadata });
  if (evidenceResult.status < 200 || evidenceResult.status >= 300) {
    throw new Error(`Evidence rejected (${evidenceResult.status}): ${JSON.stringify(evidenceResult.body)}`);
  }
  console.log(`  Evidence accepted (${evidenceResult.status}); engineer review remains required.`);
  if (evidenceResult.body?.inference) {
    console.log(`  Inference response: ${JSON.stringify(evidenceResult.body.inference)}`);
  }
  return { skipped: false, evidenceResult };
}

const program = new Command();
program
  .name("dji-export-to-drift")
  .description("Bridge original DJI media to DRIFT through the authenticated receive-only ingress")
  .option("--backend <url>", "Backend API URL", DEFAULT_BACKEND)
  .option("--mission-id <n>", "Authorised DRIFT mission ID", process.env.DRIFT_MISSION_ID)
  .option("--file <path>", "Process one exported original file and exit")
  .option("--watch-dir <path>", "Watch a folder for newly exported media", DEFAULT_WATCH_DIR)
  .option("--camera-id <id>", "Camera identifier", process.env.DRIFT_CAMERA_ID ?? DEFAULT_CAMERA_ID)
  .option("--aircraft-profile <profile>", "Aircraft profile", process.env.DRIFT_AIRCRAFT_PROFILE ?? "DJI Mini 3 Pro")
  .option("--inspection-domain <domain>", "Inspection domain, for example roads or bridges")
  .option("--capture-zone <zone>", "Capture zone, for example oblique or under-bridge")
  .option("--captured-at <iso>", "Capture timestamp in ISO-8601 format; EXIF is used when omitted")
  .option("--latitude <number>", "Override EXIF latitude")
  .option("--longitude <number>", "Override EXIF longitude")
  .option("--altitude <meters>", "Telemetry altitude in meters", "0")
  .option("--speed-mps <meters-per-second>", "Telemetry speed", "0")
  .option("--battery-percent <percent>", "Telemetry battery percentage", "100")
  .option("--heading-degrees <degrees>", "Camera/aircraft heading")
  .option("--playback-seconds <seconds>", "Video playback duration")
  .option("--asset-id <n>", "Existing asset ID; required for inference persistence")
  .option("--asset-criticality <1-5>", "Existing asset criticality; required for inference persistence")
  .option("--prior-open-defects <n>", "Existing open defect count for prioritisation", "0")
  .option("--correlation-key <key>", "Evidence correlation key")
  .option("--no-inference", "Upload the media without requesting photo inference")
  .parse();

const options = program.opts();

try {
  const backend = normalizeBackend(options.backend);
  const token = requireToken();
  const missionId = parsePositiveInteger(options.missionId, "mission-id");

  console.log("DRIFT DJI bridge (receive-only)");
  console.log(`Backend: ${backend}`);
  console.log(`Mission: #${missionId}`);
  console.log("Token: configured from DRIFT_INGEST_TOKEN (value not displayed)");

  if (options.file) {
    await processMedia(path.resolve(options.file), options, backend, token, missionId);
  } else {
    const watchDir = path.resolve(options.watchDir);
    await fs.mkdir(watchDir, { recursive: true });
    console.log(`Watching: ${watchDir}`);
    console.log("Save original DJI exports into this folder; no flight command is issued by this bridge.");

    const processing = new Set();
    const watcher = chokidar.watch(watchDir, {
      ignored: /(?:^|[\\/])\./,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 },
    });
    watcher.on("add", (filePath) => {
      if (processing.has(filePath)) return;
      processing.add(filePath);
      void processMedia(filePath, options, backend, token, missionId)
        .catch((error) => console.error(`FAILED ${path.basename(filePath)}: ${error.message}`))
        .finally(() => processing.delete(filePath));
    });
    watcher.on("error", (error) => console.error(`Watcher error: ${error.message}`));
  }
} catch (error) {
  console.error(`DRIFT bridge stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
