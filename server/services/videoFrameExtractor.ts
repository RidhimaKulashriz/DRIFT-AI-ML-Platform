/**
 * Video frame extraction service.
 * Extracts frames from uploaded videos for ML detection.
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

export type VideoFrame = {
  index: number;
  timestamp: number; // seconds
  base64: string;
  mimeType: string;
};

export type VideoExtractionResult = {
  success: boolean;
  error?: string;
  frames: VideoFrame[];
  totalFrames: number;
  duration: number;
};

/**
 * Extract frames from a video buffer using FFmpeg.
 * Returns key frames (every 5 seconds by default) for ML detection.
 */
export async function extractFramesFromVideo(
  videoBuffer: Buffer,
  mimeType: string,
  options: {
    intervalSeconds?: number;
    maxFrames?: number;
    maxWidth?: number;
    maxHeight?: number;
  } = {}
): Promise<VideoExtractionResult> {
  const {
    intervalSeconds = 5,
    maxFrames = 20,
    maxWidth = 1280,
    maxHeight = 720,
  } = options;

  // Check if FFmpeg is available
  try {
    await execAsync("ffmpeg -version");
  } catch {
    return {
      success: false,
      error: "FFmpeg is not installed on the server. Please install FFmpeg to enable video frame extraction.",
      frames: [],
      totalFrames: 0,
      duration: 0,
    };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-video-"));
  const inputPath = path.join(tempDir, `input.${mimeType.split("/")[1]}`);
  const outputPattern = path.join(tempDir, "frame_%04d.jpg");

  try {
    // Write video to temp file
    fs.writeFileSync(inputPath, videoBuffer);

    // Get video duration
    const { stdout: durationOutput } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`
    );
    const duration = parseFloat(durationOutput.trim());

    // Extract frames at specified intervals
    const interval = `interval=${intervalSeconds}`;
    const scale = `scale=${maxWidth}:${maxHeight}:force_original_aspect_ratio=decrease`;
    
    const ffmpegCmd = [
      `ffmpeg -i "${inputPath}"`,
      `-vf "select='eq(n\\,0)+not(mod(n\\,${Math.floor(duration / intervalSeconds)}))'"`,
      `-vsync vfr`,
      scale,
      `-q:v 2`,
      `-frames:v ${maxFrames}`,
      `"${outputPattern}"`,
      `-y`,
    ].join(" ");

    await execAsync(ffmpegCmd);

    // Read extracted frames
    const frameFiles = fs.readdirSync(tempDir)
      .filter(f => f.startsWith("frame_") && f.endsWith(".jpg"))
      .sort();

    const frames: VideoFrame[] = [];
    for (const file of frameFiles) {
      const framePath = path.join(tempDir, file);
      const frameBuffer = fs.readFileSync(framePath);
      const base64 = frameBuffer.toString("base64");
      
      // Extract frame number from filename
      const match = file.match(/frame_(\d+)\.jpg/);
      const index = match ? parseInt(match[1], 10) : frames.length;
      
      frames.push({
        index,
        timestamp: (index * intervalSeconds),
        base64: `data:image/jpeg;base64,${base64}`,
        mimeType: "image/jpeg",
      });
    }

    return {
      success: true,
      frames,
      totalFrames: frameFiles.length,
      duration,
    };
  } catch (error) {
    console.error("[VideoFrameExtractor] Frame extraction failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error during frame extraction",
      frames: [],
      totalFrames: 0,
      duration: 0,
    };
  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error("[VideoFrameExtractor] Cleanup failed:", cleanupError);
    }
  }
}

/**
 * Extract a single frame from a video at a specific timestamp.
 */
export async function extractFrameAtTimestamp(
  videoBuffer: Buffer,
  mimeType: string,
  timestampSeconds: number,
  options: {
    maxWidth?: number;
    maxHeight?: number;
  } = {}
): Promise<{ success: boolean; error?: string; frame?: VideoFrame }> {
  const { maxWidth = 1280, maxHeight = 720 } = options;

  try {
    await execAsync("ffmpeg -version");
  } catch {
    return {
      success: false,
      error: "FFmpeg is not installed on the server.",
    };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-video-frame-"));
  const inputPath = path.join(tempDir, `input.${mimeType.split("/")[1]}`);
  const outputPath = path.join(tempDir, "frame.jpg");

  try {
    fs.writeFileSync(inputPath, videoBuffer);

    const ffmpegCmd = [
      `ffmpeg -ss ${timestampSeconds}`,
      `-i "${inputPath}"`,
      `-vf "scale=${maxWidth}:${maxHeight}:force_original_aspect_ratio=decrease"`,
      `-q:v 2`,
      `-frames:v 1`,
      `"${outputPath}"`,
      `-y`,
    ].join(" ");

    await execAsync(ffmpegCmd);

    const frameBuffer = fs.readFileSync(outputPath);
    const base64 = frameBuffer.toString("base64");

    return {
      success: true,
      frame: {
        index: 0,
        timestamp: timestampSeconds,
        base64: `data:image/jpeg;base64,${base64}`,
        mimeType: "image/jpeg",
      },
    };
  } catch (error) {
    console.error("[VideoFrameExtractor] Single frame extraction failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error("[VideoFrameExtractor] Cleanup failed:", cleanupError);
    }
  }
}
