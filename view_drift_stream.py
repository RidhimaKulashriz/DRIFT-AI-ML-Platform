"""View the DJI Fly -> MediaMTX live stream on Windows.

Install:
    py -m pip install opencv-python

Run from PowerShell while MediaMTX is running:
    py view_drift_stream.py

If HLS does not open on your machine, try RTSP:
    py view_drift_stream.py --url rtsp://127.0.0.1:8554/drift

Press Q or Esc in the video window to quit.
"""

from __future__ import annotations

import argparse
import sys
import time

try:
    import cv2
except ImportError:
    print("OpenCV is not installed. Run: py -m pip install opencv-python")
    raise SystemExit(1)


DEFAULT_HLS_URL = "http://127.0.0.1:8888/drift/index.m3u8"
DEFAULT_RTSP_URL = "rtsp://127.0.0.1:8554/drift"


def open_stream(url: str):
    # CAP_FFMPEG gives OpenCV a better chance of opening HLS/RTSP on Windows.
    capture = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
    if not capture.isOpened():
        capture.release()
        capture = cv2.VideoCapture(url)
    return capture


def main() -> int:
    parser = argparse.ArgumentParser(description="View the DJI Fly MediaMTX live stream")
    parser.add_argument("--url", default=DEFAULT_HLS_URL, help="HLS or RTSP stream URL")
    args = parser.parse_args()

    print(f"Opening: {args.url}")
    print("Start DJI Fly RTMP streaming if the stream is not available yet.")
    print("Press Q or Esc in the video window to stop.")

    capture = open_stream(args.url)
    if not capture.isOpened():
        print("Could not open the stream.")
        print("Try these checks:")
        print("  1. MediaMTX is running in another PowerShell window.")
        print("  2. DJI Fly is actively streaming to rtmp://192.168.137.1:1935/drift.")
        print(f"  3. Try RTSP instead: py view_drift_stream.py --url {DEFAULT_RTSP_URL}")
        return 2

    window_name = "DRIFT - DJI Live Stream"
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window_name, 960, 540)

    frames = 0
    started = time.time()
    try:
        while True:
            ok, frame = capture.read()
            if not ok or frame is None:
                print("Stream ended or no frame received. Restart DJI Fly livestream and try again.")
                break

            frames += 1
            elapsed = max(time.time() - started, 0.001)
            fps = frames / elapsed
            cv2.putText(
                frame,
                f"DRIFT live | {fps:.1f} FPS | Q/Esc to quit",
                (18, 34),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (0, 255, 0),
                2,
                cv2.LINE_AA,
            )
            cv2.imshow(window_name, frame)

            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), ord("Q"), 27):
                break
    finally:
        capture.release()
        cv2.destroyAllWindows()

    return 0


if __name__ == "__main__":
    sys.exit(main())

# The RTSP URL is kept as a named constant for easy copy/paste in Windows.
_ = DEFAULT_RTSP_URL
