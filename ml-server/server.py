"""
DRIFT ML Server v7 — Hitakshi's models via API + Gemini Vision
Fits in Render free tier 512MB:
- Roboflow API: railway + rust (Hitakshi's trained models)
- Gemini 1.5 Flash: crack/road/structural (1000 req/day free, REAL vision AI)
- No PyTorch, no ONNX, no heavy local ML
"""
import os, json, base64, time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="DRIFT ML", version="7.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

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


def roboflow_detect(image_bytes, model_id, model_name, conf=0.25):
    """Hitakshi's Roboflow models — railway fault + corrosion detection."""
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
    """Gemini 1.5 Flash — real Google Vision AI, 1000 requests/day free."""
    if not GEMINI_API_KEY:
        print("[ML] Gemini: no API key")
        return []
    try:
        import requests
        prompt = (
            "You are an infrastructure defect detector for roads, bridges, buildings, railways. "
            "Analyze this image for: cracks, potholes, structural damage, corrosion, spalling, "
            "exposed rebar, water intrusion, settlement, rail alignment faults, obstructions. "
            'Return ONLY a JSON array of defects found. Each item: {"label":"<type>","confidence":<0-1>,"x":<0-100>,"y":<0-100>,"width":<0-100>,"height":<0-100>}. '
            "Valid labels: crack, pothole, structural, corrosion, spalling, exposed_rebar, settlement, rail_alignment, obstruction. "
            "Empty array [] if no defects. Return ONLY the JSON array, nothing else."
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
            print(f"[ML] Gemini HTTP {resp.status_code}: {resp.text[:200]}")
            return []
        result = resp.json()
        text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        if not text:
            print("[ML] Gemini: empty response text")
            return []
        parsed = json.loads(text)
        if isinstance(parsed, dict) and "detections" in parsed:
            parsed = parsed["detections"]
        if not isinstance(parsed, list):
            print(f"[ML] Gemini: unexpected format {type(parsed)}: {str(parsed)[:200]}")
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
        "mode": "hitakshi-api-gemini",
        "models": {
            "railway": {"roboflow": bool(ROBOFLOW_API_KEY)},
            "rust": {"roboflow": bool(ROBOFLOW_API_KEY)},
            "crack": {"gemini": bool(GEMINI_API_KEY)},
            "pothole": {"gemini": bool(GEMINI_API_KEY)},
            "structural": {"gemini": bool(GEMINI_API_KEY)},
            "corrosion": {"gemini": bool(GEMINI_API_KEY)},
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

    all_detections = []
    models_used = []
    t0 = time.time()

    # 1. Hitakshi's Roboflow models — railway fault + corrosion (HTTP API, always works)
    for model_id, name in [
        ("railway-track-fault-detection-hrem8/3", "RAILWAY"),
        ("corrosion-yolov8/4", "RUST"),
    ]:
        dets = roboflow_detect(image_bytes, model_id, name, confidence)
        all_detections.extend(dets)
        if dets:
            models_used.append(name)

    # 2. Gemini Vision — crack/road/structural/corrosion (cloud AI, always works)
    if GEMINI_API_KEY:
        dets = gemini_detect(image_b64)
        all_detections.extend(dets)
        if dets:
            models_used.append("GEMINI-1.5-FLASH")

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
    print(f"[DRIFT ML v7] Hitakshi API + Gemini — Port: {port}")
    print(f"[DRIFT ML v7] Roboflow: {'OK' if ROBOFLOW_API_KEY else 'NO KEY'} | Gemini: {'OK' if GEMINI_API_KEY else 'NO KEY'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
