#!/usr/bin/env python3
"""
DRIFT Drone Auto-Upload Script
===============================
Connect your drone to laptop, drop images into the watch folder,
and this script automatically:
  1. Detects new images
  2. Extracts GPS from EXIF (if available)
  3. Sends to DRIFT backend → ML detection → DB → Map → PDF → Reports

Usage:
  python drone_upload.py                        # Watch default folder
  python drone_upload.py --folder /path/to/drone # Custom folder
  python drone_upload.py --lat 28.6647 --lon 77.2325  # Fixed location

Requirements:
  pip install Pillow requests

Setup:
  1. Connect drone to laptop via USB or SD card reader
  2. Copy images to the watch folder (or set --folder to drone path)
  3. Run this script
  4. Images appear on DRIFT map + dashboard automatically
"""

import os
import sys
import time
import json
import base64
import hashlib
import argparse
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime

try:
    from PIL import Image
    from PIL.ExifTags import TAGS, GPSTAGS
    from PIL.ExifTags import GPSINFO as GPS_INFO_TAG
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("[WARN] Pillow not installed. EXIF GPS extraction disabled.")
    print("       Install: pip install Pillow")

# ─── Configuration ───────────────────────────────────────────────────
DRIFT_BACKEND = os.environ.get("DRIFT_BACKEND_URL", "https://drift-node-api.onrender.com")
INSPECTIONS_ENDPOINT = f"{DRIFT_BACKEND}/api/inspections"
INGEST_ENDPOINT = f"{DRIFT_BACKEND}/api/drift/evidence"
HEALTH_ENDPOINT = f"{DRIFT_BACKEND}/health"

DEFAULT_WATCH_FOLDER = os.path.join(os.path.expanduser("~"), "DRIFT_Drone_Feed")
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
POLL_INTERVAL = 3  # seconds between folder checks
MAX_IMAGE_SIZE = 12 * 1024 * 1024  # 12MB max

# Campus locations for auto-assignment
CAMPUS_COORDS = {
    "IGDTUW": {"lat": 28.6647, "lon": 77.2325, "campusId": 1, "name": "IGDTUW"},
    "IIIT": {"lat": 28.5444, "lon": 77.2725, "campusId": 2, "name": "IIIT-Delhi"},
}

# Track uploaded files to avoid duplicates
UPLOADED_HASHES = set()
PROCESSED_DIR = None


def log(msg: str):
    """Timestamped log output."""
    ts = datetime.now().strftime("%H:%M:%S")
    try:
        print(f"[{ts}] {msg}")
    except UnicodeEncodeError:
        print(f"[{ts}] {msg.encode('ascii', 'replace').decode('ascii')}")


def check_backend_health() -> bool:
    """Verify DRIFT backend is reachable."""
    try:
        req = urllib.request.Request(HEALTH_ENDPOINT)
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read())
        log(f"Backend health: {data.get('status', 'unknown')}")
        return True
    except Exception as e:
        log(f"Backend unreachable: {e}")
        return False


def extract_gps_from_exif(image_path: str) -> dict | None:
    """Extract GPS coordinates from image EXIF data."""
    if not HAS_PIL:
        return None
    try:
        img = Image.open(image_path)
        exif_data = img._getexif()
        if not exif_data:
            return None

        gps_info = {}
        for tag_id, value in exif_data.items():
            tag = TAGS.get(tag_id, tag_id)
            if tag == "GPSInfo":
                for gps_tag_id, gps_value in value.items():
                    gps_tag = GPSTAGS.get(gps_tag_id, gps_tag_id)
                    gps_info[gps_tag] = gps_value

        if not gps_info:
            return None

        def _to_decimal(dms, ref):
            """Convert GPS DMS to decimal degrees."""
            d = float(dms[0])
            m = float(dms[1])
            s = float(dms[2])
            decimal = d + m / 60 + s / 3600
            if ref in ("S", "W"):
                decimal = -decimal
            return round(decimal, 6)

        if "GPSLatitude" in gps_info and "GPSLongitude" in gps_info:
            lat = _to_decimal(gps_info["GPSLatitude"], gps_info.get("GPSLatitudeRef", "N"))
            lon = _to_decimal(gps_info["GPSLongitude"], gps_info.get("GPSLongitudeRef", "E"))
            return {"lat": lat, "lon": lon}
    except Exception as e:
        log(f"EXIF parse failed for {Path(image_path).name}: {e}")
    return None


def guess_campus(lat: float, lon: float) -> dict | None:
    """Auto-assign campus based on GPS proximity."""
    for key, campus in CAMPUS_COORDS.items():
        # Simple distance check (within ~5km)
        dlat = abs(lat - campus["lat"])
        dlon = abs(lon - campus["lon"])
        if dlat < 0.05 and dlon < 0.05:
            return campus
    return None


def get_image_base64(image_path: str) -> str | None:
    """Read and encode image as base64."""
    try:
        file_size = os.path.getsize(image_path)
        if file_size > MAX_IMAGE_SIZE:
            log(f"Image too large: {file_size / 1024 / 1024:.1f}MB (max 12MB)")
            return None
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("ascii")
    except Exception as e:
        log(f"Failed to read {image_path}: {e}")
        return None


def get_mime_type(path: str) -> str:
    """Get MIME type from file extension."""
    ext = Path(path).suffix.lower()
    mime_map = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp",
        ".heic": "image/heic",
    }
    return mime_map.get(ext, "image/jpeg")


def upload_image(image_path: str, lat: float | None = None, lon: float | None = None) -> dict | None:
    """Upload a single image to DRIFT backend for ML detection + pipeline."""
    file_name = Path(image_path).name
    log(f"Processing: {file_name}")

    # 1. Read image
    img_b64 = get_image_base64(image_path)
    if not img_b64:
        return None

    # 2. Extract GPS from EXIF
    gps = extract_gps_from_exif(image_path)
    if gps:
        lat, lon = gps["lat"], gps["lon"]
        log(f"  GPS from EXIF: {lat}, {lon}")

    # 3. Guess campus from GPS
    campus = guess_campus(lat, lon) if lat and lon else None
    campus_id = campus["campusId"] if campus else None
    campus_name = campus["name"] if campus else "Unknown"

    # 4. Build payload
    payload = {
        "fileName": file_name,
        "mimeType": get_mime_type(image_path),
        "base64": img_b64,
        "campusId": campus_id,
        "inspectionName": f"Drone inspection: {file_name}",
        "latitude": lat,
        "longitude": lon,
        "locationSource": "drone_gps" if gps else ("verified_campus" if campus else "unknown"),
        "assetCriticality": 4,
        "inspectionDomain": "infrastructure",
    }

    # 5. POST to DRIFT backend
    try:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            INSPECTIONS_ENDPOINT,
            data=body,
            headers={"Content-Type": "application/json"},
        )
        log(f"  Uploading to DRIFT backend...")
        resp = urllib.request.urlopen(req, timeout=180)
        result = json.loads(resp.read())

        if result.get("success"):
            ml = result.get("mlUsed", {})
            log(f"  [OK] SUCCESS!")
            log(f"     Inspection: #{result.get('inspectionId')}")
            log(f"     Evidence: #{result.get('evidenceId')}")
            log(f"     Detection: #{result.get('detectionId')}")
            log(f"     ML Source: {ml.get('source')} ({ml.get('model')})")
            if ml.get("defectType"):
                log(f"     Defect: {ml['defectType']} ({ml.get('confidence', 0)*100:.1f}%) - {ml.get('severity')}")
            log(f"     Report: #{result.get('reportId')} ({result.get('pdfSizeBytes', 0)//1024}KB, {result.get('pdfPages')} pages)")
            log(f"     Location: {result.get('locationUsed', {}).get('latitude')}, {result.get('locationUsed', {}).get('longitude')}")
            log(f"     Campus: {campus_name}")
            return result
        else:
            log(f"  [FAIL] FAILED: {result.get('error', 'unknown')}")
            return None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        log(f"  [FAIL] HTTP {e.code}: {body[:200]}")
        return None
    except Exception as e:
        log(f"  [FAIL] Error: {e}")
        return None


def compute_file_hash(path: str) -> str:
    """SHA256 hash of file content for deduplication."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def scan_folder(folder: str) -> list[str]:
    """Find new image files in the folder."""
    new_files = []
    for entry in os.scandir(folder):
        if not entry.is_file():
            continue
        ext = Path(entry.name).suffix.lower()
        if ext not in SUPPORTED_EXTENSIONS:
            continue
        file_hash = compute_file_hash(entry.path)
        if file_hash not in UPLOADED_HASHES:
            new_files.append(entry.path)
    return sorted(new_files)


def move_to_processed(image_path: str):
    """Move uploaded image to _processed subfolder."""
    global PROCESSED_DIR
    if PROCESSED_DIR is None:
        PROCESSED_DIR = os.path.join(os.path.dirname(image_path), "_processed")
        os.makedirs(PROCESSED_DIR, exist_ok=True)
    dest = os.path.join(PROCESSED_DIR, os.path.basename(image_path))
    # Avoid overwrite
    if os.path.exists(dest):
        base = Path(dest).stem
        ext = Path(dest).suffix
        dest = os.path.join(PROCESSED_DIR, f"{base}_{int(time.time())}{ext}")
    try:
        os.rename(image_path, dest)
    except Exception:
        pass  # Some OS/filesystem may not support rename across drives


def main():
    parser = argparse.ArgumentParser(description="DRIFT Drone Auto-Upload")
    parser.add_argument("--folder", "-f", default=DEFAULT_WATCH_FOLDER,
                        help=f"Folder to watch for images (default: {DEFAULT_WATCH_FOLDER})")
    parser.add_argument("--lat", type=float, default=None, help="Fixed latitude (if drone has no GPS)")
    parser.add_argument("--lon", type=float, default=None, help="Fixed longitude (if drone has no GPS)")
    parser.add_argument("--once", action="store_true", help="Upload once and exit (no watching)")
    parser.add_argument("--test", action="store_true", help="Test with a sample image")
    args = parser.parse_args()

    log("=" * 60)
    log("DRIFT Drone Auto-Upload v1.0")
    log("=" * 60)

    # Check backend
    if not check_backend_health():
        log("Cannot reach DRIFT backend. Check your internet connection.")
        sys.exit(1)

    # Create watch folder
    os.makedirs(args.folder, exist_ok=True)
    log(f"Watch folder: {args.folder}")
    log(f"Backend: {DRIFT_BACKEND}")
    if args.lat and args.lon:
        log(f"Fixed location: {args.lat}, {args.lon}")
    log("")

    # Quick test mode
    if args.test:
        # Create a simple test image
        test_path = os.path.join(args.folder, "_test_drift.jpg")
        if HAS_PIL:
            img = Image.new("RGB", (640, 480), (128, 128, 128))
            img.save(test_path, "JPEG")
        else:
            # Minimal JPEG
            import struct
            with open(test_path, "wb") as f:
                f.write(b"\xff\xd8\xff\xe0" + b"\x00" * 100 + b"\xff\xd9")
        result = upload_image(test_path, args.lat, args.lon or 77.2325)
        os.remove(test_path)
        return

    # Upload mode: scan folder once
    if args.once:
        files = scan_folder(args.folder)
        if not files:
            log("No new images found.")
            return
        for f in files:
            result = upload_image(f, args.lat, args.lon)
            if result:
                UPLOADED_HASHES.add(compute_file_hash(f))
                move_to_processed(f)
            time.sleep(2)
        return

    # Watch mode: continuous polling
    log("Watching for new images... (Ctrl+C to stop)")
    log("Drop drone images into the folder and they'll be uploaded automatically.")
    log("")

    try:
        while True:
            files = scan_folder(args.folder)
            if files:
                log(f"Found {len(files)} new image(s)")
                for f in files:
                    file_hash = compute_file_hash(f)
                    if file_hash in UPLOADED_HASHES:
                        continue
                    result = upload_image(f, args.lat, args.lon)
                    if result:
                        UPLOADED_HASHES.add(file_hash)
                        move_to_processed(f)
                    time.sleep(2)
                log("")
            time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        log("\nStopped. Uploaded images are in _processed/ folder.")


if __name__ == "__main__":
    main()
