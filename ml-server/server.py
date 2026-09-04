"""
DRIFT ML Server v13 — EXACT Hitakshi Code + FastAPI Wrapper
Uses her real main_app1.py logic: Ultralytics YOLO + Roboflow (via requests)
No ONNX conversion. No Gemini. No fakes. REAL ML.
"""
import os, io, json, base64, time, traceback
import cv2
import numpy as np
import requests as http_requests
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")

from ultralytics import YOLO

app = FastAPI(title="DRIFT ML", version="13.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")
ROBOFLOW_API_URL = "https://serverless.roboflow.com"
BASE_DIR = Path(__file__).parent
CRACK_MODEL_PATH = BASE_DIR / "cracks" / "main_crack.pt"
ROAD_MODEL_PATH = BASE_DIR / "road-ml" / "main_road.pt"

RAILWAY_MODEL_ID = "railway-track-fault-detection-hrem8/3"
RUST_MODEL_ID = "corrosion-yolov8/4"

# Load models at startup
crack_model = None
road_model = None

try:
    if CRACK_MODEL_PATH.exists():
        print(f"[LOAD] CRACK model: {CRACK_MODEL_PATH}")
        crack_model = YOLO(str(CRACK_MODEL_PATH))
        print(f"[OK] Crack loaded. Classes: {crack_model.names}")
    else:
        print(f"[WARN] CRACK model not found: {CRACK_MODEL_PATH}")
except Exception as e:
    print(f"[ERROR] CRACK load failed: {e}")

try:
    if ROAD_MODEL_PATH.exists():
        print(f"[LOAD] ROAD model: {ROAD_MODEL_PATH}")
        road_model = YOLO(str(ROAD_MODEL_PATH))
        print(f"[OK] Road loaded. Classes: {road_model.names}")
    else:
        print(f"[WARN] ROAD model not found: {ROAD_MODEL_PATH}")
except Exception as e:
    print(f"[ERROR] ROAD load failed: {e}")

print(f"[INFO] Roboflow: {'configured' if ROBOFLOW_API_KEY else 'missing'}")


def estimate_severity(conf, label):
    critical = {"structural", "exposed_rebar", "settlement", "rail_alignment"}
    high = {"corrosion", "spalling", "pothole"}
    if label in critical: return "critical" if conf >= 0.85 else "high" if conf >= 0.60 else "medium"
    if label in high: return "high" if conf >= 0.90 else "medium" if conf >= 0.70 else "low"
    return "high" if conf >= 0.85 else "medium" if conf >= 0.60 else "low"


def roboflow_infer(image_bytes, model_id, conf_thresh=0.25):
    """Hitakshi's Roboflow logic using requests directly."""
    if not ROBOFLOW_API_KEY:
        return []
    url = f"{ROBOFLOW_API_URL}/{model_id}?api_key={ROBOFLOW_API_KEY}"
    for attempt in range(3):
        try:
            resp = http_requests.post(url, data=image_bytes, headers={"Content-Type": "image/jpeg"}, timeout=30)
            if resp.status_code != 200:
                print(f"[ML] Roboflow {model_id}: HTTP {resp.status_code}")
                return []
            result = resp.json()
            preds = result.get("predictions", [])
            frame = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
            frame_h, frame_w = frame.shape[:2] if frame is not None else (1, 1)
            dets = []
            for p in preds:
                conf = float(p.get("confidence", 0))
                if conf < conf_thresh:
                    continue
                label = p.get("class", "unknown")
                x, y, box_w, box_h = float(p.get("x",0)), float(p.get("y",0)), float(p.get("width",0)), float(p.get("height",0))
                dets.append({
                    "model": model_id.split("/")[0].upper(), "label": label,
                    "confidence": round(conf, 4),
                    "x": round(max(0, min(100, ((x-box_w/2)/frame_w)*100)), 1),
                    "y": round(max(0, min(100, ((y-box_h/2)/frame_h)*100)), 1),
                    "width": round(max(1, min(100, (box_w/frame_w)*100)), 1),
                    "height": round(max(1, min(100, (box_h/frame_h)*100)), 1),
                })
            return dets
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
    return []


@app.get("/health")
async def health():
    return {
        "status": "healthy", "mode": "hitakshi-v13-real-yolo", "version": "13.0.0",
        "crack_model": crack_model is not None,
        "road_model": road_model is not None,
        "roboflow": bool(ROBOFLOW_API_KEY),
        "crack_classes": crack_model.names if crack_model else {},
        "road_classes": road_model.names if road_model else {},
    }


@app.post("/detect-base64")
async def detect_base64(request_body: dict):
    t0 = time.time()
    all_detections = []
    models_used = []
    errors = []

    try:
        image_b64 = request_body.get("imageBase64", "")
        confidence = max(0.45, float(request_body.get("confidence", 0.55)))
        imgsz = max(640, min(1280, int(request_body.get("imgsz", 960))))
        if not image_b64:
            return {"success": True, "model": "none", "detections": [], "count": 0, "errors": ["no image"]}
        if "," in image_b64 and image_b64.startswith("data:"):
            image_b64 = image_b64.split(",", 1)[1]
        image_bytes = base64.b64decode(image_b64)
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return {"success": True, "model": "none", "detections": [], "count": 0, "errors": ["decode failed"]}
    except Exception as e:
        return {"success": True, "model": "none", "detections": [], "count": 0, "errors": [str(e)]}

    h, w = frame.shape[:2]

    # Road-damage detections require road context. This prevents the crack
    # model from treating ceiling seams, cables, or indoor lines as road cracks.
    road_context_detected = False

    # 1. CRACK (Hitakshi's exact code)
    if crack_model is not None:
        try:
            results = crack_model.predict(source=frame, imgsz=imgsz, conf=max(0.60, confidence), iou=0.35, device="cpu", verbose=False)
            result = results[0]
            if result.boxes is not None and len(result.boxes) > 0:
                for bbox, conf, cid in zip(result.boxes.xyxy.cpu().numpy(), result.boxes.conf.cpu().numpy(), result.boxes.cls.cpu().numpy().astype(int)):
                    x1, y1, x2, y2 = [float(v) for v in bbox]
                    label = result.names.get(int(cid), str(cid))
                    all_detections.append({
                        "model": "CRACK-YOLO", "label": label,
                        "confidence": round(float(conf), 4),
                        "x": round(max(0, min(100, (x1/w)*100)), 1),
                        "y": round(max(0, min(100, (y1/h)*100)), 1),
                        "width": round(max(1, min(100, ((x2-x1)/w)*100)), 1),
                        "height": round(max(1, min(100, ((y2-y1)/h)*100)), 1),
                        "severity": estimate_severity(float(conf), label.lower().replace(" ", "_")),
                    })
                models_used.append("CRACK-YOLO")
                print(f"[ML] CRACK: {len(result.boxes)} detections")
        except Exception as e:
            errors.append(f"crack: {e}")
            print(f"[ML] CRACK error: {e}")

    # 2. ROAD (Hitakshi's exact code)
    if road_model is not None:
        try:
            results = road_model.predict(source=frame, device="cpu", conf=max(0.50, confidence), iou=0.40, imgsz=imgsz, verbose=False)
            result = results[0]
            if result.boxes is not None and len(result.boxes) > 0:
                for bbox, conf, cid in zip(result.boxes.xyxy.cpu().numpy(), result.boxes.conf.cpu().numpy(), result.boxes.cls.cpu().numpy().astype(int)):
                    x1, y1, x2, y2 = [float(v) for v in bbox]
                    label = result.names.get(int(cid), str(cid))
                    road_context_detected = True
                    all_detections.append({
                        "model": "ROAD-YOLO", "label": label,
                        "confidence": round(float(conf), 4),
                        "x": round(max(0, min(100, (x1/w)*100)), 1),
                        "y": round(max(0, min(100, (y1/h)*100)), 1),
                        "width": round(max(1, min(100, ((x2-x1)/w)*100)), 1),
                        "height": round(max(1, min(100, ((y2-y1)/h)*100)), 1),
                        "severity": estimate_severity(float(conf), label.lower().replace(" ", "_")),
                    })
                models_used.append("ROAD-YOLO")
                print(f"[ML] ROAD: {len(result.boxes)} detections")
        except Exception as e:
            errors.append(f"road: {e}")
            print(f"[ML] ROAD error: {e}")

    if not road_context_detected:
        crack_count = sum(1 for detection in all_detections if detection.get("model") == "CRACK-YOLO")
        if crack_count:
            all_detections = [detection for detection in all_detections if detection.get("model") != "CRACK-YOLO"]
            print(f"[ML] Rejected {crack_count} crack detection(s): no road context")

    # 3. RAILWAY (Roboflow via requests)
    try:
        rf_dets = roboflow_infer(image_bytes, RAILWAY_MODEL_ID, confidence)
        if rf_dets:
            all_detections.extend(rf_dets)
            models_used.append("RAILWAY")
            print(f"[ML] RAILWAY: {len(rf_dets)} detections")
    except Exception as e:
        errors.append(f"railway: {e}")

    # 4. RUST (Roboflow via requests)
    try:
        rf_dets = roboflow_infer(image_bytes, RUST_MODEL_ID, confidence)
        if rf_dets:
            all_detections.extend(rf_dets)
            models_used.append("RUST")
            print(f"[ML] RUST: {len(rf_dets)} detections")
    except Exception as e:
        errors.append(f"rust: {e}")

    elapsed = time.time() - t0
    print(f"[ML] TOTAL: {len(all_detections)} detections from {models_used} in {elapsed:.1f}s")
    return {
        "success": True,
        "model": "+".join(models_used) if models_used else "none",
        "detections": all_detections,
        "count": len(all_detections),
        "errors": errors if errors else None,
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ML_PORT", 8000))
    print(f"[DRIFT ML v13] Hitakshi REAL YOLO — Port: {port}")
    print(f"[DRIFT ML v13] CRACK: {'OK' if crack_model else 'MISSING'}")
    print(f"[DRIFT ML v13] ROAD: {'OK' if road_model else 'MISSING'}")
    print(f"[DRIFT ML v13] Roboflow: {'OK' if ROBOFLOW_API_KEY else 'NO KEY'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
