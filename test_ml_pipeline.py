"""
End-to-end test: DRIFT backend → Hitakshi's ML server → detection → DB
"""
import json
import base64
import urllib.request
import urllib.error
import time
import sys

DRIFT_API = "https://drift-node-api.onrender.com"
ML_API = "https://drift-ml.onrender.com"

def test_health():
    """Check both services are alive."""
    print("=== HEALTH CHECK ===")
    
    # ML server
    try:
        req = urllib.request.Request(f"{ML_API}/health")
        resp = urllib.request.urlopen(req, timeout=30)
        ml_health = json.loads(resp.read())
        print(f"ML Server: {ml_health}")
    except Exception as e:
        print(f"ML Server: FAILED - {e}")
        return False
    
    # DRIFT backend
    try:
        req = urllib.request.Request(f"{DRIFT_API}/health")
        resp = urllib.request.urlopen(req, timeout=30)
        drift_health = json.loads(resp.read())
        print(f"DRIFT Backend: {drift_health}")
    except Exception as e:
        print(f"DRIFT Backend: FAILED - {e}")
        return False
    
    return True

def test_ml_server_directly():
    """Test Hitakshi's ML server with a real image."""
    print("\n=== ML SERVER DIRECT TEST ===")
    
    # Download a real crack image
    url = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Pothole_on_the_road.jpg/320px-Pothole_on_the_road.jpg"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        resp = urllib.request.urlopen(req, timeout=30)
        img_bytes = resp.read()
        img_b64 = base64.b64encode(img_bytes).decode("utf-8")
        print(f"Downloaded test image: {len(img_bytes)} bytes")
    except Exception as e:
        print(f"Failed to download test image: {e}")
        return None
    
    # Send to ML server
    payload = json.dumps({"imageBase64": img_b64, "confidence": 0.15}).encode()
    req = urllib.request.Request(
        f"{ML_API}/detect-base64",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    try:
        resp = urllib.request.urlopen(req, timeout=120)
        result = json.loads(resp.read())
        print(f"ML Result: {json.dumps(result, indent=2)}")
        return result
    except Exception as e:
        print(f"ML Server FAILED: {e}")
        return None

def test_drift_inspection_api():
    """Test the full DRIFT inspection pipeline with a real image."""
    print("\n=== DRIFT INSPECTION API TEST ===")
    
    # Download a real crack image
    url = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Pothole_on_the_road.jpg/320px-Pothole_on_the_road.jpg"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        resp = urllib.request.urlopen(req, timeout=30)
        img_bytes = resp.read()
        img_b64 = base64.b64encode(img_bytes).decode("utf-8")
        print(f"Test image: {len(img_bytes)} bytes")
    except Exception as e:
        print(f"Failed to download test image: {e}")
        return None
    
    # Test via DRIFT inspection endpoint
    payload = json.dumps({
        "imageBase64": f"data:image/jpeg;base64,{img_b64}",
        "infrastructureType": "road",
        "latitude": 28.6880,  # IGDTUW
        "longitude": 77.2105,
        "locationSource": "device_gps",
        "title": "Test road crack detection - IGDTUW",
        "narrative": "Testing full pipeline with real YOLO models"
    }).encode()
    
    req = urllib.request.Request(
        f"{DRIFT_API}/api/inspections",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    try:
        resp = urllib.request.urlopen(req, timeout=120)
        result = json.loads(resp.read())
        
        print(f"\n{'='*60}")
        print(f"FULL PIPELINE RESULT:")
        print(f"{'='*60}")
        
        inspection = result.get("inspection", {})
        evidence = result.get("evidence", {})
        detection = result.get("detection", {})
        report = result.get("report", {})
        
        print(f"Inspection ID: {inspection.get('id')}")
        print(f"Evidence ID: {evidence.get('id')}")
        print(f"Detection ID: {detection.get('id')}")
        
        print(f"\nML Model: {detection.get('mlModel')}")
        print(f"ML Source: {detection.get('mlSource')}")
        print(f"Defect Type: {detection.get('defectType')}")
        print(f"Confidence: {detection.get('confidence')}")
        print(f"Severity: {detection.get('severity')}")
        print(f"Bounding Box: {detection.get('boundingBox')}")
        
        if report:
            print(f"\nReport ID: {report.get('id')}")
            print(f"Report PDF: {report.get('pdfSizeBytes', 'N/A')} bytes")
        
        print(f"\n{'='*60}")
        
        # Check if it's a real detection or a fallback
        ml_source = detection.get("mlSource", "")
        if ml_source == "hitakshi-ml":
            print("✅ REAL ML DETECTION (Hitakshi's YOLO models)")
        elif ml_source == "gemini":
            print("✅ REAL ML DETECTION (Gemini 2.5 Flash)")
        elif ml_source == "no-ml-configured":
            print("❌ NO ML CONFIGURED - no detection ran")
        else:
            print(f"⚠️  ML Source: {ml_source}")
        
        defect = detection.get("defectType")
        if defect and defect != "unknown" and ml_source != "no-ml-configured":
            print(f"✅ REAL DEFECT DETECTED: {defect}")
            print(f"   Confidence: {detection.get('confidence')}")
            print(f"   Severity: {detection.get('severity')}")
        else:
            print("❌ No real defect detected")
        
        return result
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        print(f"DRIFT API FAILED: HTTP {e.code}")
        print(f"Response: {body[:500]}")
        return None
    except Exception as e:
        print(f"DRIFT API FAILED: {e}")
        return None

if __name__ == "__main__":
    print("DRIFT ML Pipeline End-to-End Test")
    print("=" * 60)
    
    # 1. Health check
    if not test_health():
        print("\n❌ Services not healthy. Stopping.")
        sys.exit(1)
    
    # 2. Direct ML server test
    ml_result = test_ml_server_directly()
    if ml_result and ml_result.get("count", 0) > 0:
        print(f"\n✅ ML server detected {ml_result['count']} defect(s)")
    else:
        print(f"\n⚠️  ML server returned no detections (might be normal for this image)")
    
    # 3. Full DRIFT pipeline test
    result = test_drift_inspection_api()
    
    print("\n" + "=" * 60)
    print("TEST COMPLETE")
    print("=" * 60)
