#!/bin/bash
# Render build: install runtime deps (ultralytics includes torch)
set -e
echo "[BUILD] Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt
echo "[BUILD] Done!"
