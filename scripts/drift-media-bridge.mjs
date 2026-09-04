#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const mediaDir = path.resolve(process.env.DRIFT_MEDIA_DIR ?? "./drift-media-inbox");
const baseUrl = (process.env.DRIFT_BASE_URL ?? "https://drift-node-api.onrender.com").replace(/\/$/, "");
const token = process.env.DRIFT_INGEST_TOKEN;
const missionId = Number(process.env.DRIFT_MISSION_ID);
const defaultAssetId = Number(process.env.DRIFT_ASSET_ID ?? 0);
const defaultAssetCriticality = Number(process.env.DRIFT_ASSET_CRITICALITY ?? 3);
const allowed = new Map([[".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"], [".webp", "image/webp"], [".heic", "image/heic"], [".mp4", "video/mp4"], [".webm", "video/webm"], [".mov", "video/quicktime"]]);
const sent = new Set();

if (!token || !Number.isInteger(missionId) || missionId <= 0) {
  console.error("Set DRIFT_INGEST_TOKEN and a positive integer DRIFT_MISSION_ID before starting the bridge.");
  process.exit(1);
}

async function readSidecar(filePath) {
  try {
    return JSON.parse(await fs.readFile(`${filePath}.json`, "utf8"));
  } catch {
    return {};
  }
}

async function upload(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = allowed.get(ext);
  if (!mimeType || sent.has(filePath)) return;
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile() || stat.size === 0 || stat.size > 38 * 1024 * 1024) return;
  const metadata = await readSidecar(filePath);
  if (typeof metadata.latitude !== "number" || typeof metadata.longitude !== "number") {
    fs.access(`${filePath}.json`).then(() => setTimeout(() => upload(filePath).catch(error => console.error(`FAILED ${path.basename(filePath)}: ${error.message}`)), 750)).catch(() => {});
    console.warn(`SKIP ${path.basename(filePath)}: sidecar GPS required at ${path.basename(filePath)}.json`);
    return;
  }
  const bytes = await fs.readFile(filePath);
  const response = await fetch(`${baseUrl}/api/drift/evidence`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      missionId,
      fileName: path.basename(filePath),
      mimeType,
      mediaKind: mimeType.startsWith("video/") ? "video" : "photo",
      base64: bytes.toString("base64"),
      latitude: metadata.latitude,
      longitude: metadata.longitude,
      cameraId: metadata.cameraId,
      captureZone: metadata.captureZone,
      headingDegrees: metadata.headingDegrees,
      inspectionDomain: metadata.inspectionDomain,
      correlationKey: metadata.correlationKey,
      playbackSeconds: metadata.playbackSeconds,
      liveFrame: mimeType.startsWith("image/") && metadata.liveFrame === true,
      frameId: metadata.frameId ?? path.basename(filePath),
      runInference: mimeType.startsWith("image/") && metadata.liveFrame === true && metadata.runInference !== false,
      assetId: Number(metadata.assetId ?? defaultAssetId) || undefined,
      assetCriticality: Number(metadata.assetCriticality ?? defaultAssetCriticality),
      priorOpenDefects: metadata.priorOpenDefects,
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status}: ${body.slice(0, 300)}`);
  sent.add(filePath);
  let result = "stored";
  try {
    const parsed = JSON.parse(body);
    result = parsed?.inference ? `inference=${parsed.inference.label ?? parsed.inference.defectType ?? "completed"}` : "inference=none";
  } catch {
    result = "response=non-json";
  }
  console.log(`UPLOADED ${path.basename(filePath)} → ${baseUrl}/api/drift/evidence (${result})`);
}

async function scan() {
  await fs.mkdir(mediaDir, { recursive: true });
  const entries = await fs.readdir(mediaDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) await upload(path.join(mediaDir, entry.name)).catch(error => console.error(`FAILED ${entry.name}: ${error.message}`));
  }
}

console.log(`DRIFT media bridge watching ${mediaDir}`);
await scan();
const watcher = (await import("node:fs")).watch(mediaDir, { persistent: true });
watcher.on("error", error => console.error(`WATCHER ERROR: ${error.message}`));
watcher.on("change", (_eventType, fileName) => {
  if (!fileName) return;
  const name = fileName.toString();
  upload(path.join(mediaDir, name)).catch(error => console.error(`FAILED ${name}: ${error.message}`));
});

// Keep the process alive consistently across Windows Node.js versions.
setInterval(() => {}, 60_000);
