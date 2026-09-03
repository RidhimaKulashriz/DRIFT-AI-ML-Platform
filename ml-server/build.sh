#!/bin/bash
# Render build script: installs runtime deps only
# ONNX conversion was too heavy for free tier — using Roboflow API + Gemini instead
set -e

echo "[BUILD] Installing runtime dependencies..."
pip install -r requirements.txt

echo "[BUILD] Done!"
