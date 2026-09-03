"""
DRIFT ML Server v8 — Hitakshi's REAL YOLO Models
Uses actual trained models, NOT Gemini fallback:
- CRACK: local YOLO (main_crack.pt) — crack detection
- ROAD: local YOLO (main_road.pt) — road damage, potholes
- RAILWAY: Roboflow API — track fault detection (Hitakshi's trained model)
- RUST: Roboflow API — corrosion detection (Hitakshi's trained model)

Lazy-loads one YOLO model at a time + garbage collects to fit Render $7 plan (2GB).
"""
import os, json, base64, time, gc, tempfile, traceback
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="DRIFT ML", version="8.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")

# Model paths (relative to ml-server/)
CRACK_MODEL = os.environ.get("CRACK_MODEL_PATH", str(Path(__file__).parent / "cracks" / "main_crack.pt"))
ROAD_MODEL = os.environ.get("ROAD_MODEL_PATH", str(Path(__file__).parent / "road-ml" / "main_road.pt"))

# Lazy-loaded model cache (only one at a time)
_model_cache = {"name": None, "model": None}


def get_model(name, path):
    """Load YOLO model, unloading any previously loaded model first."""
    if _model_cache["name"] == name and _model_cache["model"] is not None:
        return _model_cache["model"]

    # Free previous model
    if _model_cache["model"] is not None:
        _model_cache["model"] = None
        gc.collect()

    if not os.path.exists(path):
        print(f"[ML] Model file not found: {path}")
        return None

    try:
        from ultralytics import YOLO
        print(f"[ML] Loading {name} model from {path}...")
        t0 = time.time()
        model = YOLO(path)
        print(f"[ML] {name} loaded in {time.time()-t0:.1f}s")
        _model_cache["name"] = name
        _model_cache["model"] = model
        return model
    except Exception as e:
        print(f"[ML] Failed to load {name}: {e}")
        traceback.print_exc()
        return None


LABEL_MAP = {
    "crack": "crack", "cracks": "crack", "Crack": "crack",
    "Longitudinal Crack": "crack", "Transverse Crack": "crack",
    "Alligator Crack": "crack", "surface_crack": "crack",
    "pothole": "pothole", "potholes": "pothole", "Pothole": "pothole",
    "corrosion": "corrosion", "Corrosion": "corrosion", "rust": "corrosion",
    "spalling": "spalling", "patching": "spalling",
    "settlement": "settlement", "rutting": "settlement", "bumps": "settlement",
    "obstruction": "obstruction", "manhole": "obstruction",
    "Defective": "rail_alignment", "defective": "rail_alignment",
    "road-damage": "pothole", "road_damage": "pothole",
    "defect": "crack", "Damage": "pothole", "damage": "pothole",
}


def map_label(raw):
    if not raw:
        return "crack"
    r = raw.strip()
    return LABEL_MAP.get(r, LABEL_MAP.get(r.lower(), r.lower()))


def estimate_severity(conf, label):
    critical = {"structural", "exposed_rebar", "settlement", "rail_alignment"}
    high = {"corrosion", "spalling", "pothole"}
    if label in critical:
        return "critical" if conf >= 0.85 else "high" if conf >= 0.60 else "medium"
    if label in high:
        return "high" if conf >= 0.90 else "medium" if conf >= 0.70 else "low"
    return "high" if conf >= 0.85 else "medium" if conf >= 0.60 else "low"


def yolo_detect(image_path, model_name, model_path, conf=0.25):
    """Run Hitakshi's local YOLO model on an image."""
    model = get_model(model_name, model_path)
    if model is None:
        return []
    try:
        results = model(image_path, conf=conf, imgsz=640, verbose=False)
        dets = []
        for r in results:
            if r.boxes is None:
                continue
            for box in r.boxes:
                cls_id = int(box.cls[0])
                cls_name = r.names.get(cls_id, str(cls_id))
                det_conf = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                # Get image dimensions for normalization
                img_w = r.orig_shape[1]
                img_h = r.orig_shape[0]
                dets.append({
                    "model": model_name,
                    "label": cls_name,
                    "confidence": det_conf,
                    "x": round((x1 / img_w) * 100, 1),
                    "y": round((y1 / img_h) * 100, 1),
                    "width": round(((x2 - x1) / img_w) * 100, 1),
                    "height": round(((y2 - y1) / img_h) * 100, 1),
                })
        print(f"[ML] {model_name}: {len(dets)} detections")
        return dets
    except Exception as e:
        print(f"[ML] {model_name} YOLO error: {e}")
        traceback.print_exc()
        return []


def roboflow_detect(image_bytes, model_id, model_name, conf=0.25):
    """Hitakshi's Roboflow models — railway fault + corrosion detection."""
    if not ROBOFLOW_API_KEY:
        print(f"[ML] {model_name}: no ROBOFLOW_API_KEY")
        return []
    try:
        import requests
        url = f"https://serverless.roboflow.com/{model_id}?api_key={ROBOFLOW_API_KEY}"
        resp = requests.post(url, data=image_bytes, headers={"Content-Type": "image/jpeg"}, timeout=30)
        if resp.status_code != 200:
            print(f"[ML] {model_name}: Roboflow HTTP {resp.status_code}")
            return []
        result = resp.json()
        dets = []
        for pred in result.get("predictions", []):
            if pred.get("confidence", 0) >= conf:
                dets.append({
                    "model": model_name,
                    "label": pred.get("class", model_name.lower()),
                    "confidence": pred.get("confidence", 0),
                    "x": pred.get("x", 0),
                    "y": pred.get("y", 0),
                    "width": pred.get("width", 0),
                    "height": pred.get("height", 0),
                })
        print(f"[ML] {model_name}: {len(dets)} detections")
        return dets
    except Exception as e:
        print(f"[ML] {model_name} Roboflow error: {e}")
        return []


@app.get("/health")
async def health():
    crack_exists = os.path.exists(CRACK_MODEL)
    road_exists = os.path.exists(ROAD_MODEL)
    return {
        "status": "healthy",
        "mode": "hitakshi-real-yolo",
        "version": "8.0.0",
        "models": {
            "crack": {"local": True, "file": crack_exists, "path": CRACK_MODEL},
            "road": {"local": True, "file": road_exists, "path": ROAD_MODEL},
            "railway": {"roboflow": bool(ROBOFLOW_API_KEY)},
            "rust": {"roboflow": bool(ROBOFLOW_API_KEY)},
        },
        "roboflow": "configured" if ROBOFLOW_API_KEY else "missing",
    }


@app.post("/detect-base64")
async def detect_base64(body: dict):
    image_b64 = body.get("imageBase64", "")
    confidence = body.get("confidence", 0.25)
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

    # Write image to temp file for YOLO
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            f.write(image_bytes)
            tmp_path = f.name

        all_detections = []
        models_used = []
        t0 = time.time()

        # 1. CRACK detection — Hitakshi's YOLO model
        dets = yolo_detect(tmp_path, "CRACK", CRACK_MODEL, confidence)
        all_detections.extend(dets)
        if dets:
            models_used.append("CRACK-YOLO")

        # Free memory before next model
        _model_cache["model"] = None
        gc.collect()

        # 2. ROAD detection — Hitakshi's YOLO model
        dets = yolo_detect(tmp_path, "ROAD", ROAD_MODEL, confidence)
        all_detections.extend(dets)
        if dets:
            models_used.append("ROAD-YOLO")

        # Free memory
        _model_cache["model"] = None
        gc.collect()

        # 3. RAILWAY detection — Hitakshi's Roboflow model
        dets = roboflow_detect(image_bytes, "railway-track-fault-detection-hrem8/3", "RAILWAY", confidence)
        all_detections.extend(dets)
        if dets:
            models_used.append("RAILWAY")

        # 4. RUST detection — Hitakshi's Roboflow model
        dets = roboflow_detect(image_bytes, "corrosion-yolov8/4", "RUST", confidence)
        all_detections.extend(dets)
        if dets:
            models_used.append("RUST")

        # Map to DRIFT format
        mapped = []
        seen_labels = set()
        for d in all_detections:
            ml = map_label(d["label"])
            # Deduplicate: keep highest confidence per label
            if ml in seen_labels:
                continue
            seen_labels.add(ml)
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

        elapsed = time.time() - t0
        print(f"[ML] TOTAL: {len(mapped)} detections from {models_used} in {elapsed:.1f}s")
        return {
            "success": True,
            "model": "+".join(models_used) if models_used else "none",
            "detections": mapped,
            "count": len(mapped),
        }

    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except:
                pass


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ML_PORT", 8000))
    print(f"[DRIFT ML v8] Hitakshi YOLO + Roboflow — Port: {port}")
    print(f"[DRIFT ML v8] CRACK: {CRACK_MODEL} ({'exists' if os.path.exists(CRACK_MODEL) else 'MISSING'})")
    print(f"[DRIFT ML v8] ROAD: {ROAD_MODEL} ({'exists' if os.path.exists(ROAD_MODEL) else 'MISSING'})")
    print(f"[DRIFT ML v8] Roboflow: {'OK' if ROBOFLOW_API_KEY else 'NO KEY'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
