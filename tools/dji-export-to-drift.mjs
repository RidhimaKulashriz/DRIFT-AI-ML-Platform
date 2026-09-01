#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

const MIME_BY_EXTENSION = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".heic", "image/heic"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".mov", "video/quicktime"],
]);

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(`Usage: node tools/dji-export-to-drift.mjs --file ./original-frame.jpg --mission-id 123 [options]

Required environment:
  DRIFT_BASE_URL       DRIFT backend origin, for example https://drift-node-api.onrender.com
  DRIFT_INGEST_TOKEN   server-to-server bridge token; never put this in frontend code

Optional flags:
  --latitude <number>              trusted capture latitude
  --longitude <number>             trusted capture longitude
  --captured-at <ISO timestamp>    retained in the local operator log only
  --capture-zone <label>           oblique, above-deck, under-bridge, trackside, etc.
  --inspection-domain <label>      bridge, road, rail, building, utility, etc.
  --camera-id <label>              camera identity from the operator record
  --correlation-key <label>        stable mission/frame correlation key
  --playback-seconds <integer>     duration for a video
  --mime-type <type>               override extension-based MIME detection
  --run-inference                  request configured advisory image inference
  --asset-id <integer>             required with --run-inference
  --asset-criticality <number>     required with --run-inference
  --help`);
  process.exit(message ? 2 : 0);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--help") usage();
    if (!item.startsWith("--")) usage(`Unexpected argument: ${item}`);
    const key = item.slice(2).replaceAll("-", "_");
    if (key === "run_inference") {
      args[key] = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) usage(`Missing value for --${key.replaceAll("_", "-")}`);
    args[key] = value;
    i += 1;
  }
  return args;
}

function numberFlag(args, key, { integer = false, required = false } = {}) {
  if (args[key] === undefined) {
    if (required) usage(`Missing --${key.replaceAll("_", "-")}`);
    return undefined;
  }
  const value = Number(args[key]);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) usage(`Invalid numeric value for --${key.replaceAll("_", "-")}`);
  return value;
}

const args = parseArgs(process.argv.slice(2));
const filePath = args.file;
const baseUrl = process.env.DRIFT_BASE_URL?.replace(/\/$/, "");
const token = process.env.DRIFT_INGEST_TOKEN;
if (!filePath) usage("Missing --file");
if (!baseUrl || !/^https:\/\//i.test(baseUrl)) usage("DRIFT_BASE_URL must be an HTTPS origin");
if (!token) usage("DRIFT_INGEST_TOKEN is not set");
const missionId = numberFlag(args, "mission_id", { integer: true, required: true });
if (missionId <= 0) usage("--mission-id must be positive");
const bytes = await readFile(filePath).catch((error) => usage(`Cannot read file: ${error.message}`));
const extension = extname(filePath).toLowerCase();
const mimeType = args.mime_type ?? MIME_BY_EXTENSION.get(extension);
if (!mimeType) usage(`Unsupported file extension ${extension || "(none)"}; use --mime-type with an allowed image/video type`);
const mediaKind = mimeType.startsWith("video/") ? "video" : "photo";
const latitude = numberFlag(args, "latitude");
const longitude = numberFlag(args, "longitude");
if ((latitude === undefined) !== (longitude === undefined)) usage("Provide both --latitude and --longitude, or neither");
if (latitude !== undefined && (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) usage("Capture coordinates are outside valid geographic bounds");
const playbackSeconds = numberFlag(args, "playback_seconds", { integer: true });
if (playbackSeconds !== undefined && playbackSeconds < 0) usage("--playback-seconds cannot be negative");
const body = {
  missionId,
  fileName: basename(filePath),
  mimeType,
  mediaKind,
  base64: bytes.toString("base64"),
  ...(latitude === undefined ? {} : { latitude, longitude }),
  ...(playbackSeconds === undefined ? {} : { playbackSeconds }),
  ...(args.camera_id ? { cameraId: args.camera_id } : {}),
  ...(args.capture_zone ? { captureZone: args.capture_zone } : {}),
  ...(args.inspection_domain ? { inspectionDomain: args.inspection_domain } : {}),
  ...(args.correlation_key ? { correlationKey: args.correlation_key } : {}),
  aircraftProfile: "DJI Mini 3 Pro",
  ...(args.run_inference ? { runInference: true } : {}),
  ...(args.asset_id === undefined ? {} : { assetId: numberFlag(args, "asset_id", { integer: true }) }),
  ...(args.asset_criticality === undefined ? {} : { assetCriticality: numberFlag(args, "asset_criticality") }),
};
if (args.run_inference && (body.assetId === undefined || body.assetCriticality === undefined || latitude === undefined)) {
  usage("--run-inference requires --asset-id, --asset-criticality, --latitude, and --longitude");
}

const response = await fetch(`${baseUrl}/api/drift/evidence`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(body),
});
const responseText = await response.text();
let parsed;
try {
  parsed = JSON.parse(responseText);
} catch {
  parsed = { response: responseText.slice(0, 500) };
}
if (!response.ok) {
  console.error(`DRIFT evidence upload failed (${response.status}).`);
  console.error(JSON.stringify(parsed));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  status: response.status,
  evidenceId: parsed.id ?? null,
  fileName: body.fileName,
  missionId,
  mediaKind,
  source: "hardware / operator-uav-capture",
  note: "Original media was accepted by DRIFT; inference and engineer review remain advisory/gated.",
}, null, 2));
