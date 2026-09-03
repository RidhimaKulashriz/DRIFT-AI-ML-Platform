#!/bin/bash
# Render build: convert YOLO .pt → ONNX, then install lightweight runtime
set -e

echo "[BUILD] Installing ultralytics for ONNX conversion..."
pip install --upgrade pip
pip install ultralytics

echo "[BUILD] Converting crack model to ONNX..."
python -c "
from ultralytics import YOLO
model = YOLO('cracks/main_crack.pt')
model.export(format='onnx', imgsz=640, simplify=True)
print('Crack ONNX exported')
"

echo "[BUILD] Converting road model to ONNX..."
python -c "
from ultralytics import YOLO
model = YOLO('road-ml/main_road.pt')
model.export(format='onnx', imgsz=640, simplify=True)
print('Road ONNX exported')
"

echo "[BUILD] Removing heavy ultralytics + torch..."
pip uninstall -y ultralytics torch torchvision torchaudio 2>/dev/null || true

echo "[BUILD] Installing lightweight inference runtime..."
pip install -r requirements.txt

echo "[BUILD] Listing ONNX files..."
ls -la cracks/*.onnx road-ml/*.onnx 2>&1 || echo "Warning: ONNX files not found"

echo "[BUILD] Done!"
