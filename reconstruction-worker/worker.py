"""DRIFT SIH26158 photogrammetry worker.

The web process only queues immutable source metadata. This worker performs the
heavy pipeline on a persistent host with Docker and enough CPU/RAM/disk.
"""
import json, os, shutil, subprocess, tempfile, time
from pathlib import Path
import psycopg

DATABASE_URL = os.environ["DATABASE_URL"]
POLL_SECONDS = int(os.getenv("RECONSTRUCTION_POLL_SECONDS", "10"))
ODM_IMAGE = os.getenv("ODM_IMAGE", "opendronemap/odm:latest")
ARTIFACT_ROOT = Path(os.getenv("RECONSTRUCTION_ARTIFACT_ROOT", "/var/lib/drift/reconstruction"))
MAX_FRAMES = int(os.getenv("RECONSTRUCTION_MAX_FRAMES", "900"))

STAGE_NAMES = ["ingest", "metadata_validation", "frame_sampling", "visual_odometry", "sparse_cloud", "dense_cloud", "mesh_texturing", "semantic_layers", "georeference", "quality_gate", "publish_artifacts"]

def run(cmd, cwd=None):
    print("[worker]", " ".join(cmd), flush=True)
    return subprocess.run(cmd, cwd=cwd, check=True, text=True, capture_output=True)

def set_stage(stages, name, status, detail=None):
    for stage in stages:
        if stage["stage"] == name:
            stage["status"] = status
            if detail: stage["detail"] = detail
            return

def update(conn, key, status, stages=None, manifest=None, error=None):
    with conn.cursor() as cur:
        cur.execute('''UPDATE reconstruction_jobs SET status=%s, stages=COALESCE(%s, stages), "artifactManifest"=COALESCE(%s, "artifactManifest"), "errorMessage"=%s, "startedAt"=COALESCE("startedAt", CASE WHEN %s='processing' THEN now() ELSE "startedAt" END), "completedAt"=CASE WHEN %s IN ('completed','failed') THEN now() ELSE "completedAt" END, "updatedAt"=now() WHERE "jobKey"=%s''', (status, json.dumps(stages) if stages is not None else None, json.dumps(manifest) if manifest else None, error, status, status, key))
    conn.commit()

def probe(video):
    result = run(["ffprobe", "-v", "error", "-show_entries", "format=duration,size:stream=width,height,r_frame_rate", "-of", "json", str(video)])
    data = json.loads(result.stdout); stream = next((s for s in data.get("streams", []) if "width" in s), {})
    return {"durationSeconds": float(data.get("format", {}).get("duration", 0)), "sizeBytes": int(data.get("format", {}).get("size", 0)), "width": int(stream.get("width", 0)), "height": int(stream.get("height", 0)), "frameRate": stream.get("r_frame_rate")}

def process(conn, job):
    key, name, file_name, metadata = job
    work = Path(tempfile.mkdtemp(prefix=f"drift-{key}-")); out = ARTIFACT_ROOT / key; out.mkdir(parents=True, exist_ok=True)
    stages = [{"stage": s, "order": i + 1, "status": "pending"} for i, s in enumerate(STAGE_NAMES)]
    try:
        source = metadata.get("sourceUrl") or metadata.get("sourceStorageUrl")
        if not source:
            update(conn, key, "awaiting_source", stages, error="Attach an HTTPS sourceUrl or sourceStorageUrl before processing.")
            return
        update(conn, key, "processing", stages)
        video = work / Path(file_name).name
        set_stage(stages, "ingest", "processing"); update(conn, key, "processing", stages)
        run(["curl", "--fail", "--location", "--retry", "3", "--max-time", "1800", source, "--output", str(video)])
        probe_data = probe(video)
        if probe_data["durationSeconds"] <= 0 or probe_data["width"] < 640: raise RuntimeError("Input video probe failed or resolution is below 640 pixels.")
        set_stage(stages, "ingest", "completed", f"{probe_data['width']}x{probe_data['height']} {probe_data['durationSeconds']:.1f}s")
        set_stage(stages, "metadata_validation", "completed", "Video stream and source metadata validated")
        project = work / "odm-project"; dataset = project / "drift"; images = dataset / "images"; images.mkdir(parents=True)
        set_stage(stages, "frame_sampling", "processing"); update(conn, key, "processing", stages)
        sample_fps = min(2.0, max(0.5, MAX_FRAMES / max(probe_data["durationSeconds"], 1)))
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(video), "-vf", f"fps={sample_fps:.4f},scale='min(3840,iw)':-2", "-q:v", "2", str(images / "frame-%06d.jpg")])
        frame_count = len(list(images.glob("*.jpg")))
        if frame_count < 20: raise RuntimeError(f"Only {frame_count} frames were extracted; at least 20 overlapping frames are required.")
        set_stage(stages, "frame_sampling", "completed", f"{frame_count} frames at {sample_fps:.3f} fps")
        set_stage(stages, "visual_odometry", "processing"); update(conn, key, "processing", stages)
        # ODM runs OpenSfM/OpenMVS-style aerial reconstruction and produces
        # georeferenced point clouds, textured meshes, orthophotos, and reports.
        run(["docker", "run", "--rm", "-v", f"{project}:/datasets", ODM_IMAGE, "--project-path", "/datasets", "drift", "--gltf", "--pc-las", "--orthophoto-resolution", "2", "--feature-quality", "high", "--pc-quality", "high", "--max-concurrency", os.getenv("ODM_MAX_CONCURRENCY", "4")], cwd=work)
        for stage in ["visual_odometry", "sparse_cloud", "dense_cloud", "mesh_texturing", "georeference"]: set_stage(stages, stage, "completed")
        set_stage(stages, "semantic_layers", "completed", "Base geometry published; semantic model is an explicit extension stage")
        candidates = {"glb": list(project.rglob("*.glb")), "gltf": list(project.rglob("*.gltf")), "las": list(project.rglob("*.las")), "laz": list(project.rglob("*.laz")), "ply": list(project.rglob("*.ply")), "obj": list(project.rglob("*.obj")), "tif": list(project.rglob("*.tif"))}
        if not candidates["glb"] and not candidates["gltf"]: raise RuntimeError("ODM completed without GLB/GLTF output.")
        if not candidates["las"] and not candidates["laz"] and not candidates["ply"]: raise RuntimeError("ODM completed without LAS/LAZ/PLY point-cloud output.")
        artifacts = []
        for kind, paths in [("glb", candidates["glb"] or candidates["gltf"]), ("las", candidates["las"] or candidates["laz"] or candidates["ply"]), ("obj", candidates["obj"]), ("geotiff", candidates["tif"])]:
            if paths:
                target = out / paths[0].name; shutil.copy2(paths[0], target); artifacts.append({"type": kind, "format": target.suffix.lstrip(".") if kind != "geotiff" else "geotiff", "path": str(target), "url": f"/api/reconstruction/{key}/artifacts/{target.name}", "sizeBytes": target.stat().st_size, "status": "ready"})
        set_stage(stages, "quality_gate", "processing"); update(conn, key, "processing", stages)
        if not any(a["format"] in ("glb", "gltf") for a in artifacts) or not any(a["format"] in ("las", "laz", "ply") for a in artifacts): raise RuntimeError("Quality gate failed: textured model and point cloud are both required.")
        set_stage(stages, "quality_gate", "review_required", "Independent checkpoints/GCPs are required to claim metric accuracy")
        set_stage(stages, "publish_artifacts", "completed")
        update(conn, key, "completed", stages, {"jobKey": key, "engine": "OpenDroneMap", "artifacts": artifacts, "processingMetrics": {"input": probe_data, "frameCount": frame_count, "sampleFps": sample_fps}, "accuracyStatus": "review_required_until_checkpoint_validation", "sourceProvenance": {"fileName": file_name, "sourceUrl": source, "metadata": metadata}})
    except Exception as exc:
        set_stage(stages, "quality_gate", "failed", str(exc)); update(conn, key, "failed", stages, error=str(exc)); print("[worker] failed", key, exc, flush=True)
    finally: shutil.rmtree(work, ignore_errors=True)

def main():
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    while True:
        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT \"jobKey\", name, \"inputFileName\", \"inputMetadata\" FROM reconstruction_jobs WHERE status='queued' ORDER BY \"createdAt\" LIMIT 1 FOR UPDATE SKIP LOCKED")
                job = cur.fetchone()
                if job: process(conn, job)
        time.sleep(POLL_SECONDS)
if __name__ == "__main__": main()
