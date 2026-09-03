"""
DRIFT ML Server v6 — Hitakshi's real models, ultra-memory-efficient
Uses onnxruntime with aggressive memory management for free-tier 512MB
Loads ONE model at a time, unloads immediately after inference
Falls back to Roboflow API (railway/rust) and Gemini if ONNX OOMs
"""
import os, json, base64, time, gc, sys, io
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from concurrent.futures import ThreadPoolExecutor
import threading

app = FastAPI(title="DRIFT ML", version="6.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Serialize inference — only ONE at a time to control memory
_inference_lock = threading.Lock()

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


def onnx_detect(image_bytes, onnx_path, model_name, conf=0.25):
    """Load → infer → unload. Peak memory ~200MB per call, freed immediately."""
    if not os.path.exists(onnx_path):
        print(f"[ML] {model_name}: ONNX not found at {onnx_path}")
        return []
    try:
        import onnxruntime as ort
        import numpy as np
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_resized = img.resize((640, 640))
        arr = np.array(img_resized, dtype=np.float32) / 255.0
        arr = arr.transpose(2, 0, 1)
        arr = np.expand_dims(arr, 0)
        del img, img_resized

        # Minimal ONNX session — single thread, CPU only
        opts = ort.SessionOptions()
        opts.inter_op_num_threads = 1
        opts.intra_op_num_threads = 1
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL

        sess = ort.InferenceSession(onnx_path, opts, providers=["CPUExecutionProvider"])
        input_name = sess.get_inputs()[0].name
        outputs = sess.run(None, {input_name: arr})
        del arr, sess
        gc.collect()

        raw = outputs[0]
        if raw.ndim == 3:
            raw = raw[0]
        elif raw.ndim == 2:
            raw = raw.T
        else:
            return []

        detections = []
        for det in raw:
            if len(det) < 6:
                continue
            cx, cy, w, h = det[0], det[1], det[2], det[3]
            obj_conf = float(det[4])
            class_scores = det[5:]
            if obj_conf < conf:
                continue
            class_idx = int(np.argmax(class_scores))
            class_conf = float(class_scores[class_idx])
            final_conf = obj_conf * class_conf
            if final_conf < conf:
                continue
            detections.append({
                "model": model_name,
                "label": model_name.lower(),
                "confidence": round(final_conf, 4),
                "x": round(max(0, min(100, ((cx - w/2) / 640) * 100)), 1),
                "y": round(max(0, min(100, ((cy - h/2) / 640) * 100)), 1),
                "width": round(max(1, min(100, (w / 640) * 100)), 1),
                "height": round(max(1, min(100, (h / 640) * 100)), 1),
            })
        print(f"[ML] {model_name}: {len(detections)} detections")
        return detections
    except Exception as e:
        print(f"[ML] {model_name} ONNX error: {e}")
        return []
    finally:
        gc.collect()


def roboflow_detect(image_bytes, model_id, model_name, conf=0.25):
    """Roboflow API — lightweight HTTP, no local ML needed."""
    if not ROBOFLOW_API_KEY:
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
        print(f"[ML] {model_name} Roboflow error: {e}")
        return []


def gemini_detect(image_b64, mime="image/jpeg"):
    """Gemini Vision — cloud API, no local memory usage."""
    if not GEMINI_API_KEY:
        return []
    try:
        import requests
        prompt = (
            "You are an infrastructure defect detector. "
            "Analyze this image for infrastructure defects: cracks, potholes, structural damage, "
            "corrosion, spalling, exposed rebar, settlement, rail faults. "
            'Return JSON array: [{"label":"<defect_type>","confidence":<0.0-1.0>,"x":<0-100>,"y":<0-100>,"width":<0-100>,"height":<0-100>}] '
            "Valid labels: crack, pothole, structural, corrosion, spalling, exposed_rebar, settlement, rail_alignment. "
            "Return ONLY valid JSON array. Empty array if no defects."
        )
        body = {
            "contents": [{"parts": [
                {"text": prompt},
                {"inlineData": {"mimeType": mime, "data": image_b64}}
            ]}],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}
        }
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
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
            label = str(item.get("label", "")).lower().strip()
            if not label or label == "none":
                continue
            conf = float(item.get("confidence", 0.5))
            if conf <= 0:
                continue
            dets.append({
                "model": "gemini-1.5-flash",
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


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "mode": "hitakshi-real-ml-v6",
        "models": {
            "crack": {"onnx": os.path.exists("cracks/main_crack.onnx"), "pt": os.path.exists("cracks/main_crack.pt")},
            "road": {"onnx": os.path.exists("road-ml/main_road.onnx"), "pt": os.path.exists("road-ml/main_road.pt")},
            "railway": {"roboflow": bool(ROBOFLOW_API_KEY)},
            "rust": {"roboflow": bool(ROBOFLOW_API_KEY)},
        },
        "roboflow": "configured" if ROBOFLOW_API_KEY else "missing",
        "gemini": "configured" if GEMINI_API_KEY else "missing",
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

    # Serialize — one inference at a time
    _inference_lock.acquire()
    try:
        return await _run_detection(image_bytes, image_b64, confidence)
    finally:
        _inference_lock.release()
        gc.collect()


async def _run_detection(image_bytes, image_b64, confidence):
    all_detections = []
    models_used = []
    t0 = time.time()

    # 1. Roboflow — lightweight HTTP, always works
    for model_id, name in [
        ("railway-track-fault-detection-hrem8/3", "RAILWAY"),
        ("corrosion-yolov8/4", "RUST"),
    ]:
        dets = roboflow_detect(image_bytes, model_id, name, confidence)
        all_detections.extend(dets)
        if dets:
            models_used.append(name)

    # 2. ONNX YOLO — one model at a time, unload between
    for onnx_path, name in [
        ("cracks/main_crack.onnx", "CRACK"),
        ("road-ml/main_road.onnx", "ROAD"),
    ]:
        if not os.path.exists(onnx_path):
            continue
        try:
            dets = onnx_detect(image_bytes, onnx_path, name, confidence)
            all_detections.extend(dets)
            if dets:
                models_used.append(name)
            gc.collect()
        except Exception as e:
            print(f"[ML] {name} failed: {e}")

    # 3. Gemini cloud API — no local memory, backup
    if not all_detections and GEMINI_API_KEY:
        dets = gemini_detect(image_b64)
        all_detections.extend(dets)
        if dets:
            models_used.append("GEMINI")

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
    print(f"[DRIFT ML v6] Hitakshi Real ML — Port: {port}")
    print(f"[DRIFT ML v6] Roboflow: {'OK' if ROBOFLOW_API_KEY else 'NO KEY'} | Gemini: {'OK' if GEMINI_API_KEY else 'BACKUP'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
