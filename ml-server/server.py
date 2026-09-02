"""
DRIFT ML Inference Server
Wraps Hitakshi's 4-model pipeline as an HTTP API for the DRIFT backend.

Models:
  CRACK  — Local YOLO (main_crack.pt)
  ROAD   — Local YOLO (main_road.pt)
  RAILWAY — Roboflow API (railway-track-fault-detection-hrem8/3)
  RUST   — Roboflow API (corrosion-yolov8/4)

Run:
  pip install fastapi uvicorn ultralytics inference-sdk opencv-python numpy python-multipart
  python server.py

DRIFT backend connects via ML_INFERENCE_URL=http://localhost:8000/detect
"""

import os
import io
import json
import base64
import tempfile
import subprocess
import sys
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="DRIFT ML Inference Server", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Path to Hitakshi's main_app1.py — adjust if needed
ML_SCRIPT = os.environ.get("ML_SCRIPT_PATH", str(Path(__file__).parent.parent / "ml-models" / "main_app1.py"))
ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")

# ── DRIFT-compatible response schema ──────────────────────────────────────────

class BoundingBox(BaseModel):
    x: float   # percent 0-100
    y: float
    width: float
    height: float

class Detection(BaseModel):
    model: str            # "CRACK", "ROAD", "RAILWAY", "RUST", "gemini-2.5-flash"
    label: str            # "crack", "pothole", "corrosion", etc.
    confidence: float     # 0-1
    boundingBox: BoundingBox
    severity: str         # "low", "medium", "high", "critical"
    classId: Optional[int] = None

class DetectResponse(BaseModel):
    success: bool
    model: str
    detections: list[Detection]
    annotatedImageBase64: Optional[str] = None
    rawJson: Optional[dict] = None


# ── Mapping from Hitakshi's labels to DRIFT defect types ──────────────────────

LABEL_MAP = {
    # CRACK model
    "crack": "crack",
    "cracks": "crack",
    "Crack": "crack",
    "Cracks": "crack",
    # ROAD model
    "pothole": "pothole",
    "Pothole": "pothole",
    "road_damage": "crack",
    "potholes": "pothole",
    "Longitudinal Crack": "crack",
    "Transverse Crack": "crack",
    "Alligator Crack": "crack",
    "potholes": "pothole",
    "rutting": "settlement",
    "patching": "spalling",
    "bumps": "settlement",
    "crosswalk fading": "surface_damage",
    "white line fading": "surface_damage",
    "manhole": "obstruction",
    "utility hole": "obstruction",
    "road_crosswalk": "surface_damage",
    "road_bumps": "settlement",
    "road_longitudinal_crack": "crack",
    "road_transverse_crack": "crack",
    "road_alligator_crack": "crack",
    "road_potholes": "pothole",
    # RAILWAY model
    "railway": "rail_alignment",
    "track_fault": "rail_alignment",
    "defective": "rail_alignment",
    "fault": "rail_alignment",
    # RUST / CORROSION model
    "corrosion": "corrosion",
    "Corrosion": "corrosion",
    "rust": "corrosion",
    "Rust": "corrosion",
}

MODEL_MAP = {
    "CRACK": "hitakshi-crack-yolo",
    "ROAD": "hitakshi-road-yolo",
    "RAILWAY": "hitakshi-railway-roboflow",
    "RUST": "hitakshi-rust-roboflow",
}


def map_label(raw_label: str) -> str:
    """Map Hitakshi's label to DRIFT defect type."""
    return LABEL_MAP.get(raw_label, LABEL_MAP.get(raw_label.lower(), raw_label.lower()))


def estimate_severity(confidence: float, label: str) -> str:
    """Deterministic severity from confidence + defect type (no randomness)."""
    critical_types = {"structural", "exposed_rebar", "settlement", "rail_alignment"}
    high_types = {"corrosion", "spalling", "pothole"}
    
    if label in critical_types:
        if confidence >= 0.85: return "critical"
        if confidence >= 0.60: return "high"
        return "medium"
    if label in high_types:
        if confidence >= 0.90: return "high"
        if confidence >= 0.70: return "medium"
        return "low"
    # default (crack, surface_damage, etc.)
    if confidence >= 0.85: return "high"
    if confidence >= 0.60: return "medium"
    return "low"


# ── Run Hitakshi's pipeline ───────────────────────────────────────────────────

def run_hitakshi_pipeline(image_bytes: bytes, filename: str, confidence: float = 0.25, imgsz: int = 640) -> list[dict]:
    """
    Run Hitakshi's main_app1.py on the image and parse JSON output.
    Returns list of raw detection dicts.
    """
    # Write image to temp file
    with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix or ".jpg", delete=False) as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name
    
    output_dir = tempfile.mkdtemp()
    json_path = None
    
    try:
        # Build command
        cmd = [
            sys.executable, ML_SCRIPT,
            "--source", tmp_path,
            "--imgsz", str(imgsz),
            "--conf", str(confidence),
        ]
        
        # Set environment
        env = os.environ.copy()
        if ROBOFLOW_API_KEY:
            env["ROBOFLOW_API_KEY"] = ROBOFLOW_API_KEY
        
        # Run
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, env=env, cwd=str(Path(ML_SCRIPT).parent))
        
        if result.returncode != 0:
            print(f"[ML Server] Pipeline error: {result.stderr[:500]}")
        
        # Find the JSON output
        # Hitakshi's output goes to outputs/<stem>/<stem>.json
        stem = Path(filename).stem
        json_candidates = [
            Path(ML_SCRIPT).parent / "outputs" / stem / f"{stem}.json",
            Path(output_dir) / f"{stem}.json",
        ]
        for candidate in json_candidates:
            if candidate.exists():
                json_path = candidate
                break
        
        # Also try to find any .json in outputs/
        if not json_path:
            outputs_dir = Path(ML_SCRIPT).parent / "outputs"
            if outputs_dir.exists():
                for sub in outputs_dir.iterdir():
                    if sub.is_dir():
                        for f in sub.glob("*.json"):
                            json_path = f
                            break
                    if json_path:
                        break
        
        if json_path and json_path.exists():
            with open(json_path) as f:
                data = json.load(f)
            # Hitakshi's JSON is a list of detections or a dict with detections
            if isinstance(data, list):
                return data
            elif isinstance(data, dict) and "detections" in data:
                return data["detections"]
            return []
        
        # Fallback: parse stdout for detection lines
        detections = []
        for line in result.stdout.split("\n"):
            line = line.strip()
            if "|" in line and any(m in line for m in ["CRACK", "ROAD", "RAILWAY", "RUST"]):
                parts = [p.strip() for p in line.split("|")]
                if len(parts) >= 3:
                    model = parts[0]
                    label = parts[1]
                    conf_str = parts[2].replace("%", "").strip()
                    try:
                        conf = float(conf_str) / 100
                        detections.append({
                            "model": model,
                            "label": label,
                            "confidence": conf,
                        })
                    except ValueError:
                        pass
        return detections
    
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        try:
            import shutil
            shutil.rmtree(output_dir, ignore_errors=True)
        except Exception:
            pass


def parse_detections(raw_detections: list[dict]) -> list[Detection]:
    """Convert Hitakshi's raw detection dicts to DRIFT Detection format."""
    results = []
    for d in raw_detections:
        model_key = d.get("model", "unknown")
        raw_label = d.get("label", "unknown")
        confidence = d.get("confidence", 0)
        
        # Parse bounding box — Hitakshi uses [x1, y1, x2, y2] in pixels or bounding_box dict
        bbox_data = d.get("bounding_box", {})
        if isinstance(bbox_data, dict):
            x1 = bbox_data.get("x1", bbox_data.get("top_left", [0, 0])[0] if isinstance(bbox_data.get("top_left"), list) else 0)
            y1 = bbox_data.get("y1", bbox_data.get("top_left", [0, 0])[1] if isinstance(bbox_data.get("top_left"), list) else 0)
            x2 = bbox_data.get("x2", bbox_data.get("bottom_right", [100, 100])[0] if isinstance(bbox_data.get("bottom_right"), list) else 100)
            y2 = bbox_data.get("y2", bbox_data.get("bottom_right", [100, 100])[1] if isinstance(bbox_data.get("bottom_right"), list) else 100)
        else:
            x1, y1, x2, y2 = 0, 0, 100, 100
        
        # Convert to percentages (assume standard image size if pixel coords)
        img_w = d.get("image_width", max(x2, 100))
        img_h = d.get("image_height", max(y2, 100))
        
        if img_w > 0 and img_h > 0 and (x2 > 100 or y2 > 100):
            # Pixel coordinates — convert to percent
            bx = (x1 / img_w) * 100
            by = (y1 / img_h) * 100
            bw = ((x2 - x1) / img_w) * 100
            bh = ((y2 - y1) / img_h) * 100
        else:
            # Already percent or normalized
            bx, by = x1, y1
            bw = max(x2 - x1, 1)
            bh = max(y2 - y1, 1)
        
        mapped_label = map_label(raw_label)
        severity = estimate_severity(confidence, mapped_label)
        
        results.append(Detection(
            model=MODEL_MAP.get(model_key, model_key),
            label=mapped_label,
            confidence=round(confidence, 4),
            boundingBox=BoundingBox(
                x=round(max(0, min(100, bx)), 1),
                y=round(max(0, min(100, by)), 1),
                width=round(max(1, min(100, bw)), 1),
                height=round(max(1, min(100, bh)), 1),
            ),
            severity=severity,
            classId=d.get("class_id"),
        ))
    
    return results


# ── API Endpoints ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    script_exists = Path(ML_SCRIPT).exists()
    return {
        "status": "healthy" if script_exists else "degraded",
        "mlScript": ML_SCRIPT,
        "scriptExists": script_exists,
        "roboflowKey": "configured" if ROBOFLOW_API_KEY else "missing",
    }


@app.post("/detect", response_model=DetectResponse)
async def detect(
    file: UploadFile = File(...),
    confidence: float = 0.25,
    imgsz: int = 640,
):
    """
    Run Hitakshi's 4-model pipeline on the uploaded image.
    Returns DRIFT-compatible detection results.
    """
    if not Path(ML_SCRIPT).exists():
        raise HTTPException(
            status_code=503,
            detail=f"ML script not found at {ML_SCRIPT}. Set ML_SCRIPT_PATH environment variable."
        )
    
    image_bytes = await file.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(image_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 20MB)")
    
    filename = file.filename or "upload.jpg"
    
    try:
        raw_detections = run_hitakshi_pipeline(image_bytes, filename, confidence, imgsz)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="ML inference timed out (120s limit)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ML pipeline error: {str(e)}")
    
    detections = parse_detections(raw_detections)
    
    # Determine which models were used
    models_used = list(set(d.model for d in detections)) if detections else ["none"]
    
    return DetectResponse(
        success=True,
        model="+".join(models_used),
        detections=detections,
        rawJson={"rawDetections": raw_detections, "count": len(raw_detections)},
    )


@app.post("/detect-base64", response_model=DetectResponse)
async def detect_base64(body: dict):
    """
    DRIFT backend sends base64 images here.
    Accepts: { imageBase64, fileName, confidence, imgsz }
    """
    image_b64 = body.get("imageBase64", "")
    filename = body.get("fileName", "upload.jpg")
    confidence = body.get("confidence", 0.25)
    imgsz = body.get("imgsz", 640)
    
    if not image_b64:
        raise HTTPException(status_code=400, detail="imageBase64 required")
    
    # Strip data URL prefix if present
    if "," in image_b64 and image_b64.startswith("data:"):
        image_b64 = image_b64.split(",", 1)[1]
    
    try:
        image_bytes = base64.b64decode(image_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64")
    
    if len(image_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large")
    
    try:
        raw_detections = run_hitakshi_pipeline(image_bytes, filename, confidence, imgsz)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="ML inference timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ML pipeline error: {str(e)}")
    
    detections = parse_detections(raw_detections)
    models_used = list(set(d.model for d in detections)) if detections else ["none"]
    
    return DetectResponse(
        success=True,
        model="+".join(models_used),
        detections=detections,
        rawJson={"rawDetections": raw_detections, "count": len(raw_detections)},
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ML_PORT", 8000))
    print(f"[DRIFT ML Server] Starting on port {port}")
    print(f"[DRIFT ML Server] Script: {ML_SCRIPT}")
    print(f"[DRIFT ML Server] Script exists: {Path(ML_SCRIPT).exists()}")
    print(f"[DRIFT ML Server] Roboflow key: {'configured' if ROBOFLOW_API_KEY else 'MISSING'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
