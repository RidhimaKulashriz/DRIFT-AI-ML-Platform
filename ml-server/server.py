"""
DRIFT ML Server — Hitakshi's real models, free-tier compatible
Runtime: onnxruntime ONLY (no PyTorch at runtime = ~200MB RAM)
Build-time: ultralytics converts .pt → .onnx during Render build
Models: CRACK (YOLO ONNX), ROAD (YOLO ONNX), RAILWAY (Roboflow), RUST (Roboflow)
"""
import os, json, base64, time, gc
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="DRIFT ML", version="5.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Label mapping
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


# ---- ONNX YOLO inference (load → run → unload) ----

def onnx_yolo_detect(image_bytes, onnx_path, model_name, conf=0.25):
    """Load ONNX model, run inference, unload. Peak ~200MB per model."""
    if not os.path.exists(onnx_path):
        print(f"[ML] {model_name}: ONNX not found at {onnx_path}")
        return []
    try:
        import onnxruntime as ort
        import numpy as np
        from PIL import Image
        import io

        # Preprocess image
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        orig_w, orig_h = img.size
        img_resized = img.resize((640, 640))
        arr = np.array(img_resized, dtype=np.float32) / 255.0
        arr = arr.transpose(2, 0, 1)  # HWC -> CHW
        arr = np.expand_dims(arr, 0)  # add batch dim

        # Run ONNX inference
        sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
        input_name = sess.get_inputs()[0].name
        outputs = sess.run(None, {input_name: arr})
        del sess
        gc.collect()

        # Parse YOLO output: shape [1, num_detections, 5+num_classes] or [1, 5+num_classes, num_detections]
        raw = outputs[0]
        if raw.ndim == 3:
            # [1, N, 5+C] format
            raw = raw[0]  # remove batch
        elif raw.ndim == 2:
            # [5+C, N] format -> transpose
            raw = raw.T
        else:
            print(f"[ML] {model_name}: unexpected output shape {raw.shape}")
            return []

        detections = []
        for det in raw:
            # YOLO output: [cx, cy, w, h, obj_conf, class_scores...]
            if len(det) < 6:
                continue
            cx, cy, w, h = det[0], det[1], det[2], det[3]
            obj_conf = det[4]
            class_scores = det[5:]
            if obj_conf < conf:
                continue
            class_idx = int(np.argmax(class_scores))
            class_conf = float(class_scores[class_idx])
            final_conf = float(obj_conf) * class_conf
            if final_conf < conf:
                continue

            # Convert to percentage of original image
            x_pct = max(0, min(100, ((cx - w/2) / 640) * 100))
            y_pct = max(0, min(100, ((cy - h/2) / 640) * 100))
            w_pct = max(1, min(100, (w / 640) * 100))
            h_pct = max(1, min(100, (h / 640) * 100))

            detections.append({
                "model": model_name,
                "label": model_name.lower().replace(" ", "_"),
                "confidence": round(final_conf, 4),
                "x": round(x_pct, 1),
                "y": round(y_pct, 1),
                "width": round(w_pct, 1),
                "height": round(h_pct, 1),
            })

        print(f"[ML] {model_name}: {len(detections)} detections")
        return detections

    except ImportError:
        print(f"[ML] {model_name}: onnxruntime not installed")
        return []
    except Exception as e:
        print(f"[ML] {model_name} error: {e}")
        return []


# ---- Roboflow API (Hitakshi's railway + rust) ----

def roboflow_detect(image_bytes, model_id, model_name, conf=0.25):
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
                    "x": pred.get("x", 0), "y": pred.get("y", 0),
                    "width": pred.get("width", 0), "height": pred.get("height", 0),
                })
        print(f"[ML] {model_name}: {len(dets)} detections")
        return dets
    except Exception as e:
        print(f"[ML] {model_name} error: {e}")
        return []


# ---- Gemini Vision (backup for crack/road if ONNX not available) ----

def gemini_vision_detect(image_b64, mime="image/jpeg"):
    if not GEMINI_API_KEY:
        print("[ML] Gemini: no GEMINI_API_KEY")
        return []
    try:
        import requests
        prompt = (
            "You are an infrastructure defect detector for roads, bridges, railways, and buildings. "
            "Analyze this image for: cracks, potholes, structural damage, corrosion, spalling, "
            "exposed rebar, water intrusion, settlement, rail faults, obstructions. "
            'Return JSON array: [{"label":"<defect_type>","confidence":<0.0-1.0>,"x":<0-100>,"y":<0-100>,"width":<0-100>,"height":<0-100>}] '
            "Valid labels: crack, pothole, structural, corrosion, spalling, exposed_rebar, settlement, obstruction, rail_alignment. "
            "If NO defect found, return empty array []. Return ONLY valid JSON."
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
            print(f"[ML] Gemini HTTP {resp.status_code}: {resp.text[:200]}")
            return []
        result = resp.json()
        text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        if not text:
            print("[ML] Gemini: no text in response")
            return []
        parsed = json.loads(text)
        if isinstance(parsed, dict) and "detections" in parsed:
            parsed = parsed["detections"]
        if not isinstance(parsed, list):
            print(f"[ML] Gemini: unexpected format: {type(parsed)}")
            return []
        dets = []
        for item in parsed:
            label = str(item.get("label", "")).lower().strip()
            if not label or label == "none":
                continue
            conf = float(item.get("confidence", 0.5))
            if conf <= 0:
                continue
            dets.append({
                "model": "gemini-2.5-flash",
                "label": label,
                "confidence": min(1.0, max(0.0, conf)),
                "x": float(item.get("x", 10)),
                "y": float(item.get("y", 10)),
                "width": float(item.get("width", 40)),
                "height": float(item.get("height", 40)),
            })
        print(f"[ML] Gemini: {len(dets)} detections")
        return dets
    except Exception as e:
        print(f"[ML] Gemini error: {e}")
        return []


# ---- Endpoints ----

@app.get("/health")
async def health():
    crack_onnx = os.path.exists("cracks/main_crack.onnx")
    road_onnx = os.path.exists("road-ml/main_road.onnx")
    crack_pt = os.path.exists("cracks/main_crack.pt")
    road_pt = os.path.exists("road-ml/main_road.pt")
    return {
        "status": "healthy",
        "mode": "hitakshi-real-ml",
        "models": {
            "crack": {"onnx": crack_onnx, "pt": crack_pt},
            "road": {"onnx": road_onnx, "pt": road_pt},
            "railway": {"roboflow": bool(ROBOFLOW_API_KEY)},
            "rust": {"roboflow": bool(ROBOFLOW_API_KEY)},
        },
        "onnxruntime": _check_onnxruntime(),
        "roboflow": "configured" if ROBOFLOW_API_KEY else "missing",
        "gemini": "configured" if GEMINI_API_KEY else "missing",
    }

def _check_onnxruntime():
    try:
        import onnxruntime
        return "available"
    except ImportError:
        return "not_installed"


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

    # 1. Hitakshi's ONNX YOLO models (CRACK + ROAD) — loaded one at a time, unloaded after
    onnx_models = [
        ("cracks/main_crack.onnx", "CRACK"),
        ("road-ml/main_road.onnx", "ROAD"),
    ]
    for onnx_path, name in onnx_models:
        try:
            dets = onnx_yolo_detect(image_bytes, onnx_path, name, confidence)
            all_detections.extend(dets)
            if dets:
                models_used.append(name)
            gc.collect()
        except Exception as e:
            print(f"[ML] {name} failed: {e}")

    # 2. Hitakshi's Roboflow models (RAILWAY + RUST) — HTTP API only
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

    # 3. Gemini backup (only if no detections from Hitakshi's models)
    if not all_detections and GEMINI_API_KEY:
        try:
            dets = gemini_vision_detect(image_b64)
            all_detections.extend(dets)
            if dets:
                models_used.append("GEMINI-VISION")
        except Exception as e:
            print(f"[ML] Gemini failed: {e}")

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
    print(f"[DRIFT ML v5] Hitakshi Real ML — Port: {port}")
    print(f"[DRIFT ML v5] ONNX Runtime: {_check_onnxruntime()}")
    print(f"[DRIFT ML v5] Roboflow: {'OK' if ROBOFLOW_API_KEY else 'NO KEY'} | Gemini: {'OK' if GEMINI_API_KEY else 'BACKUP'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
