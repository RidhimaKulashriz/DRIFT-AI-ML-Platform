# DRIFT ML Server — Hitakshi's Models

This server wraps Hitakshi's 4-model pipeline as an HTTP API for the DRIFT backend.

## Models

| Model | Type | Purpose | Requires |
|-------|------|---------|----------|
| CRACK | Local YOLO (`main_crack.pt`) | Crack detection | Nothing extra |
| ROAD | Local YOLO (`main_road.pt`) | Road damage, potholes | Nothing extra |
| RAILWAY | Roboflow API | Track fault detection | `ROBOFLOW_API_KEY` |
| RUST | Roboflow API | Corrosion detection | `ROBOFLOW_API_KEY` |

## Setup

### 1. Clone Hitakshi's repo
```bash
git clone https://github.com/hitakshijoshi20072911/ml-models.git
```

### 2. Place model files
```
ml-models/
├── cracks/
│   └── main_crack.pt      # Download from Hitakshi's repo
├── road-ml/
│   └── main_road.pt        # Download from Hitakshi's repo
└── main_app1.py            # Hitakshi's integration script
```

### 3. Install ML server dependencies
```bash
cd ml-server
pip install -r requirements.txt
```

### 4. Set environment variables
```bash
# Required for RAILWAY and RUST models
export ROBOFLOW_API_KEY="your-roboflow-api-key"

# Path to Hitakshi's main_app1.py (adjust if needed)
export ML_SCRIPT_PATH="../ml-models/main_app1.py"
```

### 5. Start the server
```bash
python server.py
# Server starts on http://localhost:8000
```

### 6. Connect DRIFT backend
Set this on Render:
```
ML_INFERENCE_URL=http://localhost:8000/detect-base64
```

If running on a different machine, replace `localhost` with the server's IP/hostname.

## API Endpoints

### `POST /detect-base64`
Accepts base64 image (what DRIFT backend sends).

**Request:**
```json
{
  "imageBase64": "<base64-encoded-image>",
  "fileName": "road_crack.jpg",
  "confidence": 0.25,
  "imgsz": 640
}
```

**Response:**
```json
{
  "success": true,
  "model": "hitakshi-crack-yolo+hitakshi-road-yolo",
  "detections": [
    {
      "model": "hitakshi-road-yolo",
      "label": "pothole",
      "confidence": 0.91,
      "boundingBox": {"x": 10, "y": 20, "width": 30, "height": 25},
      "severity": "high"
    }
  ]
}
```

### `POST /detect`
Accepts multipart file upload (for testing).

```bash
curl -X POST http://localhost:8000/detect -F "file=@test.jpg"
```

### `GET /health`
Check server status.

## ML Priority Chain in DRIFT

When an image is uploaded to DRIFT:

1. **Hitakshi's ML server** (`ML_INFERENCE_URL`) — tried first
2. **Gemini 2.5 Flash** (`GEMINI_API_KEY`) — fallback if Hitakshi unavailable
3. **No detection** — honestly reports "no automated analysis"

The system never fabricates detections. If both ML services are down, it returns `no-ml-configured`.

## Label Mapping

Hitakshi's labels → DRIFT defect types:

| Hitakshi Label | DRIFT Type |
|----------------|------------|
| crack, Cracks | crack |
| pothole, Pothole | pothole |
| corrosion, Rust | corrosion |
| railway, track_fault | rail_alignment |
| patching | spalling |
| rutting, bumps | settlement |
| manhole, utility hole | obstruction |
| crosswalk fading | surface_damage |
