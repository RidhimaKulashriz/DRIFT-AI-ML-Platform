import { describe, expect, it } from "vitest";
import { buildArtifactManifest, buildReconstructionPlan, scoreCaptureQuality, validateCapture } from "./services/reconstruction";

const input = { fileName: "flight.mp4", mimeType: "video/mp4", sizeBytes: 1024, latitude: 28.6, longitude: 77.2, altitudeMeters: 80, hasImu: true, hasRtk: false, hasBarometer: true, hasIntrinsics: false, durationSeconds: 600, resolution: "4k" as const };

describe("single-pass reconstruction contract", () => {
  it("rejects invalid capture metadata instead of fabricating geometry", () => {
    const result = validateCapture({ ...input, mimeType: "image/jpeg", latitude: 120 });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
  it("scores sensor completeness and records accuracy warnings", () => {
    const result = scoreCaptureQuality(input);
    expect(result.score).toBeGreaterThan(70);
    expect(result.warnings.join(" ")).toContain("RTK");
  });
  it("creates an ordered pipeline and required export contract", () => {
    const plan = buildReconstructionPlan(input);
    expect(plan.stages.map(stage => stage.stage)).toEqual(["ingest", "metadata_validation", "frame_sampling", "visual_odometry", "sparse_cloud", "dense_cloud", "mesh_texturing", "semantic_layers", "georeference", "quality_gate", "publish_artifacts"]);
    const manifest = buildArtifactManifest(plan.jobKey, input, plan.quality);
    expect(manifest.artifacts.map(artifact => artifact.format)).toEqual(["glb", "las", "geotiff", "obj", "fbx"]);
  });
});
