#!/usr/bin/env node
import "dotenv/config";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const streamUrl = process.env.MEDIA_X_HLS_URL;
const outputDir = path.resolve(process.env.DRIFT_MEDIA_DIR ?? "./drift-media-inbox");
const latitude = Number(process.env.MEDIA_X_LATITUDE);
const longitude = Number(process.env.MEDIA_X_LONGITUDE);
const captureFps = Number(process.env.MEDIA_X_CAPTURE_FPS ?? 2);
const sampleEvery = Math.max(1, Math.floor(Number(process.env.MEDIA_X_SAMPLE_EVERY ?? 2)));
const fps = captureFps / sampleEvery;

if (!streamUrl) {
  console.error("Set MEDIA_X_HLS_URL to your Media X .m3u8 URL.");
  process.exit(1);
}
if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
  console.error("Set MEDIA_X_LATITUDE and MEDIA_X_LONGITUDE so detections can be mapped.");
  process.exit(1);
}
if (!Number.isFinite(captureFps) || captureFps <= 0 || captureFps > 10 || !Number.isFinite(sampleEvery)) {
  console.error("MEDIA_X_CAPTURE_FPS must be between 0 and 10 and MEDIA_X_SAMPLE_EVERY must be a positive integer.");
  process.exit(1);
}

await fs.mkdir(outputDir, { recursive: true });
console.log(`Reading Media X HLS: ${streamUrl}`);
console.log(`Capturing at ${captureFps} fps; sending every ${sampleEvery} frame(s) (${fps} inference frame(s)/second) to ${outputDir}`);

const ffmpeg = spawn("ffmpeg", [
  "-hide_banner", "-loglevel", "warning", "-i", streamUrl,
  "-vf", `fps=${captureFps}`, "-q:v", "2", "-f", "image2",
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
let nextSample = 1;
const sidecarTimer = setInterval(async () => {
  const frameName = `mediax-${String(nextFrame).padStart(6, "0")}.jpg`;
  const framePath = path.join(outputDir, frameName);
  try {
    const stat = await fs.stat(framePath);
    if (stat.size > 0) {
      if (nextSample % sampleEvery === 0) {
        await fs.writeFile(`${framePath}.json`, JSON.stringify({ latitude, longitude, liveFrame: true, frameId: frameName, runInference: true, cameraId: "media-x-live", inspectionDomain: "roads" }, null, 2));
      }
      nextSample += 1;
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
