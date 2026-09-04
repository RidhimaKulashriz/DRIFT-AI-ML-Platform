#!/usr/bin/env node
import "dotenv/config";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const streamUrl = process.env.MEDIA_X_HLS_URL;
const outputDir = path.resolve(process.env.DRIFT_MEDIA_DIR ?? "./drift-media-inbox");
const latitude = Number(process.env.MEDIA_X_LATITUDE);
const longitude = Number(process.env.MEDIA_X_LONGITUDE);
const fps = Number(process.env.MEDIA_X_FRAME_RATE ?? 1);

if (!streamUrl) {
  console.error("Set MEDIA_X_HLS_URL to your Media X .m3u8 URL.");
  process.exit(1);
}
if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
  console.error("Set MEDIA_X_LATITUDE and MEDIA_X_LONGITUDE so detections can be mapped.");
  process.exit(1);
}
if (!Number.isFinite(fps) || fps <= 0 || fps > 2) {
  console.error("MEDIA_X_FRAME_RATE must be between 0 and 2 frames per second.");
  process.exit(1);
}

await fs.mkdir(outputDir, { recursive: true });
console.log(`Reading Media X HLS: ${streamUrl}`);
console.log(`Writing ${fps} frame(s)/second to ${outputDir}`);

const ffmpeg = spawn("ffmpeg", [
  "-hide_banner", "-loglevel", "warning", "-i", streamUrl,
  "-vf", `fps=${fps}`, "-q:v", "5", "-f", "image2",
  path.join(outputDir, "mediax-%06d.jpg"),
], { stdio: ["ignore", "inherit", "inherit"] });

ffmpeg.on("error", error => {
  console.error(`Could not start ffmpeg: ${error.message}`);
  console.error("Install FFmpeg and make sure `ffmpeg -version` works in PowerShell.");
  process.exitCode = 1;
});

ffmpeg.on("close", code => {
  if (code !== 0) console.error(`FFmpeg stopped with exit code ${code}.`);
});

let nextFrame = 1;
const sidecarTimer = setInterval(async () => {
  const frameName = `mediax-${String(nextFrame).padStart(6, "0")}.jpg`;
  const framePath = path.join(outputDir, frameName);
  try {
    const stat = await fs.stat(framePath);
    if (stat.size > 0) {
      await fs.writeFile(`${framePath}.json`, JSON.stringify({ latitude, longitude, liveFrame: true, frameId: frameName, runInference: true, cameraId: "media-x-live", inspectionDomain: "roads" }, null, 2));
      nextFrame += 1;
    }
  } catch {
    // The next frame has not been written yet.
  }
}, Math.max(500, Math.round(1000 / fps)));

function shutdown() {
  clearInterval(sidecarTimer);
  ffmpeg.kill("SIGTERM");
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
