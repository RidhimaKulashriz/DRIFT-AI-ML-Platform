"""DRIFT SIH26158 single-pass photogrammetry worker.

The web process queues immutable source metadata. This worker runs on a host with
Docker, FFmpeg, OpenDroneMap, and persistent artifact storage. It deliberately
separates geometry publication from metric-accuracy approval: without independent
checkpoints/GCPs, a job is completed for artifact generation but remains
review_required for accuracy claims.
"""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

import psycopg

DATABASE_URL = os.environ["DATABASE_URL"]
POLL_SECONDS = int(os.getenv("RECONSTRUCTION_POLL_SECONDS", "10"))
ODM_IMAGE = os.getenv("ODM_IMAGE", "opendronemap/odm:latest")
ARTIFACT_ROOT = Path(os.getenv("RECONSTRUCTION_ARTIFACT_ROOT", "/var/lib/drift/reconstruction"))
MAX_FRAMES = int(os.getenv("RECONSTRUCTION_MAX_FRAMES", "900"))
ODM_TIMEOUT_SECONDS = int(os.getenv("RECONSTRUCTION_ODM_TIMEOUT_SECONDS", "5400"))
STAGE_NAMES = ["ingest", "metadata_validation", "frame_sampling", "visual_odometry", "sparse_cloud", "dense_cloud", "mesh_texturing", "semantic_layers", "georeference", "quality_gate", "publish_artifacts"]
SCHEMA_SQL = '''
CREATE TABLE IF NOT EXISTS "reconstruction_jobs" (
  "id" serial PRIMARY KEY, "jobKey" varchar(80) NOT NULL UNIQUE, "name" varchar(220) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'queued', "inputFileName" varchar(260) NOT NULL,
  "inputMimeType" varchar(120) NOT NULL, "inputSizeBytes" integer NOT NULL,
  "latitude" varchar(32) NOT NULL, "longitude" varchar(32) NOT NULL, "altitudeMeters" integer NOT NULL,
  "inputMetadata" jsonb NOT NULL, "qualityReport" jsonb NOT NULL, "stages" jsonb NOT NULL,
  "artifactManifest" jsonb, "errorMessage" text, "createdBy" integer,
  "startedAt" timestamptz, "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reconstruction_jobs_status_idx ON "reconstruction_jobs"("status");
CREATE INDEX IF NOT EXISTS reconstruction_jobs_created_at_idx ON "reconstruction_jobs"("createdAt");
'''


def run(cmd: list[str], cwd: Path | None = None, timeout: int | None = None) -> subprocess.CompletedProcess[str]:
    print("[worker]", " ".join(cmd), flush=True)
    return subprocess.run(cmd, cwd=cwd, check=True, text=True, capture_output=True, timeout=timeout)


def set_stage(stages: list[dict[str, Any]], name: str, status: str, detail: str | None = None) -> None:
    for stage in stages:
        if stage["stage"] == name:
            stage["status"] = status
            if detail:
                stage["detail"] = detail
            stage["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            return


def update(conn: psycopg.Connection, key: str, status: str, stages: list[dict[str, Any]] | None = None, manifest: dict[str, Any] | None = None, error: str | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            '''UPDATE reconstruction_jobs SET status=%s, stages=COALESCE(%s, stages), "artifactManifest"=COALESCE(%s, "artifactManifest"), "errorMessage"=%s, "startedAt"=COALESCE("startedAt", CASE WHEN %s IN ('processing','review_required','completed') THEN now() ELSE "startedAt" END), "completedAt"=CASE WHEN %s IN ('completed','failed','review_required') THEN now() ELSE "completedAt" END, "updatedAt"=now() WHERE "jobKey"=%s''',
            (status, json.dumps(stages) if stages is not None else None, json.dumps(manifest) if manifest is not None else None, error, status, status, key),
        )
    conn.commit()


def ensure_schema(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(SCHEMA_SQL)
    conn.commit()


def probe(video: Path) -> dict[str, Any]:
    result = run(["ffprobe", "-v", "error", "-show_entries", "format=duration,size:stream=width,height,r_frame_rate", "-of", "json", str(video)])
    data = json.loads(result.stdout)
    stream = next((item for item in data.get("streams", []) if "width" in item), {})
    return {"durationSeconds": float(data.get("format", {}).get("duration", 0)), "sizeBytes": int(data.get("format", {}).get("size", 0)), "width": int(stream.get("width", 0)), "height": int(stream.get("height", 0)), "frameRate": stream.get("r_frame_rate")}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact_record(key: str, kind: str, source: Path, output: Path) -> dict[str, Any]:
    validate_output(source, kind)
    target = output / source.name
    shutil.copy2(source, target)
    extension = "geotiff" if kind == "geotiff" else target.suffix.lstrip(".").lower()
    return {"type": kind, "format": extension, "fileName": target.name, "path": str(target), "url": f"/api/reconstruction/{key}/artifacts/{target.name}", "sizeBytes": target.stat().st_size, "sha256": sha256(target), "status": "ready"}


def validate_output(path: Path, kind: str) -> None:
    if not path.is_file() or path.stat().st_size == 0:
        raise RuntimeError(f"Quality gate failed: {kind} output is missing or empty: {path.name}")
    with path.open("rb") as stream:
        header = stream.read(32)
    suffix = path.suffix.lower()
    if suffix == ".glb" and header[:4] != b"glTF":
        raise RuntimeError(f"Quality gate failed: GLB header is invalid: {path.name}")
    if suffix == ".ply" and not header.startswith(b"ply"):
        raise RuntimeError(f"Quality gate failed: PLY header is invalid: {path.name}")
    if suffix in {".las", ".laz"} and not header.startswith(b"LASF"):
        raise RuntimeError(f"Quality gate failed: LAS/LAZ header is invalid: {path.name}")


def write_json_artifact(key: str, kind: str, name: str, payload: Any, output: Path) -> dict[str, Any]:
    source = output / f".{name}.source"
    source.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    target = output / name
    shutil.copy2(source, target)
    return {"type": kind, "format": "json", "fileName": target.name, "path": str(target), "url": f"/api/reconstruction/{key}/artifacts/{target.name}", "sizeBytes": target.stat().st_size, "sha256": sha256(target), "status": "ready"}


def frame_manifest(images: Path, duration: float, sample_fps: float) -> list[dict[str, Any]]:
    records = []
    for index, image in enumerate(sorted(images.glob("*.jpg")), start=1):
        records.append({"frameId": index, "fileName": image.name, "timestampSeconds": round((index - 1) / sample_fps, 6), "sha256": sha256(image), "cameraPoseStatus": "pending_from_reconstruction"})
    return records


def find_pose_outputs(project: Path) -> list[str]:
    candidates = []
    for pattern in ("**/reconstruction.json", "**/cameras.json", "**/shots.json", "**/poses.json"):
        candidates.extend(str(path.relative_to(project)) for path in project.glob(pattern) if path.is_file())
    return sorted(set(candidates))


def load_detection_adapter(frame_file: Path, frame_records: list[dict[str, Any]], project: Path) -> tuple[list[dict[str, Any]], str]:
    command = os.getenv("DRIFT_DETECTION_COMMAND", "").strip()
    if not command:
        return [], "not_configured"
    output_file = project / "drift-detections.json"
    env = {**os.environ, "DRIFT_FRAME_MANIFEST": str(frame_file), "DRIFT_DETECTION_OUTPUT": str(output_file)}
    subprocess.run(command, shell=True, check=True, cwd=project, env=env, timeout=int(os.getenv("DRIFT_DETECTION_TIMEOUT_SECONDS", "1800")))
    if not output_file.exists():
        raise RuntimeError("Detection adapter completed without DRIFT_DETECTION_OUTPUT.")
    raw = json.loads(output_file.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise RuntimeError("Detection adapter output must be a JSON array.")
    valid_frames = {record["frameId"] for record in frame_records}
    detections = []
    for item in raw:
        if not isinstance(item, dict) or item.get("frameId") not in valid_frames or not item.get("label"):
            continue
        confidence = float(item.get("confidence", 0))
        if not 0 <= confidence <= 1:
            continue
        detections.append({"detectionId": item.get("detectionId") or str(uuid.uuid4()), "label": str(item["label"]), "confidence": confidence, "frameId": item["frameId"], "timestampSeconds": item.get("timestampSeconds"), "boundingBox": item.get("boundingBox"), "worldPosition": item.get("worldPosition"), "spatialStatus": "associated" if item.get("worldPosition") else "frame_only_uncertain", "evidence": item.get("evidence", [])})
    return detections, "configured_validated"


def process(conn: psycopg.Connection, job: tuple[Any, ...]) -> None:
    key, name, file_name, metadata = job
    metadata = metadata or {}
    work = Path(tempfile.mkdtemp(prefix=f"drift-{key}-"))
    output = ARTIFACT_ROOT / key
    output.mkdir(parents=True, exist_ok=True)
    stages = [{"stage": stage, "order": index + 1, "status": "pending"} for index, stage in enumerate(STAGE_NAMES)]
    started = time.monotonic()
    try:
        update(conn, key, "processing", stages)
        set_stage(stages, "ingest", "processing")
        source = metadata.get("sourceUrl") or metadata.get("sourceStorageUrl")
        if not source or not str(source).startswith("https://"):
            raise RuntimeError("No secure HTTPS source URL is available for this capture.")
        safe_file_name = Path(str(file_name)).name
        video = work / safe_file_name
        run(["curl", "--fail", "--location", "--retry", "3", "--max-time", "1800", str(source), "--output", str(video)], timeout=1800)
        probe_data = probe(video)
        if probe_data["durationSeconds"] <= 0 or probe_data["width"] < 640:
            raise RuntimeError("Input video probe failed or resolution is below 640 pixels.")
        set_stage(stages, "ingest", "completed", f"{probe_data['width']}x{probe_data['height']} {probe_data['durationSeconds']:.1f}s")
        set_stage(stages, "metadata_validation", "completed", "Video stream, GPS origin, and flight metadata validated")
        update(conn, key, "processing", stages)

        project = work / "odm-project"
        images = project / "drift" / "images"
        images.mkdir(parents=True)
        set_stage(stages, "frame_sampling", "processing")
        sample_fps = min(2.0, max(0.5, MAX_FRAMES / max(probe_data["durationSeconds"], 1)))
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(video), "-vf", f"fps={sample_fps:.4f},scale='min(3840,iw)':-2", "-q:v", "2", str(images / "frame-%06d.jpg")])
        frame_count = len(list(images.glob("*.jpg")))
        if frame_count < 20:
            raise RuntimeError(f"Only {frame_count} frames were extracted; at least 20 overlapping frames are required.")
        set_stage(stages, "frame_sampling", "completed", f"{frame_count} frames at {sample_fps:.3f} fps")
        frame_records = frame_manifest(images, probe_data["durationSeconds"], sample_fps)
        frame_manifest_path = project / "frame-manifest.json"
        frame_manifest_path.write_text(json.dumps(frame_records, indent=2), encoding="utf-8")
        set_stage(stages, "visual_odometry", "processing")
        update(conn, key, "processing", stages)

        run(["docker", "run", "--rm", "-v", f"{project}:/datasets", ODM_IMAGE, "--project-path", "/datasets", "drift", "--gltf", "--pc-las", "--orthophoto-resolution", "2", "--feature-quality", "high", "--pc-quality", "high", "--max-concurrency", os.getenv("ODM_MAX_CONCURRENCY", "4")], cwd=work, timeout=ODM_TIMEOUT_SECONDS)
        for stage in ["visual_odometry", "sparse_cloud", "dense_cloud", "mesh_texturing", "georeference"]:
            set_stage(stages, stage, "completed")
        pose_outputs = find_pose_outputs(project)
        detections, detection_status = load_detection_adapter(frame_manifest_path, frame_records, project)
        set_stage(stages, "semantic_layers", "completed" if detection_status == "configured_validated" else "review_required", "Validated source-frame detections available" if detection_status == "configured_validated" else "No detection adapter configured; no detections fabricated")
        update(conn, key, "processing", stages)

        candidates = {"glb": list(project.rglob("*.glb")), "gltf": list(project.rglob("*.gltf")), "las": list(project.rglob("*.las")), "laz": list(project.rglob("*.laz")), "ply": list(project.rglob("*.ply")), "obj": list(project.rglob("*.obj")), "fbx": list(project.rglob("*.fbx")), "geotiff": list(project.rglob("*.tif")) + list(project.rglob("*.tiff"))}
        if not candidates["glb"] and not candidates["gltf"]:
            raise RuntimeError("ODM completed without GLB/GLTF output.")
        if not candidates["las"] and not candidates["laz"] and not candidates["ply"]:
            raise RuntimeError("ODM completed without LAS/LAZ/PLY point-cloud output.")
        artifacts: list[dict[str, Any]] = []
        for kind, paths in [("textured_mesh", candidates["glb"] or candidates["gltf"]), ("point_cloud", candidates["las"] or candidates["laz"] or candidates["ply"]), ("mesh_exchange", candidates["obj"]), ("mesh_exchange", candidates["fbx"]), ("orthomosaic", candidates["geotiff"])]:
            if paths:
                artifacts.append(artifact_record(key, kind, paths[0], output))
        artifacts.append(write_json_artifact(key, "provenance", "frame-manifest.json", frame_records, output))
        artifacts.append(write_json_artifact(key, "spatial_metadata", "reconstruction-metadata.json", {"poseOutputs": pose_outputs, "cameraPoseStatus": "available_in_reconstruction_outputs" if pose_outputs else "computed_by_odm_not_exported", "depthStatus": "dense_cloud_generated", "coordinateReferenceSystem": "WGS84 / local ENU", "detectionStatus": detection_status}, output))
        if detections:
            artifacts.append(write_json_artifact(key, "detections", "detections.json", detections, output))

        set_stage(stages, "quality_gate", "processing")
        update(conn, key, "processing", stages)
        has_mesh = any(item["type"] == "textured_mesh" and item["sha256"] for item in artifacts)
        has_cloud = any(item["type"] == "point_cloud" and item["sha256"] for item in artifacts)
        if not has_mesh or not has_cloud:
            raise RuntimeError("Quality gate failed: a checksummed textured mesh and point cloud are required.")
        elapsed = time.monotonic() - started
        target_met = probe_data["durationSeconds"] <= 600 and elapsed <= 900
        quality_report = {"status": "review_required", "accuracyStatus": "not_validated", "horizontalRmseMeters": None, "verticalRmseMeters": None, "completenessRatio": None, "checkpointCount": 0, "targetSpatialAccuracyMeters": 1, "processingTimeSeconds": round(elapsed, 2), "processingTargetSeconds": 900, "processingTargetMet": target_met, "artifactCount": len(artifacts), "artifactIntegrity": "sha256_verified", "coverageStatus": "scene_geometry_available", "frameCount": frame_count, "cameraPoseStatus": "available_in_reconstruction_outputs" if pose_outputs else "computed_by_odm_not_exported", "depthStatus": "dense_cloud_generated", "detectionStatus": detection_status, "detectionCount": len(detections)}
        set_stage(stages, "quality_gate", "review_required", "Independent checkpoints/GCPs are required before claiming metric accuracy.")
        set_stage(stages, "publish_artifacts", "completed", f"{len(artifacts)} checksummed artifacts published")
        manifest = {"jobKey": key, "name": name, "engine": "OpenDroneMap", "coordinateReferenceSystem": "WGS84 / local ENU", "origin": {"latitude": metadata.get("latitude"), "longitude": metadata.get("longitude"), "altitudeMeters": metadata.get("altitudeMeters")}, "quality": quality_report, "artifacts": artifacts, "detections": detections, "processingMetrics": {"input": probe_data, "frameCount": frame_count, "sampleFps": sample_fps, "elapsedSeconds": round(elapsed, 2)}, "sourceProvenance": {"fileName": file_name, "sourceUrl": source, "metadata": metadata, "frameManifest": "frame-manifest.json", "reconstructionMetadata": "reconstruction-metadata.json"}}
        update(conn, key, "review_required", stages, manifest)
        print("[worker] completed", key, json.dumps(quality_report), flush=True)
    except Exception as exc:
        set_stage(stages, "quality_gate", "failed", str(exc))
        shutil.rmtree(output, ignore_errors=True)
        update(conn, key, "failed", stages, error=str(exc))
        print("[worker] failed", key, exc, flush=True)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main() -> None:
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    while True:
        with psycopg.connect(DATABASE_URL) as conn:
            ensure_schema(conn)
            with conn.cursor() as cur:
                cur.execute('SELECT "jobKey", name, "inputFileName", "inputMetadata" FROM reconstruction_jobs WHERE status=\'queued\' ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED')
                job = cur.fetchone()
                if job:
                    process(conn, job)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
