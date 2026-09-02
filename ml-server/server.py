"""
DRIFT ML Inference Server — Hitakshi's Models
Works on Render FREE TIER (512MB RAM) by using only HTTP-based inference.
YOLO models are skipped on free tier (need too much RAM).
Roboflow API calls are lightweight HTTP requests.
"""
import os, json, base64, gc
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="DRIFT ML", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")
USE_YOLO = os.environ.get("USE_YOLO", "false").lower() == "true"
CRACK_MODEL_PATH = os.environ.get("CRACK_MODEL_PATH", "cracks/main_crack.pt")
ROAD_MODEL_PATH = os.environ.get("ROAD_MODEL_PATH", "road-ml/main_road.pt")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# ── Label mapping ─────────────────────────────────────────────────────────────
LABEL_MAP = {
    "crack": "crack", "cracks": "crack", "Crack": "crack",
    "pothole": "pothole", "potholes": "pothole", "Pothole": "pothole",
    "corrosion": "corrosion", "Corrosion": "corrosion", "rust": "corrosion",
    "spalling": "spalling", "patching": "spalling",
    "settlement": "settlement", "rutting": "settlement", "bumps": "settlement",
    "obstruction": "obstruction", "manhole": "obstruction",
    "Longitudinal Crack": "crack", "Transverse Crack": "crack", "Alligator Crack": "crack",
    "surface_crack": "crack", "Defective": "rail_alignment",
}
MODEL_NAME_MAP = {
    "CRACK": "hitakshi-crack-yolo", "ROAD": "hitakshi-road-yolo",
    "RAILWAY": "hitakshi-railway-roboflow", "RUST": "hitakshi-rust-roboflow",
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

def roboflow_detect(image_bytes, model_id, model_name, conf=0.25):
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
        print(f"[ML] {model_name} error: {e}")
        return []

def run_yolo(model_path, image_bytes, model_name, conf=0.25, imgsz=640):
    if not USE_YOLO:
        return []
    try:
        from ultralytics import YOLO
        import numpy as np, cv2
        path = Path(model_path)
        if not path.exists():
            path = Path(__file__).parent / model_path
        if not path.exists():
            print(f"[ML] Model not found: {model_path}")
            return []
        model = YOLO(str(path))
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
        del model
        gc.collect()
        return dets
    except Exception as e:
        print(f"[ML] {model_name} YOLO error: {e}")
        return []

def gemini_detect(image_b64, mime="image/jpeg"):
    """Call Gemini Vision API directly for infrastructure defect detection."""
    if not GEMINI_API_KEY:
        return []
    try:
        import requests
        prompt = (
            "You are an infrastructure defect detector. Analyze this image for road cracks, "
            "potholes, structural damage, corrosion, spalling, exposed rebar, water intrusion, "
            "settlement, or other infrastructure defects. "
            'Return JSON array: [{"label":"<pothole|crack|structural|corrosion|spalling|exposed_rebar|settlement|obstruction>","confidence":<0-1>,"x":<0-100>,"y":<0-100>,"width":<0-100>,"height":<0-100>}] '
            "If no defect found, return empty array []. Return ONLY valid JSON."
        )
        body = {
            "contents": [{"parts": [
                {"text": prompt},
                {"inlineData": {"mimeType": mime, "data": image_b64}}
            ]}],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}
        }
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
        resp = requests.post(url, json=body, timeout=60)
        if resp.status_code != 200:
            print(f"[ML] Gemini HTTP {resp.status_code}")
            return []
        result = resp.json()
        text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        if not text:
            return []
        parsed = json.loads(text)
        if isinstance(parsed, dict) and "detections" in parsed:
            parsed = parsed["detections"]
        if not isinstance(parsed, list):
            return []
        dets = []
        for item in parsed:
            label = item.get("label", "crack")
            if label == "none" or label == "none_found":
                continue
            conf = float(item.get("confidence", 0.5))
            if conf <= 0:
                continue
            dets.append({
                "model": "gemini-2.5-flash",
                "label": label,
                "confidence": conf,
                "x": float(item.get("x", 20)),
                "y": float(item.get("y", 20)),
                "width": float(item.get("width", 40)),
                "height": float(item.get("height", 40)),
            })
        return dets
    except Exception as e:
        print(f"[ML] Gemini error: {e}")
        return []

def _run_all_models(image_bytes, image_b64, confidence, imgsz):
    all_detections = []
    models_used = []

    # 1. Try Roboflow models (lightweight HTTP calls)
    for model_id, name in [
        ("railway-track-fault-detection-hrem8/3", "RAILWAY"),
        ("corrosion-yolov8/4", "RUST"),
    ]:
        try:
            dets = roboflow_detect(image_bytes, model_id, name, confidence)
            all_detections.extend(dets)
            if dets:
                models_used.append(name)
        except Exception as e:
            print(f"[ML] {name} failed: {e}")

    # 2. Try YOLO models only if USE_YOLO=true (needs >512MB RAM)
    if USE_YOLO:
        for mp, name in [(CRACK_MODEL_PATH, "CRACK"), (ROAD_MODEL_PATH, "ROAD")]:
            try:
                dets = run_yolo(mp, image_bytes, name, confidence, imgsz)
                all_detections.extend(dets)
                if dets:
                    models_used.append(name)
            except Exception as e:
                print(f"[ML] {name} failed: {e}")

    # 3. If no detections yet, try Gemini Vision (if configured)
    if not all_detections and GEMINI_API_KEY:
        try:
            dets = gemini_detect(image_b64)
            all_detections.extend(dets)
            if dets:
                models_used.append("GEMINI")
        except Exception as e:
            print(f"[ML] Gemini failed: {e}")

    # Map labels to DRIFT format
    mapped = []
    for d in all_detections:
        ml = map_label(d["label"])
        mapped.append({
            "model": MODEL_NAME_MAP.get(d["model"], d["model"]),
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

    return {
        "success": True,
        "model": "+".join(models_used) if models_used else "none",
        "detections": mapped,
        "count": len(mapped),
    }

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "yolo": USE_YOLO,
        "roboflow": "configured" if ROBOFLOW_API_KEY else "missing",
        "gemini": "configured" if GEMINI_API_KEY else "missing",
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
    return _run_all_models(image_bytes, image_b64, confidence, imgsz)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ML_PORT", 8000))
    print(f"[DRIFT ML] Port: {port} | YOLO: {USE_YOLO} | Roboflow: {'OK' if ROBOFLOW_API_KEY else 'NO KEY'} | Gemini: {'OK' if GEMINI_API_KEY else 'NO KEY'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
