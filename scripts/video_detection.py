#!/usr/bin/env python3
"""
Video Detection Script for DRIFT Platform

This script:
1. Reads a video file from local disk
2. Extracts frames at regular intervals
3. Sends each frame to DRIFT backend for ML detection
4. Displays results and stores them in the database

Usage:
    python scripts/video_detection.py <video_file_path> [options]

Options:
    --interval SECONDS    Frame extraction interval (default: 5)
    --max-frames N        Maximum frames to extract (default: 20)
    --backend URL        DRIFT backend URL (default: http://localhost:3000)
    --campus ID          Campus ID for GPS coordinates (default: 1 for IGDTUW)
"""

import sys
import os
import base64
import argparse
import json
import requests
from pathlib import Path
from typing import List, Dict, Any

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import cv2
    OPENCV_AVAILABLE = True
except ImportError:
    OPENCV_AVAILABLE = False
    print("Warning: OpenCV not available. Using basic frame extraction.")

class VideoDetector:
    def __init__(self, backend_url: str, campus_id: int = 1):
        self.backend_url = backend_url.rstrip('/')
        self.campus_id = campus_id
        self.session = requests.Session()
        
    def extract_frames_basic(self, video_path: str, interval_seconds: int = 5, max_frames: int = 20) -> List[Dict[str, Any]]:
        """Basic frame extraction without OpenCV - requires ffmpeg"""
        print(f"Extracting frames from {video_path}...")
        
        if not OPENCV_AVAILABLE:
            print("Error: OpenCV not available. Please install: pip install opencv-python")
            return []
        
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            print(f"Error: Cannot open video file {video_path}")
            return []
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps if fps > 0 else 0
        
        print(f"Video info: {total_frames} frames, {fps:.2f} FPS, {duration:.2f} seconds")
        
        frames = []
        frame_interval = int(fps * interval_seconds) if fps > 0 else 30
        
        frame_count = 0
        extracted_count = 0
        
        while cap.isOpened() and extracted_count < max_frames:
            ret, frame = cap.read()
            if not ret:
                break
            
            if frame_count % frame_interval == 0:
                # Convert frame to JPEG and encode as base64
                _, buffer = cv2.imencode('.jpg', frame)
                frame_base64 = base64.b64encode(buffer).decode('utf-8')
                
                timestamp = frame_count / fps if fps > 0 else frame_count * interval_seconds
                
                frames.append({
                    'index': extracted_count,
                    'timestamp': timestamp,
                    'base64': f"data:image/jpeg;base64,{frame_base64}",
                    'mimeType': 'image/jpeg'
                })
                
                extracted_count += 1
                print(f"Extracted frame {extracted_count}/{max_frames} at {timestamp:.2f}s")
            
            frame_count += 1
        
        cap.release()
        print(f"Extracted {len(frames)} frames total")
        return frames
    
    def send_frame_for_detection(self, frame: Dict[str, Any]) -> Dict[str, Any]:
        """Send a single frame to DRIFT backend for ML detection"""
        url = f"{self.backend_url}/api/inspections"
        
        payload = {
            "fileName": f"frame_{frame['index']:04d}.jpg",
            "mimeType": "image/jpeg",
            "base64": frame['base64'],
            "campusId": self.campus_id,
            "inspectionName": f"Video Frame Detection - Frame {frame['index']}",
            "explicitLatitude": None,
            "explicitLongitude": None,
            "locationSource": "verified_campus",
            "assetCriticality": 0.8,
            "inspectionDomain": "road",
            "sendEmail": False,
            "recipientEmail": None
        }
        
        try:
            response = self.session.post(url, json=payload, timeout=60)
            response.raise_for_status()
            result = response.json()
            
            return {
                'success': True,
                'frame_index': frame['index'],
                'timestamp': frame['timestamp'],
                'detection': result.get('mlUsed'),
                'inspection_id': result.get('inspectionId'),
                'evidence_id': result.get('evidenceId'),
                'detection_id': result.get('detectionId'),
                'report_id': result.get('reportId'),
            }
        except requests.exceptions.RequestException as e:
            return {
                'success': False,
                'frame_index': frame['index'],
                'timestamp': frame['timestamp'],
                'error': str(e)
            }
    
    def process_video(self, video_path: str, interval_seconds: int = 5, max_frames: int = 20) -> Dict[str, Any]:
        """Process entire video: extract frames and detect defects"""
        print(f"\n{'='*60}")
        print(f"VIDEO DETECTION - DRIFT PLATFORM")
        print(f"{'='*60}")
        print(f"Video: {video_path}")
        print(f"Backend: {self.backend_url}")
        print(f"Campus ID: {self.campus_id}")
        print(f"Frame interval: {interval_seconds}s")
        print(f"Max frames: {max_frames}")
        print(f"{'='*60}\n")
        
        # Extract frames
        frames = self.extract_frames_basic(video_path, interval_seconds, max_frames)
        
        if not frames:
            return {
                'success': False,
                'error': 'No frames extracted from video',
                'results': []
            }
        
        # Process each frame
        results = []
        detections_found = 0
        
        for i, frame in enumerate(frames, 1):
            print(f"\nProcessing frame {i}/{len(frames)}...")
            result = self.send_frame_for_detection(frame)
            results.append(result)
            
            if result.get('success') and result.get('detection'):
                detection = result['detection']
                if detection.get('defectType') and detection.get('defectType') != 'none':
                    detections_found += 1
                    print(f"✓ DEFECT FOUND: {detection.get('defectType')} (confidence: {detection.get('confidence', 0)*100:.1f}%)")
                else:
                    print(f"✓ No defect detected")
            else:
                print(f"✗ Detection failed: {result.get('error', 'Unknown error')}")
        
        # Summary
        print(f"\n{'='*60}")
        print(f"DETECTION SUMMARY")
        print(f"{'='*60}")
        print(f"Total frames processed: {len(frames)}")
        print(f"Frames with defects: {detections_found}")
        print(f"Success rate: {sum(1 for r in results if r.get('success'))}/{len(results)}")
        
        if detections_found > 0:
            print(f"\n🎯 DEFECTS DETECTED:")
            for result in results:
                if result.get('success') and result.get('detection'):
                    detection = result['detection']
                    if detection.get('defectType') and detection.get('defectType') != 'none':
                        print(f"  - Frame {result['frame_index']} ({result['timestamp']:.1f}s): {detection.get('defectType')} ({detection.get('confidence', 0)*100:.1f}%, {detection.get('severity', 'unknown')})")
        
        return {
            'success': True,
            'total_frames': len(frames),
            'detections_found': detections_found,
            'results': results
        }

def main():
    parser = argparse.ArgumentParser(description='Video Detection for DRIFT Platform')
    parser.add_argument('video_path', help='Path to video file')
    parser.add_argument('--interval', type=int, default=5, help='Frame extraction interval in seconds')
    parser.add_argument('--max-frames', type=int, default=20, help='Maximum frames to extract')
    parser.add_argument('--backend', type=str, default='https://drift-node-api.onrender.com', help='DRIFT backend URL')
    parser.add_argument('--campus', type=int, default=1, help='Campus ID (1=IGDTUW, 2=IIIT-Delhi)')
    
    args = parser.parse_args()
    
    # Validate video file exists
    video_path = Path(args.video_path)
    if not video_path.exists():
        print(f"Error: Video file not found: {args.video_path}")
        sys.exit(1)
    
    # Create detector and process video
    detector = VideoDetector(args.backend, args.campus)
    result = detector.process_video(
        str(video_path),
        interval_seconds=args.interval,
        max_frames=args.max_frames
    )
    
    # Exit with appropriate code
    sys.exit(0 if result.get('success') else 1)

if __name__ == '__main__':
    main()
