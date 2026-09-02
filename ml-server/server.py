"""
DRIFT ML Server — Hitakshi's Real YOLO Models Only
====================================================
FREE TIER: Loads ONE model at a time, unloads after each detection.
Slow (~30-60s per detection) but REAL ML — no Gemini, no fake, no fallback.

Models:
  1. CRACK — local YOLO (main_crack.pt)
  2. ROAD — local YOLO (main_road.pt)
  3. RAILWAY — Roboflow HTTP API
  4. RUST — Roboflow HTTP API
"""
import os, json, base64, gc, io, time, traceback
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="DRIFT ML — Hitakshi YOLO", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")
CRACK_MODEL_PATH = os.environ.get("CRACK_MODEL_PATH", "cracks/main_crack.pt")
ROAD_MODEL_PATH = os.environ.get("ROAD_MODEL_PATH", "road-ml/main_road.pt")

LABEL_MAP = {
    "crack": "crack", "cracks": "crack", "Crack": "crack",
    "Longitudinal Crack": "crack", "Transverse Crack": "crack", "Alligator Crack": "crack",
    "surface_crack": "crack", "pothole": "pothole", "potholes": "pothole", "Pothole": "pothole",
    "corrosion": "corrosion", "Corrosion": "corrosion", "rust": "corrosion",
    "spalling": "spalling", "patching": "spalling",
    "settlement": "settlement", "rutting": "settlement", "bumps": "settlement",
    "obstruction": "obstruction", "manhole": "obstruction",
    "Defective": "rail_alignment", "defective": "rail_alignment",
}

def map_label(raw):
    return LABEL_MAP.get(raw, LABEL_MAP.get(raw.lower(), raw.lower()))

def estimate_severity(conf, label):
    critical = {"structural", "exposed_rebar", "settlement", "rail_alignment"}
    high = {"corrosion", "spalling", "pothole"}
    if label in critical:
        return "critical" if conf >= 0.85 else "high" if conf >= 0.60 else "medium"
    if label in high:
        return "high" if conf >= 0.90 else "medium" if conf >= 0.70 else "low"
    return "high" if conf >= 0.85 else "medium" if conf >= 0.60 else "low"

def load_yolo(model_path):
    """Load YOLO model one at a time."""
    from ultralytics import YOLO
    path = Path(model_path)
    if not path.exists():
        path = Path(__file__).parent / model_path
    if not path.exists():
        raise FileNotFoundError(f"Model not found: {model_path} (looked at {path.absolute()})")
    print(f"[ML] Loading YOLO model: {path}")
    t0 = time.time()
    model = YOLO(str(path))
    print(f"[ML] Model loaded in {time.time()-t0:.1f}s — classes: {model.names}")
    return model

def run_yolo(model, image_bytes, model_name, conf=0.25, imgsz=640):
    """Run YOLO on image bytes, return detections."""
    import numpy as np, cv2
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return []
    h, w = img.shape[:2]
    results = model(img, imgsz=imgsz, conf=conf, verbose=False)
    dets = []
    for r in results:
        for box in r.boxes:
            cls_id = int(box.cls[0])
            label = r.names.get(cls_id, f"class_{cls_id}")
            confidence = float(box.conf[0])
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            dets.append({
                "model": model_name, "label": label, "confidence": confidence,
                "x": round((x1/w)*100, 1), "y": round((y1/h)*100, 1),
                "width": round(((x2-x1)/w)*100, 1), "height": round(((y2-y1)/h)*100, 1),
            })
    return dets

def roboflow_detect(image_bytes, model_id, model_name, conf=0.25):
    """Call Roboflow HTTP API (lightweight, no RAM)."""
    if not ROBOFLOW_API_KEY:
        return []
    try:
        import requests
        url = f"https://serverless.roboflow.com/{model_id}?api_key={ROBOFLOW_API_KEY}"
        resp = requests.post(url, data=image_bytes, headers={"Content-Type": "image/jpeg"}, timeout=30)
        if resp.status_code != 200:
            print(f"[ML] {model_name} Roboflow HTTP {resp.status_code}")
            return []
        result = resp.json()
        dets = []
        for pred in result.get("predictions", []):
            if pred.get("confidence", 0) >= conf:
                dets.append({
                    "model": model_name,
                    "label": pred.get("class", model_name.lower()),
                    "confidence": pred.get("confidence", 0),
                    "x": pred.get("x", 0), "y": pred.get("y", 0),
                    "width": pred.get("width", 0), "height": pred.get("height", 0),
                })
        return dets
    except Exception as e:
        print(f"[ML] {model_name} Roboflow error: {e}")
        return []

@app.get("/health")
async def health():
    crack_exists = Path(CRACK_MODEL_PATH).exists() or Path(Path(__file__).parent / CRACK_MODEL_PATH).exists()
    road_exists = Path(ROAD_MODEL_PATH).exists() or Path(Path(__file__).parent / ROAD_MODEL_PATH).exists()
    return {
        "status": "healthy",
        "mode": "hitakshi-yolo-only",
        "crack_model": crack_exists,
        "road_model": road_exists,
        "roboflow": "configured" if ROBOFLOW_API_KEY else "missing",
    }

@app.post("/detect-base64")
async def detect_base64(body: dict):
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

    all_detections = []
    models_used = []
    total_time = 0

    # === 1. CRACK YOLO — load, run, UNLOAD to free RAM ===
    try:
        t0 = time.time()
        model = load_yolo(CRACK_MODEL_PATH)
        dets = run_yolo(model, image_bytes, "CRACK", confidence, imgsz)
        elapsed = time.time() - t0
        total_time += elapsed
        if dets:
            all_detections.extend(dets)
            models_used.append("CRACK")
        print(f"[ML] CRACK: {len(dets)} detections in {elapsed:.1f}s")
        del model
        gc.collect()
    except Exception as e:
        print(f"[ML] CRACK failed: {e}")

    # === 2. ROAD YOLO — load, run, UNLOAD to free RAM ===
    try:
        t0 = time.time()
        model = load_yolo(ROAD_MODEL_PATH)
        dets = run_yolo(model, image_bytes, "ROAD", confidence, imgsz)
        elapsed = time.time() - t0
        total_time += elapsed
        if dets:
            all_detections.extend(dets)
            models_used.append("ROAD")
        print(f"[ML] ROAD: {len(dets)} detections in {elapsed:.1f}s")
        del model
        gc.collect()
    except Exception as e:
        print(f"[ML] ROAD failed: {e}")

    # === 3. RAILWAY Roboflow ===
    try:
        t0 = time.time()
        dets = roboflow_detect(image_bytes, "railway-track-fault-detection-hrem8/3", "RAILWAY", confidence)
        elapsed = time.time() - t0
        total_time += elapsed
        if dets:
            all_detections.extend(dets)
            models_used.append("RAILWAY")
        print(f"[ML] RAILWAY: {len(dets)} detections in {elapsed:.1f}s")
    except Exception as e:
        print(f"[ML] RAILWAY failed: {e}")

    # === 4. RUST Roboflow ===
    try:
        t0 = time.time()
        dets = roboflow_detect(image_bytes, "corrosion-yolov8/4", "RUST", confidence)
        elapsed = time.time() - t0
        total_time += elapsed
        if dets:
            all_detections.extend(dets)
            models_used.append("RUST")
        print(f"[ML] RUST: {len(dets)} detections in {elapsed:.1f}s")
    except Exception as e:
        print(f"[ML] RUST failed: {e}")

    # Map to DRIFT format
    mapped = []
    for d in all_detections:
        ml = map_label(d["label"])
        mapped.append({
            "model": d["model"],
            "label": ml,
            "confidence": round(d["confidence"], 4),
            "boundingBox": {
                "x": round(max(0, min(100, d["x"])), 1),
                "y": round(max(0, min(100, d["y"])), 1),
                "width": round(max(1, min(100, d["width"])), 1),
                "height": round(max(1, min(100, d["height"])), 1),
            },
            "severity": estimate_severity(d["confidence"], ml),
        })

    print(f"[ML] TOTAL: {len(mapped)} detections from {models_used} in {total_time:.1f}s")
    return {
        "success": True,
        "model": "+".join(models_used) if models_used else "none",
        "detections": mapped,
        "count": len(mapped),
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ML_PORT", 8000))
    print(f"[DRIFT ML] Hitakshi YOLO models only — Port: {port}")
    print(f"[DRIFT ML] CRACK: {CRACK_MODEL_PATH} | ROAD: {ROAD_MODEL_PATH}")
    print(f"[DRIFT ML] Roboflow: {'configured' if ROBOFLOW_API_KEY else 'MISSING'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
