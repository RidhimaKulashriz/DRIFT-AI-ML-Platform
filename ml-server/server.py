"""
DRIFT ML Server v13 — EXACT Hitakshi Code + FastAPI Wrapper
Uses her real main_app1.py logic: Ultralytics YOLO + Roboflow SDK
No ONNX conversion. No Gemini. No fakes. REAL ML.
"""
import os, io, json, base64, time, traceback
import cv2
import numpy as np
import torch
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")

from ultralytics import YOLO

app = FastAPI(title="DRIFT ML", version="13.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")
BASE_DIR = Path(__file__).parent
CRACK_MODEL_PATH = BASE_DIR / "cracks" / "main_crack.pt"
ROAD_MODEL_PATH = BASE_DIR / "road-ml" / "main_road.pt"

# Load models at startup (Hitakshi's exact code)
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
    traceback.print_exc()

try:
    if ROAD_MODEL_PATH.exists():
        print(f"[LOAD] ROAD model: {ROAD_MODEL_PATH}")
        road_model = YOLO(str(ROAD_MODEL_PATH))
        print(f"[OK] Road loaded. Classes: {road_model.names}")
    else:
        print(f"[WARN] ROAD model not found: {ROAD_MODEL_PATH}")
except Exception as e:
    print(f"[ERROR] ROAD load failed: {e}")
    traceback.print_exc()

# Roboflow client (Hitakshi's exact code)
roboflow_client = None
try:
    if ROBOFLOW_API_KEY:
        from inference_sdk import InferenceHTTPClient, InferenceConfiguration
        roboflow_client = InferenceHTTPClient(
            api_url="https://serverless.roboflow.com",
            api_key=ROBOFLOW_API_KEY,
        ).configure(InferenceConfiguration(api_key_transport="header"))
        print("[OK] Roboflow client ready")
except Exception as e:
    print(f"[WARN] Roboflow client failed: {e}")

RAILWAY_MODEL_ID = "railway-track-fault-detection-hrem8/3"
RUST_MODEL_ID = "corrosion-yolov8/4"


def estimate_severity(conf, label):
    critical = {"structural", "exposed_rebar", "settlement", "rail_alignment"}
    high = {"corrosion", "spalling", "pothole"}
    if label in critical: return "critical" if conf >= 0.85 else "high" if conf >= 0.60 else "medium"
    if label in high: return "high" if conf >= 0.90 else "medium" if conf >= 0.70 else "low"
    return "high" if conf >= 0.85 else "medium" if conf >= 0.60 else "low"


@app.get("/health")
async def health():
    return {
        "status": "healthy", "mode": "hitakshi-v13-real-yolo", "version": "13.0.0",
        "crack_model": crack_model is not None,
        "road_model": road_model is not None,
        "roboflow": roboflow_client is not None,
        "crack_classes": crack_model.names if crack_model else {},
        "road_classes": road_model.names if road_model else {},
    }


@app.post("/detect-base64")
async def detect_base64(request_body: dict):
    t0 = time.time()
    all_detections = []
    errors = []

    try:
        image_b64 = request_body.get("imageBase64", "")
        confidence = float(request_body.get("confidence", 0.30))
        imgsz = int(request_body.get("imgsz", 640))
        if not image_b64:
            return {"success": True, "model": "none", "detections": [], "count": 0, "errors": ["no image"]}
        if "," in image_b64 and image_b64.startswith("data:"):
            image_b64 = image_b64.split(",", 1)[1]
        image_bytes = base64.b64decode(image_b64)
        # Decode to numpy (Hitakshi uses cv2)
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return {"success": True, "model": "none", "detections": [], "count": 0, "errors": ["decode failed"]}
    except Exception as e:
        return {"success": True, "model": "none", "detections": [], "count": 0, "errors": [str(e)]}

    models_used = []

    # 1. CRACK (Hitakshi's exact code)
    if crack_model is not None:
        try:
            results = crack_model.predict(source=frame, imgsz=imgsz, conf=confidence, iou=0.45, device="cpu", verbose=False)
            result = results[0]
            if result.boxes is not None and len(result.boxes) > 0:
                boxes = result.boxes.xyxy.cpu().numpy()
                confs = result.boxes.conf.cpu().numpy()
                clses = result.boxes.cls.cpu().numpy().astype(int)
                h, w = frame.shape[:2]
                for bbox, conf, cid in zip(boxes, confs, clses):
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
                print(f"[ML] CRACK: {len(boxes)} detections")
        except Exception as e:
            errors.append(f"crack: {e}")
            print(f"[ML] CRACK error: {e}")

    # 2. ROAD (Hitakshi's exact code)
    if road_model is not None:
        try:
            results = road_model.predict(source=frame, device="cpu", conf=confidence, iou=0.45, imgsz=imgsz, verbose=False)
            result = results[0]
            if result.boxes is not None and len(result.boxes) > 0:
                boxes = result.boxes.xyxy.cpu().numpy()
                confs = result.boxes.conf.cpu().numpy()
                clses = result.boxes.cls.cpu().numpy().astype(int)
                h, w = frame.shape[:2]
                for bbox, conf, cid in zip(boxes, confs, clses):
                    x1, y1, x2, y2 = [float(v) for v in bbox]
                    label = result.names.get(int(cid), str(cid))
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
                print(f"[ML] ROAD: {len(boxes)} detections")
        except Exception as e:
            errors.append(f"road: {e}")
            print(f"[ML] ROAD error: {e}")

    # 3. RAILWAY (Hitakshi's exact Roboflow code)
    if roboflow_client is not None:
        try:
            result = roboflow_client.infer(frame, model_id=RAILWAY_MODEL_ID)
            preds = result.get("predictions", []) if isinstance(result, dict) else getattr(result, "predictions", [])
            if preds:
                h, w = frame.shape[:2]
                for p in preds:
                    if hasattr(p, "dict"): p = p.dict()
                    elif hasattr(p, "__dict__"): p = vars(p)
                    if not isinstance(p, dict): continue
                    conf = float(p.get("confidence", 0))
                    if conf < confidence: continue
                    label = p.get("class", "railway_defect")
                    px, py, pw, ph = float(p.get("x",0)), float(p.get("y",0)), float(p.get("width",0)), float(p.get("height",0))
                    all_detections.append({
                        "model": "RAILWAY", "label": label,
                        "confidence": round(conf, 4),
                        "x": round(max(0, min(100, ((px-pw/2)/w)*100)), 1),
                        "y": round(max(0, min(100, ((py-ph/2)/h)*100)), 1),
                        "width": round(max(1, min(100, (pw/w)*100)), 1),
                        "height": round(max(1, min(100, (ph/h)*100)), 1),
                        "severity": estimate_severity(conf, "rail_alignment"),
                    })
                models_used.append("RAILWAY")
                print(f"[ML] RAILWAY: {len(preds)} detections")
        except Exception as e:
            errors.append(f"railway: {e}")

    # 4. RUST (Hitakshi's exact Roboflow code)
    if roboflow_client is not None:
        try:
            result = roboflow_client.infer(frame, model_id=RUST_MODEL_ID)
            preds = result.get("predictions", []) if isinstance(result, dict) else getattr(result, "predictions", [])
            if preds:
                h, w = frame.shape[:2]
                for p in preds:
                    if hasattr(p, "dict"): p = p.dict()
                    elif hasattr(p, "__dict__"): p = vars(p)
                    if not isinstance(p, dict): continue
                    conf = float(p.get("confidence", 0))
                    if conf < confidence: continue
                    label = p.get("class", "corrosion")
                    px, py, pw, ph = float(p.get("x",0)), float(p.get("y",0)), float(p.get("width",0)), float(p.get("height",0))
                    all_detections.append({
                        "model": "RUST", "label": label,
                        "confidence": round(conf, 4),
                        "x": round(max(0, min(100, ((px-pw/2)/w)*100)), 1),
                        "y": round(max(0, min(100, ((py-ph/2)/h)*100)), 1),
                        "width": round(max(1, min(100, (pw/w)*100)), 1),
                        "height": round(max(1, min(100, (ph/h)*100)), 1),
                        "severity": estimate_severity(conf, "corrosion"),
                    })
                models_used.append("RUST")
                print(f"[ML] RUST: {len(preds)} detections")
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
    print(f"[DRIFT ML v13] Roboflow: {'OK' if roboflow_client else 'NO KEY'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
