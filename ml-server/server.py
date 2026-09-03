"""
DRIFT ML Server v12 — Hitakshi's REAL YOLO Models
- Uses ONNX Runtime for crack + road detection (no PyTorch needed)
- Roboflow for railway + rust detection
- Never returns 500
"""
import os, json, base64, time, traceback
import numpy as np
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="DRIFT ML", version="12.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")
BASE_DIR = Path(__file__).parent
CRACK_ONNX = str(BASE_DIR / "cracks" / "main_crack.onnx")
ROAD_ONNX = str(BASE_DIR / "road-ml" / "main_road.onnx")

_sessions = {}


def load_onnx(name, path):
    if name in _sessions:
        return _sessions[name]
    if not os.path.exists(path):
        print(f"[ML] ONNX not found: {path}")
        return None
    try:
        import onnxruntime as ort
        print(f"[ML] Loading {name} ONNX...")
        t0 = time.time()
        sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        print(f"[ML] {name} loaded in {time.time()-t0:.1f}s")
        _sessions[name] = sess
        return sess
    except Exception as e:
        print(f"[ML] Load {name} FAILED: {e}")
        traceback.print_exc()
        return None


def preprocess(image_bytes, size=640):
    try:
        from PIL import Image as PILImage
        import io
        pil = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = pil.size
        pil = pil.resize((size, size), PILImage.LANCZOS)
        arr = np.array(pil, dtype=np.float32) / 255.0
        return arr.transpose(2, 0, 1)[np.newaxis], w, h
    except Exception as e:
        print(f"[ML] preprocess error: {e}")
        return None, 0, 0


def yolo_detect(image_bytes, model_name, onnx_path, class_names, conf_thresh=0.25):
    sess = load_onnx(model_name, onnx_path)
    if sess is None:
        return []
    try:
        tensor, orig_w, orig_h = preprocess(image_bytes)
        if tensor is None:
            return []
        out = sess.run(None, {sess.get_inputs()[0].name: tensor})[0]
        raw = out[0]
        nf = raw.shape[0]
        nd = raw.shape[1]
        nc = len(class_names)
        boxes = raw[:4, :]
        if nf <= 6:
            scores = raw[4:4+nc, :]
        else:
            scores = raw[nf-1:nf, :]
        if scores.min() < -0.1:
            scores = 1.0 / (1.0 + np.exp(-scores))
        class_ids = np.argmax(scores, axis=0)
        confidences = np.max(scores, axis=0)
        sx, sy = orig_w / 640, orig_h / 640
        thresh = max(conf_thresh, 0.5) if nf > 10 else conf_thresh
        dets = []
        for i in range(nd):
            if confidences[i] < thresh:
                continue
            xc, yc, bw, bh = boxes[:, i]
            x1 = max(0, (xc - bw/2) * sx)
            y1 = max(0, (yc - bh/2) * sy)
            x2 = min(orig_w, (xc + bw/2) * sx)
            y2 = min(orig_h, (yc + bh/2) * sy)
            if x2 <= x1 or y2 <= y1:
                continue
            label = class_names.get(int(class_ids[i]), f"class_{class_ids[i]}")
            dets.append({
                "model": model_name, "label": label,
                "confidence": float(confidences[i]),
                "x": round((x1 / orig_w) * 100, 1),
                "y": round((y1 / orig_h) * 100, 1),
                "width": round(((x2 - x1) / orig_w) * 100, 1),
                "height": round(((y2 - y1) / orig_h) * 100, 1),
            })
        dets.sort(key=lambda d: -d["confidence"])
        dets = dets[:10]
        print(f"[ML] {model_name}: {len(dets)} detections")
        return dets
    except Exception as e:
        print(f"[ML] {model_name} error: {e}")
        traceback.print_exc()
        return []


def roboflow_detect(image_bytes, model_id, model_name, conf=0.25):
    if not ROBOFLOW_API_KEY:
        return []
    try:
        import requests
        url = f"https://serverless.roboflow.com/{model_id}?api_key={ROBOFLOW_API_KEY}"
        resp = requests.post(url, data=image_bytes, headers={"Content-Type": "image/jpeg"}, timeout=30)
        if resp.status_code != 200:
            print(f"[ML] {model_name}: HTTP {resp.status_code}")
            return []
        result = resp.json()
        dets = []
        for pred in result.get("predictions", []):
            if pred.get("confidence", 0) >= conf:
                dets.append({
                    "model": model_name, "label": pred.get("class", model_name.lower()),
                    "confidence": pred.get("confidence", 0),
                    "x": pred.get("x", 0), "y": pred.get("y", 0),
                    "width": pred.get("width", 0), "height": pred.get("height", 0),
                })
        print(f"[ML] {model_name}: {len(dets)} detections")
        return dets
    except Exception as e:
        print(f"[ML] {model_name} error: {e}")
        return []


LABEL_MAP = {
    "crack": "crack", "cracks": "crack",
    "Longitudinal Crack": "crack", "Transverse Crack": "crack",
    "Alligator Crack": "crack", "surface_crack": "crack",
    "pothole": "pothole", "potholes": "pothole",
    "Damage": "pothole", "damage": "pothole",
    "corrosion": "corrosion", "rust": "corrosion",
    "spalling": "spalling", "settlement": "settlement",
    "Defective": "rail_alignment", "defective": "rail_alignment",
    "defect": "crack", "obstruction": "obstruction",
}

def map_label(raw):
    if not raw: return "crack"
    return LABEL_MAP.get(raw.strip(), LABEL_MAP.get(raw.strip().lower(), raw.strip().lower()))

def estimate_severity(conf, label):
    critical = {"structural", "exposed_rebar", "settlement", "rail_alignment"}
    high = {"corrosion", "spalling", "pothole"}
    if label in critical: return "critical" if conf >= 0.85 else "high" if conf >= 0.60 else "medium"
    if label in high: return "high" if conf >= 0.90 else "medium" if conf >= 0.70 else "low"
    return "high" if conf >= 0.85 else "medium" if conf >= 0.60 else "low"


@app.get("/health")
async def health():
    return {
        "status": "healthy", "mode": "hitakshi-v12", "version": "12.0.0",
        "onnx": {"available": bool(_sessions), "models": list(_sessions.keys()),
                 "crack_exists": os.path.exists(CRACK_ONNX), "road_exists": os.path.exists(ROAD_ONNX)},
        "roboflow": "configured" if ROBOFLOW_API_KEY else "missing",
    }


@app.post("/detect-base64")
async def detect_base64(request_body: dict):
    t0 = time.time()
    all_detections = []
    models_used = []
    errors = []

    try:
        image_b64 = request_body.get("imageBase64", "")
        confidence = request_body.get("confidence", 0.25)
        if not image_b64:
            return {"success": True, "model": "none", "detections": [], "count": 0, "errors": ["no image"]}
        if "," in image_b64 and image_b64.startswith("data:"):
            image_b64 = image_b64.split(",", 1)[1]
        image_bytes = base64.b64decode(image_b64)
        if len(image_bytes) > 20 * 1024 * 1024:
            return {"success": True, "model": "none", "detections": [], "count": 0, "errors": ["too large"]}
    except Exception as e:
        return {"success": True, "model": "none", "detections": [], "count": 0, "errors": [f"bad request: {e}"]}

    # CRACK YOLO
    try:
        dets = yolo_detect(image_bytes, "CRACK", CRACK_ONNX, {0: "crack"}, confidence)
        all_detections.extend(dets)
        if dets: models_used.append("CRACK-YOLO")
    except Exception as e:
        errors.append(f"crack: {e}")

    # ROAD YOLO
    try:
        dets = yolo_detect(image_bytes, "ROAD", ROAD_ONNX, {0: "Longitudinal Crack", 1: "Transverse Crack", 2: "Alligator Crack", 3: "Potholes"}, confidence)
        all_detections.extend(dets)
        if dets: models_used.append("ROAD-YOLO")
    except Exception as e:
        errors.append(f"road: {e}")

    # RAILWAY Roboflow
    try:
        dets = roboflow_detect(image_bytes, "railway-track-fault-detection-hrem8/3", "RAILWAY", confidence)
        all_detections.extend(dets)
        if dets: models_used.append("RAILWAY")
    except Exception as e:
        errors.append(f"railway: {e}")

    # RUST Roboflow
    try:
        dets = roboflow_detect(image_bytes, "corrosion-yolov8/4", "RUST", confidence)
        all_detections.extend(dets)
        if dets: models_used.append("RUST")
    except Exception as e:
        errors.append(f"rust: {e}")

    best = {}
    for d in all_detections:
        ml = map_label(d["label"])
        if ml not in best or d["confidence"] > best[ml]["confidence"]:
            best[ml] = {
                "model": d["model"], "label": ml,
                "confidence": round(d["confidence"], 4),
                "boundingBox": {
                    "x": round(max(0, min(100, d["x"])), 1),
                    "y": round(max(0, min(100, d["y"])), 1),
                    "width": round(max(1, min(100, d["width"])), 1),
                    "height": round(max(1, min(100, d["height"])), 1),
                },
                "severity": estimate_severity(d["confidence"], ml),
            }

    mapped = list(best.values())
    elapsed = time.time() - t0
    print(f"[ML] TOTAL: {len(mapped)} detections from {models_used} in {elapsed:.1f}s")
    return {
        "success": True,
        "model": "+".join(models_used) if models_used else "none",
        "detections": mapped, "count": len(mapped),
        "errors": errors if errors else None,
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ML_PORT", 8000))
    print(f"[DRIFT ML v12] Port: {port}")
    # Load ONNX models at startup
    for name, path in [("CRACK", CRACK_ONNX), ("ROAD", ROAD_ONNX)]:
        load_onnx(name, path)
    print(f"[DRIFT ML v12] Roboflow: {'OK' if ROBOFLOW_API_KEY else 'NO KEY'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
