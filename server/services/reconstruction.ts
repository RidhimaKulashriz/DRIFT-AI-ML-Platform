import crypto from "node:crypto";

export type ReconstructionInput = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  cameraModel?: string;
  flightMetadata?: string;
  hasImu: boolean;
  hasRtk: boolean;
  hasBarometer: boolean;
  hasIntrinsics: boolean;
  durationSeconds: number;
  resolution: "1080p" | "4k";
};

export function validateCapture(input: ReconstructionInput) {
  const errors: string[] = [];
  if (!/^video\/(mp4|quicktime|x-msvideo|webm)$/.test(input.mimeType)) errors.push("Capture must be an MP4, MOV, AVI, or WebM video.");
  if (input.sizeBytes <= 0 || input.sizeBytes > 20 * 1024 * 1024 * 1024) errors.push("Video size must be between 1 byte and 20 GB.");
  if (input.durationSeconds <= 0 || input.durationSeconds > 60 * 60) errors.push("Video duration must be between 1 second and 60 minutes.");
  if (input.altitudeMeters <= 0 || input.altitudeMeters > 5000) errors.push("Altitude must be between 0 and 5,000 meters.");
  if (input.latitude < -90 || input.latitude > 90 || input.longitude < -180 || input.longitude > 180) errors.push("GPS coordinates are invalid.");
  return { valid: errors.length === 0, errors };
}

export function scoreCaptureQuality(input: ReconstructionInput) {
  const metadataCompleteness = [input.hasImu, input.hasRtk, input.hasBarometer, input.hasIntrinsics].filter(Boolean).length / 4;
  const resolutionScore = input.resolution === "4k" ? 1 : 0.72;
  const durationScore = input.durationSeconds >= 30 ? 1 : 0.65;
  const score = Math.round((metadataCompleteness * 0.4 + resolutionScore * 0.35 + durationScore * 0.25) * 100);
  return { score, grade: score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D", metadataCompleteness, warnings: [!input.hasRtk && "RTK corrections absent; absolute accuracy may require GCPs.", !input.hasIntrinsics && "Camera intrinsics absent; self-calibration will be used.", input.resolution === "1080p" && "1080p input may reduce fine facade and vegetation reconstruction detail."].filter(Boolean) as string[] };
}

export function buildReconstructionPlan(input: ReconstructionInput) {
  const quality = scoreCaptureQuality(input);
  const id = crypto.randomUUID();
  return { jobKey: id, quality, stages: ["ingest", "metadata_validation", "frame_sampling", "visual_odometry", "sparse_cloud", "dense_cloud", "mesh_texturing", "semantic_layers", "georeference", "quality_gate", "publish_artifacts"].map((stage, index) => ({ stage, order: index + 1, status: index === 0 ? "queued" : "pending" })) };
}

export function buildArtifactManifest(jobKey: string, input: ReconstructionInput, quality: ReturnType<typeof scoreCaptureQuality>) {
  const base = `/api/reconstruction/${jobKey}/artifacts`;
  return { jobKey, coordinateReferenceSystem: "WGS84 / local ENU", origin: { latitude: input.latitude, longitude: input.longitude, altitudeMeters: input.altitudeMeters }, quality, artifacts: [{ type: "textured_mesh", format: "glb", url: `${base}/scene.glb`, sizeBytes: 0, status: "pending" }, { type: "point_cloud", format: "las", url: `${base}/cloud.las`, sizeBytes: 0, status: "pending" }, { type: "orthomosaic", format: "geotiff", url: `${base}/orthomosaic.tif`, sizeBytes: 0, status: "pending" }, { type: "mesh_exchange", format: "obj", url: `${base}/scene.obj`, sizeBytes: 0, status: "pending" }, { type: "mesh_exchange", format: "fbx", url: `${base}/scene.fbx`, sizeBytes: 0, status: "pending" }] };
}
