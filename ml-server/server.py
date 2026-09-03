"""
DRIFT ML Server v10 — Hitakshi's REAL YOLO Models (ONNX runtime)
Fits Render $7 plan (512MB RAM) using ONNX inference.

Verified output shapes:
- CRACK (seg): [1, 37, 8400] → 4 box + 32 mask_coeffs + 1 class
- ROAD (detect): [1, 8, 8400] → 4 box + 4 class_scores
- RAILWAY: Roboflow API
- RUST: Roboflow API
"""
import os, json, base64, time, tempfile, traceback
import numpy as np
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="DRIFT ML", version="10.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")
BASE_DIR = Path(__file__).parent

CRACK_ONNX = str(BASE_DIR / "cracks" / "main_crack.onnx")
ROAD_ONNX = str(BASE_DIR / "road-ml" / "main_road.onnx")

_sessions = {"crack": None, "road": None}


def load_onnx(name, path):
    if _sessions[name] is not None:
        return _sessions[name]
    if not os.path.exists(path):
        print(f"[ML] ONNX not found: {path}")
        return None
    try:
        import onnxruntime as ort
        print(f"[ML] Loading {name} ONNX...")
        t0 = time.time()
        sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        print(f"[ML] {name} loaded in {time.time()-t0:.1f}s — input={sess.get_inputs()[0].shape} output={sess.get_outputs()[0].shape}")
        _sessions[name] = sess
        return sess
    except Exception as e:
        print(f"[ML] Load {name} FAILED: {e}")
        traceback.print_exc()
        return None


def preprocess(image_bytes, size=640):
    """Decode image, resize, normalize to [0,1] CHW float32."""
    import cv2
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None, 0, 0
    h, w = img.shape[:2]
    resized = cv2.resize(img, (size, size))
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    tensor = rgb.astype(np.float32) / 255.0
    tensor = tensor.transpose(2, 0, 1)[np.newaxis]  # HWC→NCHW
    return tensor, w, h


def yolo_detect(image_bytes, model_name, onnx_path, class_names, conf_thresh=0.25):
    """Run YOLO ONNX detection with correct output parsing.
    
    Output shape convention: [1, features, num_detections]
    - CRACK (seg): [1, 37, 8400] → 4 box + 32 mask + 1 class_score (idx 36)
    - ROAD (detect): [1, 8, 8400] → 4 box + 4 class_scores (idx 4-7)
    """
    sess = load_onnx(model_name, onnx_path)
    if sess is None:
        return []

    try:
        tensor, orig_w, orig_h = preprocess(image_bytes)
        if tensor is None:
            return []

        out = sess.run(None, {sess.get_inputs()[0].name: tensor})[0]  # [1, features, N]
        preds = out[0]  # [features, N]

        num_features = preds.shape[0]
        num_dets = preds.shape[1]
        num_classes = len(class_names)

        # Box coords: first 4 rows
        boxes = preds[:4, :]  # [4, N] — xc, yc, w, h

        # Class scores: depends on model type
        # CRACK (seg): 4 box + 32 mask_coeffs + 1 class = 37 features → class at index 36
        # ROAD (detect): 4 box + 4 classes = 8 features → classes at indices 4-7
        if num_classes == 1:
            # Segmentation model — class score is last row
            scores = preds[36:37, :]  # [1, N]
        else:
            # Detection model — class scores are rows 4 to 4+num_classes
            scores = preds[4:4+num_classes, :]  # [num_classes, N]

        class_ids = np.argmax(scores, axis=0)  # [N]
        confidences = np.max(scores, axis=0)  # [N]

        # Scale from 640→original
        sx, sy = orig_w / 640, orig_h / 640

        dets = []
        for i in range(num_dets):
            if confidences[i] < conf_thresh:
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
                "model": model_name,
                "label": label,
                "confidence": float(confidences[i]),
                "x": round((x1 / orig_w) * 100, 1),
                "y": round((y1 / orig_h) * 100, 1),
                "width": round(((x2 - x1) / orig_w) * 100, 1),
                "height": round(((y2 - y1) / orig_h) * 100, 1),
            })

        print(f"[ML] {model_name}: {len(dets)} detections (features={num_features}, dets={num_dets}, classes={num_classes})")
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
        print(f"[ML] {model_name} error: {e}")
        return []


LABEL_MAP = {
    "crack": "crack", "cracks": "crack",
    "Longitudinal Crack": "crack", "Transverse Crack": "crack",
    "Alligator Crack": "crack", "surface_crack": "crack",
    "pothole": "pothole", "potholes": "pothole", "Potholes": "pothole",
    "road-damage": "pothole", "road_damage": "pothole",
    "Damage": "pothole", "damage": "pothole",
    "corrosion": "corrosion", "rust": "corrosion",
    "spalling": "spalling", "settlement": "settlement",
    "Defective": "rail_alignment", "defective": "rail_alignment",
    "defect": "crack", "obstruction": "obstruction",
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


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "mode": "hitakshi-real-yolo",
        "version": "10.0.0",
        "models": {
            "crack": {"onnx": os.path.exists(CRACK_ONNX), "pt": os.path.exists(str(BASE_DIR / "cracks" / "main_crack.pt"))},
            "road": {"onnx": os.path.exists(ROAD_ONNX), "pt": os.path.exists(str(BASE_DIR / "road-ml" / "main_road.pt"))},
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
        dets = yolo_detect(image_bytes, "CRACK", CRACK_ONNX, {0: "crack"}, confidence)
        all_detections.extend(dets)
        if dets:
            models_used.append("CRACK-YOLO")
    except Exception as e:
        print(f"[ML] CRACK error: {e}")

    try:
        dets = yolo_detect(image_bytes, "ROAD", ROAD_ONNX, {0: "Longitudinal Crack", 1: "Transverse Crack", 2: "Alligator Crack", 3: "Potholes"}, confidence)
        all_detections.extend(dets)
        if dets:
            models_used.append("ROAD-YOLO")
    except Exception as e:
        print(f"[ML] ROAD error: {e}")

    try:
        dets = roboflow_detect(image_bytes, "railway-track-fault-detection-hrem8/3", "RAILWAY", confidence)
        all_detections.extend(dets)
        if dets:
            models_used.append("RAILWAY")
    except Exception as e:
        print(f"[ML] RAILWAY error: {e}")

    try:
        dets = roboflow_detect(image_bytes, "corrosion-yolov8/4", "RUST", confidence)
        all_detections.extend(dets)
        if dets:
            models_used.append("RUST")
    except Exception as e:
        print(f"[ML] RUST error: {e}")

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
    print(f"[DRIFT ML v10] Hitakshi YOLO ONNX + Roboflow — Port: {port}")
    print(f"[DRIFT ML v10] CRACK ONNX: {'OK' if os.path.exists(CRACK_ONNX) else 'MISSING'}")
    print(f"[DRIFT ML v10] ROAD ONNX: {'OK' if os.path.exists(ROAD_ONNX) else 'MISSING'}")
    print(f"[DRIFT ML v10] Roboflow: {'OK' if ROBOFLOW_API_KEY else 'NO KEY'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
