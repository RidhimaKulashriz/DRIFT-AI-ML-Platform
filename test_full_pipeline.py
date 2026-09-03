"""DRIFT Full Pipeline Test - Real ML Detection"""
import json, urllib.request, base64, sys
from PIL import Image, ImageDraw, ImageFont
import io, os

DRIFT = "https://drift-node-api.onrender.com"
ML = "https://drift-ml.onrender.com"

def make_crack_image(label="ROAD CRACK TEST"):
    img = Image.new("RGB", (800, 600), (180, 175, 170))
    draw = ImageDraw.Draw(img)
    # Draw realistic crack lines
    for i in range(5):
        x0, y0 = 100 + i*30, 80 + i*15
        x1, y1 = x0 + 200, y0 + 300
        draw.line([(x0, y0), (x0+50, y0+100), (x0+100, y0+200), (x1, y1)], fill=(40, 35, 30), width=2+i)
    # Draw some texture dots
    for x in range(0, 800, 20):
        for y in range(0, 600, 20):
            draw.point((x+10, y+10), fill=(175+x%20, 170+y%20, 165))
    draw.text((20, 10), label, fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()

print("="*60)
print("DRIFT FULL PIPELINE TEST")
print("="*60)

# Step 1: Create real crack image
img_bytes = make_crack_image("IGDTUW ROAD CRACK - TEST")
img_b64 = base64.b64encode(img_bytes).decode()
print(f"\n[1] Image created: {len(img_bytes)} bytes")

# Step 2: Test ML server directly
print(f"\n[2] Testing ML server at {ML}...")
ml_payload = json.dumps({"imageBase64": img_b64, "confidence": 0.1}).encode()
ml_req = urllib.request.Request(f"{ML}/detect-base64", data=ml_payload, headers={"Content-Type": "application/json"}, method="POST")
try:
    ml_resp = urllib.request.urlopen(ml_req, timeout=120)
    ml_result = json.loads(ml_resp.read())
    print(f"    ML Server: success={ml_result.get('success')}, model={ml_result.get('model')}, detections={ml_result.get('count', 0)}")
    for d in ml_result.get("detections", []):
        print(f"    -> {d['label']} conf={d['confidence']} sev={d['severity']} bbox={d.get('boundingBox',{})}")
except Exception as e:
    print(f"    ML Server: FAILED ({e}) - will fall back to Gemini")

# Step 3: Test DRIFT inspection (IGDTUW)
print(f"\n[3] Testing DRIFT inspection API (IGDTUW)...")
payload = json.dumps({
    "fileName": "igdtuw_road_surface_test.jpg",
    "mimeType": "image/jpeg",
    "base64": "data:image/jpeg;base64," + img_b64,
    "latitude": 28.6880,
    "longitude": 77.2105,
    "locationSource": "device_gps",
    "campusId": 1,
    "inspectionDomain": "roads",
    "assetCriticality": 4,
}).encode()
req = urllib.request.Request(f"{DRIFT}/api/inspections", data=payload, headers={"Content-Type": "application/json"}, method="POST")
try:
    resp = urllib.request.urlopen(req, timeout=180)
    result = json.loads(resp.read())
    if result.get("success"):
        d = result.get("detection", {})
        r = result.get("report", {})
        i = result.get("inspection", {})
        e = result.get("evidence", {})
        print(f"    Inspection ID: {i.get('id')}")
        print(f"    Evidence ID: {e.get('id')}")
        print(f"    Detection ID: {d.get('id')}")
        print(f"    ML Source: {d.get('mlSource')}")
        print(f"    ML Model: {d.get('mlModel')}")
        print(f"    Defect: {d.get('defectType')}")
        print(f"    Confidence: {d.get('confidence')}")
        print(f"    Severity: {d.get('severity')}")
        print(f"    BoundingBox: {d.get('boundingBox')}")
        print(f"    Latitude: {d.get('latitude')}")
        print(f"    Longitude: {d.get('longitude')}")
        if r:
            print(f"    Report ID: {r.get('id')}")
            print(f"    PDF Size: {r.get('pdfSizeBytes', 'N/A')} bytes")
            print(f"    PDF Pages: {r.get('pdfPages', 'N/A')}")
        ml_src = d.get("mlSource", "")
        if ml_src in ("hitakshi-ml", "gemini"):
            print(f"    [PASS] Real ML detection: {ml_src}")
        else:
            print(f"    [WARN] ML source: {ml_src}")
    else:
        print(f"    [FAIL] {result.get('error')}")
except urllib.error.HTTPError as e:
    body = e.read().decode() if e.fp else ""
    print(f"    [FAIL] HTTP {e.code}: {body[:300]}")
except Exception as e:
    print(f"    [FAIL] {e}")

# Step 4: Test IIIT-Delhi
print(f"\n[4] Testing DRIFT inspection API (IIIT-Delhi)...")
img_bytes2 = make_crack_image("IIIT-DELHI WALL CRACK - TEST")
img_b64_2 = base64.b64encode(img_bytes2).decode()
payload2 = json.dumps({
    "fileName": "iiitd_wall_crack_test.jpg",
    "mimeType": "image/jpeg",
    "base64": "data:image/jpeg;base64," + img_b64_2,
    "latitude": 28.5449,
    "longitude": 77.2750,
    "locationSource": "device_gps",
    "campusId": 2,
    "inspectionDomain": "bridges",
    "assetCriticality": 3,
}).encode()
req2 = urllib.request.Request(f"{DRIFT}/api/inspections", data=payload2, headers={"Content-Type": "application/json"}, method="POST")
try:
    resp2 = urllib.request.urlopen(req2, timeout=180)
    result2 = json.loads(resp2.read())
    if result2.get("success"):
        d2 = result2.get("detection", {})
        r2 = result2.get("report", {})
        print(f"    Inspection ID: {result2.get('inspection', {}).get('id')}")
        print(f"    Detection ID: {d2.get('id')}")
        print(f"    ML Source: {d2.get('mlSource')}")
        print(f"    ML Model: {d2.get('mlModel')}")
        print(f"    Defect: {d2.get('defectType')}")
        print(f"    Confidence: {d2.get('confidence')}")
        print(f"    Severity: {d2.get('severity')}")
        print(f"    BoundingBox: {d2.get('boundingBox')}")
        if r2:
            print(f"    Report ID: {r2.get('id')}")
            print(f"    PDF Size: {r2.get('pdfSizeBytes', 'N/A')} bytes")
        print(f"    [PASS] IIIT-Delhi inspection complete")
    else:
        print(f"    [FAIL] {result2.get('error')}")
except urllib.error.HTTPError as e:
    body = e.read().decode() if e.fp else ""
    print(f"    [FAIL] HTTP {e.code}: {body[:300]}")
except Exception as e:
    print(f"    [FAIL] {e}")

# Step 5: Verify overview endpoint
print(f"\n[5] Verifying overview endpoint (reports in DB)...")
try:
    req3 = urllib.request.Request(f"{DRIFT}/api/trpc/drift.overview?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%7D%7D%7D")
    resp3 = urllib.request.urlopen(req3, timeout=30)
    overview = json.loads(resp3.read())
    data = overview[0].get("result", {}).get("data", {}).get("json", {})
    reports = data.get("reports", [])
    defects = data.get("defects", [])
    print(f"    Total defects in DB: {len(defects)}")
    print(f"    Total reports in DB: {len(reports)}")
    for rpt in reports[:5]:
        print(f"    Report: id={rpt.get('id')} title={rpt.get('title','')[:60]} pdf={rpt.get('pdfSizeBytes','?')} bytes")
except Exception as e:
    print(f"    [WARN] Overview: {e}")

print("\n" + "="*60)
print("TEST COMPLETE")
print("="*60)
