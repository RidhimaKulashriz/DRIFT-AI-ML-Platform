#!/usr/bin/env python3
"""
Simple video upload test for DRIFT platform
This script sends a video file to the DRIFT backend for ML detection
"""

import sys
import base64
import requests
import json
from pathlib import Path

def test_video_upload(video_path: str, backend_url: str = "https://drift-node-api.onrender.com"):
    """Test video upload to DRIFT backend"""
    
    # Read video file
    video_file = Path(video_path)
    if not video_file.exists():
        print(f"Error: Video file not found: {video_path}")
        return False
    
    print(f"Reading video file: {video_path}")
    with open(video_file, "rb") as f:
        video_data = f.read()
    
    # Encode as base64
    video_base64 = base64.b64encode(video_data).decode('utf-8')
    
    # Determine MIME type
    mime_type = "video/mp4" if str(video_path).lower().endswith('.mp4') else "video/quicktime"
    
    print(f"Video size: {len(video_data) / (1024*1024):.2f} MB")
    print(f"Sending to backend: {backend_url}")
    
    # Send to DRIFT backend
    url = f"{backend_url}/api/inspections"
    
    payload = {
        "fileName": video_file.name,
        "mimeType": mime_type,
        "base64": f"data:{mime_type};base64,{video_base64}",
        "campusId": 1,  # IGDTUW
        "inspectionName": f"Video Test - {video_file.name}",
        "explicitLatitude": None,
        "explicitLongitude": None,
        "locationSource": "verified_campus",
        "assetCriticality": 0.8,
        "inspectionDomain": "road",
        "sendEmail": False,
        "recipientEmail": None
    }
    
    try:
        print("Sending request...")
        response = requests.post(url, json=payload, timeout=120)
        
        print(f"Response status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("\nSUCCESS!")
            print(f"Inspection ID: {result.get('inspectionId')}")
            print(f"Evidence ID: {result.get('evidenceId')}")
            print(f"Detection ID: {result.get('detectionId')}")
            print(f"Report ID: {result.get('reportId')}")
            print(f"PDF Size: {result.get('pdfSizeBytes', 0) / 1024:.2f} KB")
            print(f"PDF Pages: {result.get('pdfPages', 0)}")
            
            if result.get('mlUsed'):
                ml = result['mlUsed']
                print(f"\nML Detection:")
                print(f"  Source: {ml.get('source')}")
                print(f"  Model: {ml.get('model')}")
                print(f"  Defect: {ml.get('defectType')}")
                print(f"  Confidence: {ml.get('confidence', 0) * 100:.1f}%")
                print(f"  Severity: {ml.get('severity')}")
            
            if result.get('videoFrames'):
                print(f"\nVideo Frames Extracted: {len(result['videoFrames'])}")
                if result.get('frameDetections'):
                    print(f"Frames with Defects: {len([f for f in result['frameDetections'] if f['detection'].get('defectType')])}")
                    for fd in result['frameDetections']:
                        if fd['detection'].get('defectType'):
                            print(f"  Frame {fd['frameIndex']}: {fd['detection']['defectType']} ({fd['detection']['confidence']*100:.1f}%)")
            
            return True
        else:
            print(f"\nFAILED")
            print(f"Error: {response.text}")
            return False
            
    except requests.exceptions.Timeout:
        print("\nTIMEOUT - Request took too long")
        return False
    except Exception as e:
        print(f"\nERROR: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_video_upload.py <video_file_path> [backend_url]")
        sys.exit(1)
    
    video_path = sys.argv[1]
    backend_url = sys.argv[2] if len(sys.argv) > 2 else "https://drift-node-api.onrender.com"
    
    success = test_video_upload(video_path, backend_url)
    sys.exit(0 if success else 1)
