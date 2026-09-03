"""
DRIFT ML Server v9 — Hitakshi's REAL YOLO Models (ONNX runtime)
Fits Render $7 plan (512MB RAM) by using ONNX instead of PyTorch.

- CRACK: local ONNX (main_crack.onnx) — crack detection
- ROAD: local ONNX (main_road.onnx) — road damage, potholes
- RAILWAY: Roboflow API — track fault detection (Hitakshi's trained model)
- RUST: Roboflow API — corrosion detection (Hitakshi's trained model)
"""
import os, json, base64, time, tempfile, traceback
import numpy as np
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="DRIFT ML", version="9.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")

# Model paths
BASE_DIR = Path(__file__).parent
CRACK_ONNX = str(BASE_DIR / "cracks" / "main_crack.onnx")
ROAD_ONNX = str(BASE_DIR / "road-ml" / "main_road.onnx")
CRACK_PT = str(BASE_DIR / "cracks" / "main_crack.pt")
ROAD_PT = str(BASE_DIR / "road-ml" / "main_road.pt")

# ONNX sessions (loaded lazily)
_sessions = {"crack": None, "road": None}


def load_onnx(name, path):
    """Load ONNX model session."""
    if _sessions[name] is not None:
        return _sessions[name]
    if not os.path.exists(path):
        print(f"[ML] ONNX model not found: {path}")
        return None
    try:
        import onnxruntime as ort
        print(f"[ML] Loading {name} ONNX from {path}...")
        t0 = time.time()
        sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        print(f"[ML] {name} loaded in {time.time()-t0:.1f}s")
        _sessions[name] = sess
        return sess
    except Exception as e:
        print(f"[ML] Failed to load {name} ONNX: {e}")
        traceback.print_exc()
        return None


def preprocess_image(image_bytes, target_size=640):
    """Preprocess image bytes for YOLO ONNX inference."""
    import cv2
    # Decode image
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None, 0, 0
    orig_h, orig_w = img.shape[:2]
    # Resize to model input size
    img_resized = cv2.resize(img, (target_size, target_size))
    # Convert BGR to RGB, normalize to [0,1], transpose to CHW
    img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB)
    img_float = img_rgb.astype(np.float32) / 255.0
    img_float = img_float.transpose(2, 0, 1)  # HWC -> CHW
    img_float = np.expand_dims(img_float, 0)  # Add batch dim
    return img_float, orig_w, orig_h


def postprocess_output(output, orig_w, orig_h, conf_threshold=0.25, input_size=640):
    """Parse YOLO ONNX output into detections.
    YOLOv8 ONNX shape: [1, 4+num_classes, num_detections] (features-first)
    """
    preds = output[0]  # Remove batch dim
    if preds.ndim == 3:
        preds = preds[0]  # [4+num_classes, num_detections]

    # YOLOv8 format: [4+num_classes, num_detections]
    # First 4 rows = box coords, rest = class scores
    if preds.shape[0] < preds.shape[1]:
        # Shape is [features, detections] — transpose to [detections, features]
        preds = preds.T
    
    num_features = preds.shape[1]
    num_classes = num_features - 4
    
    boxes = preds[:, :4]      # [N, 4]: x_center, y_center, w, h
    scores = preds[:, 4:]     # [N, num_classes]: class scores
    
    class_ids = np.argmax(scores, axis=1)
    confidences = np.max(scores, axis=1)
    
    mask = confidences >= conf_threshold
    boxes = boxes[mask]
    class_ids = class_ids[mask]
    confidences = confidences[mask]
    
    scale_x = orig_w / input_size
    scale_y = orig_h / input_size
    
    detections = []
    for i in range(len(boxes)):
        x_center, y_center, w, h = boxes[i]
        x1 = (x_center - w / 2) * scale_x
        y1 = (y_center - h / 2) * scale_y
        x2 = (x_center + w / 2) * scale_x
        y2 = (y_center + h / 2) * scale_y
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(orig_w, x2), min(orig_h, y2)
        detections.append({
            "class_id": int(class_ids[i]),
            "confidence": float(confidences[i]),
            "x": float(x1),
            "y": float(y1),
            "width": float(x2 - x1),
            "height": float(y2 - y1),
        })
    
    return detections


def yolo_onnx_detect(image_bytes, model_name, onnx_path, class_names, conf=0.25):
    """Run ONNX YOLO detection."""
    sess = load_onnx(model_name, onnx_path)
    if sess is None:
        return []

    try:
        img_float, orig_w, orig_h = preprocess_image(image_bytes)
        if img_float is None:
            return []

        # Run inference
        input_name = sess.get_inputs()[0].name
        output = sess.run(None, {input_name: img_float})[0]

        # Parse detections
        raw_dets = postprocess_output(output, orig_w, orig_h, conf)

        # Convert pixel coords to percentage (0-100)
        dets = []
        for d in raw_dets:
            label = class_names.get(d["class_id"], f"class_{d['class_id']}")
            dets.append({
                "model": model_name,
                "label": label,
                "confidence": d["confidence"],
                "x": round((d["x"] / orig_w) * 100, 1),
                "y": round((d["y"] / orig_h) * 100, 1),
                "width": round((d["width"] / orig_w) * 100, 1),
                "height": round((d["height"] / orig_h) * 100, 1),
            })
        print(f"[ML] {model_name}: {len(dets)} detections")
        return dets
    except Exception as e:
        print(f"[ML] {model_name} ONNX error: {e}")
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


LABEL_MAP = {
    "crack": "crack", "cracks": "crack", "Crack": "crack",
    "Longitudinal Crack": "crack", "Transverse Crack": "crack",
    "Alligator Crack": "crack", "surface_crack": "crack",
    "pothole": "pothole", "potholes": "pothole", "Pothole": "pothole",
    "road-damage": "pothole", "road_damage": "pothole",
    "Damage": "pothole", "damage": "pothole",
    "corrosion": "corrosion", "Corrosion": "corrosion", "rust": "corrosion",
    "spalling": "spalling", "patching": "spalling",
    "settlement": "settlement", "rutting": "settlement",
    "obstruction": "obstruction", "manhole": "obstruction",
    "Defective": "rail_alignment", "defective": "rail_alignment",
    "defect": "crack",
}


def map_label(raw):
    if not raw:
        return "crack"
    return LABEL_MAP.get(raw.strip(), LABEL_MAP.get(raw.strip().lower(), raw.strip().lower()))


def estimate_severity(conf, label):
    critical = {"structural", "exposed_rebar", "settlement", "rail_alignment"}
    high = {"corrosion", "spalling", "pothole"}
    if label in critical:
        return "critical" if conf >= 0.85 else "high" if conf >= 0.60 else "medium"
    if label in high:
        return "high" if conf >= 0.90 else "medium" if conf >= 0.70 else "low"
    return "high" if conf >= 0.85 else "medium" if conf >= 0.60 else "low"


@app.get("/debug")
async def debug():
    """Debug endpoint to test ONNX model loading."""
    import traceback as tb
    results = {}
    for name, path in [("CRACK", CRACK_ONNX), ("ROAD", ROAD_ONNX)]:
        try:
            if os.path.exists(path):
                import onnxruntime as ort
                sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
                inp = sess.get_inputs()[0]
                out = sess.get_outputs()[0]
                results[name] = {"status": "loaded", "input": inp.shape, "output": out.shape, "input_name": inp.name}
            else:
                results[name] = {"status": "file_missing", "path": path}
        except Exception as e:
            results[name] = {"status": "error", "error": str(e), "traceback": tb.format_exc()[:500]}
    return results


@app.get("/health")
async def health():
    crack_onnx = os.path.exists(CRACK_ONNX)
    road_onnx = os.path.exists(ROAD_ONNX)
    crack_pt = os.path.exists(CRACK_PT)
    road_pt = os.path.exists(ROAD_PT)
    return {
        "status": "healthy",
        "mode": "hitakshi-real-yolo",
        "version": "9.0.0",
        "models": {
            "crack": {"onnx": crack_onnx, "pt": crack_pt},
            "road": {"onnx": road_onnx, "pt": road_pt},
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

    all_detections = []
    models_used = []
    t0 = time.time()

    try:
        # 1. CRACK detection — Hitakshi's YOLO ONNX model
        dets = yolo_onnx_detect(
            image_bytes, "CRACK", CRACK_ONNX,
            {0: "crack", 1: "defect"}, confidence
        )
        all_detections.extend(dets)
        if dets:
            models_used.append("CRACK-YOLO")
    except Exception as e:
        print(f"[ML] CRACK detection error: {e}")
        traceback.print_exc()

    try:
        # 2. ROAD detection — Hitakshi's YOLO ONNX model
        dets = yolo_onnx_detect(
            image_bytes, "ROAD", ROAD_ONNX,
            {0: "pothole", 1: "road-damage", 2: "crack"}, confidence
        )
        all_detections.extend(dets)
        if dets:
            models_used.append("ROAD-YOLO")
    except Exception as e:
        print(f"[ML] ROAD detection error: {e}")
        traceback.print_exc()

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

    # Map to DRIFT format (deduplicate, keep best per label)
    best_by_label = {}
    for d in all_detections:
        ml = map_label(d["label"])
        if ml not in best_by_label or d["confidence"] > best_by_label[ml]["confidence"]:
            best_by_label[ml] = {
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
            }

    mapped = list(best_by_label.values())
    elapsed = time.time() - t0
    print(f"[ML] TOTAL: {len(mapped)} detections from {models_used} in {elapsed:.1f}s")
    return {
        "success": True,
        "model": "+".join(models_used) if models_used else "none",
        "detections": mapped,
        "count": len(mapped),
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ML_PORT", 8000))
    print(f"[DRIFT ML v9] Hitakshi YOLO ONNX + Roboflow — Port: {port}")
    print(f"[DRIFT ML v9] CRACK ONNX: {'OK' if os.path.exists(CRACK_ONNX) else 'MISSING'}")
    print(f"[DRIFT ML v9] ROAD ONNX: {'OK' if os.path.exists(ROAD_ONNX) else 'MISSING'}")
    print(f"[DRIFT ML v9] Roboflow: {'OK' if ROBOFLOW_API_KEY else 'NO KEY'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
