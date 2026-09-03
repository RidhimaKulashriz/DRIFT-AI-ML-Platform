#!/bin/bash
set -e
echo "[BUILD] Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt
echo "[BUILD] Done"
