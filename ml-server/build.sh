#!/bin/bash
# Render build script: converts .pt models to ONNX, then installs lightweight deps
set -e

echo "[BUILD] Installing ultralytics for ONNX conversion..."
pip install ultralytics --quiet 2>/dev/null || true

echo "[BUILD] Converting .pt models to ONNX..."
python convert_models.py || echo "[BUILD] Conversion failed, will use Roboflow/Gemini only"

echo "[BUILD] Removing heavy ultralytics/torch (not needed at runtime)..."
pip uninstall -y ultralytics torch torchvision 2>/dev/null || true

echo "[BUILD] Installing lightweight runtime dependencies..."
pip install -r requirements.txt

echo "[BUILD] Done!"
