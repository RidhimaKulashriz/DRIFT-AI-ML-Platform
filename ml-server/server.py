"""
DRIFT ML Inference Server — Hitakshi's 4-Model Pipeline
========================================================
Models: CRACK (YOLO), ROAD (YOLO), RAILWAY (Roboflow), RUST (Roboflow)

Run:
  pip install -r requirements.txt
  python server.py

DRIFT backend connects via ML_INFERENCE_URL
"""

import os
import io
import sys
import json
import base64
import tempfile
import traceback
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="DRIFT ML — Hitakshi Models", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Config ────────────────────────────────────────────────────────────────────
ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")
CRACK_MODEL_PATH = os.environ.get("CRACK_MODEL_PATH", "cracks/main_crack.pt")
ROAD_MODEL_PATH = os.environ.get("ROAD_MODEL_PATH", "road-ml/main_road.pt")

# ── Lazy-load models ──────────────────────────────────────────────────────────
_crack_model = None
_road_model = None

def get_crack_model():
    global _crack_model
    if _crack_model is None:
        from ultralytics import YOLO
        path = Path(CRACK_MODEL_PATH)
        if not path.exists():
            # Try relative to script
            path = Path(__file__).parent / CRACK_MODEL_PATH
        if not path.exists():
            raise FileNotFoundError(f"Crack model not found: {CRACK_MODEL_PATH}")
        print(f"[ML] Loading CRACK model from {path}")
        _crack_model = YOLO(str(path))
        print(f"[ML] CRACK model loaded. Classes: {_crack_model.names}")
    return _crack_model

def get_road_model():
    global _road_model
    if _road_model is None:
        from ultralytics import YOLO
        path = Path(ROAD_MODEL_PATH)
        if not path.exists():
            path = Path(__file__).parent / ROAD_MODEL_PATH
        if not path.exists():
            raise FileNotFoundError(f"Road model not found: {ROAD_MODEL_PATH}")
        print(f"[ML] Loading ROAD model from {path}")
        _road_model = YOLO(str(path))
        print(f"[ML] ROAD model loaded. Classes: {_road_model.names}")
    return _road_model

def get_railway_detections(image_bytes: bytes, conf: float = 0.25):
    """Run Railway model via Roboflow API."""
    if not ROBOFLOW_API_KEY:
        return []
    try:
        from inference_sdk import InferenceHTTPClient
        client = InferenceHTTPClient(api_url="https://serverless.roboflow.com", api_key=ROBOFLOW_API_KEY)
        temp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
        temp.write(image_bytes)
        temp.close()
        try:
            result = client.infer(temp.name, model_id="railway-track-fault-detection-hrem8/3")
            detections = []
            for pred in result.get("predictions", []):
                if pred.get("confidence", 0) >= conf:
                    detections.append({
                        "model": "RAILWAY",
                        "label": pred.get("class", "railway_fault"),
                        "confidence": pred.get("confidence", 0),
                        "x": pred.get("x", 0),
                        "y": pred.get("y", 0),
                        "width": pred.get("width", 0),
                        "height": pred.get("height", 0),
                    })
            return detections
        finally:
            os.unlink(temp.name)
    except Exception as e:
        print(f"[ML] Railway model error: {e}")
        return []

def get_rust_detections(image_bytes: bytes, conf: float = 0.25):
    """Run Rust/Corrosion model via Roboflow API."""
    if not ROBOFLOW_API_KEY:
        return []
    try:
        from inference_sdk import InferenceHTTPClient
        client = InferenceHTTPClient(api_url="https://serverless.roboflow.com", api_key=ROBOFLOW_API_KEY)
        temp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
        temp.write(image_bytes)
        temp.close()
        try:
            result = client.infer(temp.name, model_id="corrosion-yolov8/4")
            detections = []
            for pred in result.get("predictions", []):
                if pred.get("confidence", 0) >= conf:
                    detections.append({
                        "model": "RUST",
                        "label": pred.get("class", "corrosion"),
                        "confidence": pred.get("confidence", 0),
                        "x": pred.get("x", 0),
                        "y": pred.get("y", 0),
                        "width": pred.get("width", 0),
                        "height": pred.get("height", 0),
                    })
            return detections
        finally:
            os.unlink(temp.name)
    except Exception as e:
        print(f"[ML] Rust model error: {e}")
        return []

def run_local_yolo(model, image_bytes: bytes, model_name: str, conf: float = 0.25, imgsz: int = 640):
    """Run a local YOLO model on image bytes."""
    try:
        import numpy as np
        import cv2
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return []
        
        h, w = img.shape[:2]
        results = model(img, imgsz=imgsz, conf=conf, verbose=False)
        
        detections = []
        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                label = r.names.get(cls_id, f"class_{cls_id}")
                confidence = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                
                # Convert to percent
                bx = (x1 / w) * 100
                by = (y1 / h) * 100
                bw = ((x2 - x1) / w) * 100
                bh = ((y2 - y1) / h) * 100
                
                detections.append({
                    "model": model_name,
                    "label": label,
                    "confidence": confidence,
                    "x": round(bx, 1),
                    "y": round(by, 1),
                    "width": round(bw, 1),
                    "height": round(bh, 1),
                })
        return detections
    except Exception as e:
        print(f"[ML] {model_name} error: {e}")
        return []

# ── Label mapping to DRIFT defect types ───────────────────────────────────────
LABEL_MAP = {
    "crack": "crack", "cracks": "crack", "Crack": "crack",
    "pothole": "pothole", "potholes": "pothole", "Pothole": "pothole",
    "corrosion": "corrosion", "Corrosion": "corrosion", "rust": "corrosion",
    "spalling": "spalling", "patching": "spalling",
    "settlement": "settlement", "rutting": "settlement", "bumps": "settlement",
    "obstruction": "obstruction", "manhole": "obstruction",
    "railway": "rail_alignment", "track_fault": "rail_alignment", "defective": "rail_alignment",
    "Longitudinal Crack": "crack", "Transverse Crack": "crack", "Alligator Crack": "crack",
    "potholes": "pothole", "surface_crack": "crack",
}

MODEL_NAME_MAP = {
    "CRACK": "hitakshi-crack-yolo",
    "ROAD": "hitakshi-road-yolo",
    "RAILWAY": "hitakshi-railway-roboflow",
    "RUST": "hitakshi-rust-roboflow",
}

def map_label(raw: str) -> str:
    return LABEL_MAP.get(raw, LABEL_MAP.get(raw.lower(), raw.lower()))

def estimate_severity(conf: float, label: str) -> str:
    critical = {"structural", "exposed_rebar", "settlement", "rail_alignment"}
    high = {"corrosion", "spalling", "pothole"}
    if label in critical:
        return "critical" if conf >= 0.85 else "high" if conf >= 0.60 else "medium"
    if label in high:
        return "high" if conf >= 0.90 else "medium" if conf >= 0.70 else "low"
    return "high" if conf >= 0.85 else "medium" if conf >= 0.60 else "low"

# ── API Endpoints ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "models": {
            "crack": Path(CRACK_MODEL_PATH).exists() or Path(Path(__file__).parent / CRACK_MODEL_PATH).exists(),
            "road": Path(ROAD_MODEL_PATH).exists() or Path(Path(__file__).parent / ROAD_MODEL_PATH).exists(),
            "railway": "robough" if ROBOFLOW_API_KEY else "no-key",
            "rust": "robough" if ROBOFLOW_API_KEY else "no-key",
        },
        "roboflowKey": "configured" if ROBOFLOW_API_KEY else "missing",
    }

@app.post("/detect-base64")
async def detect_base64(body: dict):
    """DRIFT backend sends base64 images here."""
    image_b64 = body.get("imageBase64", "")
    confidence = body.get("confidence", 0.25)
    imgsz = body.get("imgsz", 640)
    
    if not image_b64:
        raise HTTPException(400, "imageBase64 required")
    
    if "," in image_b64 and image_b64.startswith("data:"):
        image_b64 = image_b64.split(",", 1)[1]
    
    try:
        image_bytes = base64.b64decode(image_b64)
    except Exception:
        raise HTTPException(400, "Invalid base64")
    
    if len(image_bytes) > 20 * 1024 * 1024:
        raise HTTPException(400, "Image too large")
    
    return _run_all_models(image_bytes, confidence, imgsz)

@app.post("/detect")
async def detect_file(file: UploadFile = File(...), confidence: float = 0.25, imgsz: int = 640):
    """Upload file directly."""
    image_bytes = await file.read()
    if len(image_bytes) == 0:
        raise HTTPException(400, "Empty file")
    return _run_all_models(image_bytes, confidence, imgsz)

def _run_all_models(image_bytes: bytes, confidence: float, imgsz: int):
    """Run all 4 models and combine results."""
    all_detections = []
    models_used = []
    
    # 1. CRACK model (local YOLO)
    try:
        model = get_crack_model()
        dets = run_local_yolo(model, image_bytes, "CRACK", confidence, imgsz)
        all_detections.extend(dets)
        if dets:
            models_used.append("CRACK")
    except Exception as e:
        print(f"[ML] CRACK skipped: {e}")
    
    # 2. ROAD model (local YOLO)
    try:
        model = get_road_model()
        dets = run_local_yolo(model, image_bytes, "ROAD", confidence, imgsz)
        all_detections.extend(dets)
        if dets:
            models_used.append("ROAD")
    except Exception as e:
        print(f"[ML] ROAD skipped: {e}")
    
    # 3. RAILWAY model (Roboflow)
    try:
        dets = get_railway_detections(image_bytes, confidence)
        all_detections.extend(dets)
        if dets:
            models_used.append("RAILWAY")
    except Exception as e:
        print(f"[ML] RAILWAY skipped: {e}")
    
    # 4. RUST model (Roboflow)
    try:
        dets = get_rust_detections(image_bytes, confidence)
        all_detections.extend(dets)
        if dets:
            models_used.append("RUST")
    except Exception as e:
        print(f"[ML] RUST skipped: {e}")
    
    # Map to DRIFT format
    mapped = []
    for d in all_detections:
        mapped_label = map_label(d["label"])
        mapped.append({
            "model": MODEL_NAME_MAP.get(d["model"], d["model"]),
            "label": mapped_label,
            "confidence": round(d["confidence"], 4),
            "boundingBox": {
                "x": round(max(0, min(100, d["x"])), 1),
                "y": round(max(0, min(100, d["y"])), 1),
                "width": round(max(1, min(100, d["width"])), 1),
                "height": round(max(1, min(100, d["height"])), 1),
            },
            "severity": estimate_severity(d["confidence"], mapped_label),
        })
    
    return {
        "success": True,
        "model": "+".join(models_used) if models_used else "none",
        "detections": mapped,
        "count": len(mapped),
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ML_PORT", 8000))
    print(f"[DRIFT ML Server] Port: {port}")
    print(f"[DRIFT ML Server] CRACK model: {CRACK_MODEL_PATH}")
    print(f"[DRIFT ML Server] ROAD model: {ROAD_MODEL_PATH}")
    print(f"[DRIFT ML Server] Roboflow: {'configured' if ROBOFLOW_API_KEY else 'MISSING'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
