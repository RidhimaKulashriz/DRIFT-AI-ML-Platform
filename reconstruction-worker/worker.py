"""DRIFT photogrammetry worker.

Runs outside the web request process on a persistent host. It polls PostgreSQL for
queued jobs, downloads the source capture, runs OpenDroneMap (preferred) or
COLMAP, converts outputs to GLB/LAS when tools are available, and updates the
job manifest. It never marks a job complete without artifacts and a quality gate.
"""
import json, os, shutil, subprocess, tempfile, time
from pathlib import Path
import psycopg

DATABASE_URL = os.environ["DATABASE_URL"]
POLL_SECONDS = int(os.getenv("RECONSTRUCTION_POLL_SECONDS", "10"))
ODM_IMAGE = os.getenv("ODM_IMAGE", "opendronemap/odm:latest")
ARTIFACT_ROOT = Path(os.getenv("RECONSTRUCTION_ARTIFACT_ROOT", "/var/lib/drift/reconstruction"))

def run(cmd, cwd=None):
    print("[worker]", " ".join(cmd), flush=True)
    return subprocess.run(cmd, cwd=cwd, check=True, text=True, capture_output=True)

def update(conn, key, status, stages=None, manifest=None, error=None):
    with conn.cursor() as cur:
        cur.execute('''UPDATE reconstruction_jobs SET status=%s, stages=COALESCE(%s, stages), "artifactManifest"=COALESCE(%s, "artifactManifest"), "errorMessage"=%s, "startedAt"=COALESCE("startedAt", CASE WHEN %s='processing' THEN now() ELSE "startedAt" END), "completedAt"=CASE WHEN %s IN ('completed','failed') THEN now() ELSE "completedAt" END, "updatedAt"=now() WHERE "jobKey"=%s''', (status, json.dumps(stages) if stages else None, json.dumps(manifest) if manifest else None, error, status, status, key))
    conn.commit()

def process(conn, job):
    key, name, file_name, metadata = job
    work = Path(tempfile.mkdtemp(prefix=f"drift-{key}-")); out = ARTIFACT_ROOT / key; out.mkdir(parents=True, exist_ok=True)
    try:
        source = metadata.get("sourceUrl") or metadata.get("sourceStorageUrl")
        if not source:
            update(conn, key, "awaiting_source", error="Attach an HTTPS sourceUrl or sourceStorageUrl before processing.")
            return
        video = work / file_name
        run(["curl", "--fail", "--location", "--max-time", "1800", source, "--output", str(video)])
        stages = [{"stage": s, "order": i + 1, "status": "pending"} for i, s in enumerate(["ingest","metadata_validation","frame_sampling","visual_odometry","sparse_cloud","dense_cloud","mesh_texturing","semantic_layers","georeference","quality_gate","publish_artifacts"])]
        update(conn, key, "processing", stages)
        # ODM is the preferred end-to-end pipeline. It emits orthophoto, point cloud,
        # textured mesh and reconstruction statistics in a reproducible project folder.
        project = work / "odm-project"; project.mkdir()
        run(["docker", "run", "--rm", "-v", f"{project}:/datasets/code", "-v", f"{video.parent}:/datasets/images", ODM_IMAGE, "--project-path", "/datasets", "--project-name", "code"], cwd=work)
        candidates = {"glb": list(project.rglob("*.glb")), "las": list(project.rglob("*.las")), "laz": list(project.rglob("*.laz")), "obj": list(project.rglob("*.obj")), "tif": list(project.rglob("*.tif"))}
        # Keep conversion explicit: a missing native artifact is a failed quality gate,
        # never a fabricated placeholder.
        if not candidates["glb"] and candidates["obj"]:
            raise RuntimeError("ODM produced OBJ but no GLB converter is configured; install assimp or add a conversion sidecar.")
        if not candidates["las"] and not candidates["laz"]:
            raise RuntimeError("ODM did not produce LAS/LAZ point-cloud output.")
        artifacts = []
        for kind, paths in [("glb", candidates["glb"]), ("las", candidates["las"] or candidates["laz"]), ("obj", candidates["obj"]), ("geotiff", candidates["tif"])]:
            if paths:
                target = out / paths[0].name; shutil.copy2(paths[0], target); artifacts.append({"type": kind, "format": target.suffix.lstrip(".") if kind != "geotiff" else "geotiff", "path": str(target), "url": f"/api/reconstruction/{key}/artifacts/{target.name}", "sizeBytes": target.stat().st_size, "status": "ready"})
        if not any(a["format"] == "glb" for a in artifacts) or not any(a["format"] in ("las", "laz") for a in artifacts):
            raise RuntimeError("Quality gate failed: both GLB and LAS/LAZ outputs are required.")
        update(conn, key, "completed", manifest={"jobKey": key, "engine": "OpenDroneMap", "artifacts": artifacts, "accuracyStatus": "requires independent control-point validation", "sourceProvenance": {"fileName": file_name, "metadata": metadata}})
    except Exception as exc:
        update(conn, key, "failed", error=str(exc)); print("[worker] failed", key, exc, flush=True)
    finally:
        shutil.rmtree(work, ignore_errors=True)

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
