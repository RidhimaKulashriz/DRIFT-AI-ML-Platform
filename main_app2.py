"""DRIFT live DJI stream + local model inference viewer.

Place this file beside visual.py in C:\\ml models.
The existing visual.py supplies the local CRACK/ROAD models, optional Roboflow
models, model loading, multi-model inference, and annotation functions.

Install once in PowerShell:
    python -m pip install opencv-python torch ultralytics inference-sdk

Run while MediaMTX and DJI Fly are streaming:
    python main_app2.py

Run with Render backend ML + database persistence:
    python main_app2.py --backend https://drift-node-api.onrender.com \\
        --token YOUR_DRIFT_INGEST_TOKEN --mission-id 123 \\
        --latitude 28.6647 --longitude 77.2325

Run with a browser-visible annotated stream through MediaMTX:
    python main_app2.py --annotated-rtmp rtmp://127.0.0.1:1935/drift-annotated

Set the frontend VITE_DRIFT_LIVE_STREAM_URL to:
    http://127.0.0.1:8888/drift-annotated/index.m3u8

Each sampled frame is sent as authenticated photo evidence. Render stores it,
executes its configured ML_INFERENCE_URL, persists the resulting defect, and
the frontend overview/map polling can display the new GPS-linked finding.

Optional Roboflow models:
    $env:ROBOFLOW_API_KEY = "YOUR_KEY"
    python main_app2.py --roboflow

Press Q or Esc to stop.
"""

from __future__ import annotations

import argparse
import base64
import os
import shutil
import subprocess
import sys
import time
from types import SimpleNamespace

import cv2
import requests

# visual.py is the user's supplied integrated model application. Some local
# copies contain the model functions but not the optional annotation helper.
try:
    import visual_full as visual
    print("[DRIFT] Using visual_full.py integrated model pipeline")
except ImportError:
    import visual
    print("[DRIFT] Using visual.py model pipeline")

if not hasattr(visual, "load_local_models") or not hasattr(visual, "run_all_models"):
    raise ImportError("The selected model file must define load_local_models and run_all_models. Pull visual_full.py from the repository.")

load_local_models = visual.load_local_models
run_all_models = visual.run_all_models
create_roboflow_client = getattr(visual, "create_roboflow_client", None)


def annotate_frame(frame, detections, frame_number=None):
    """Use visual.py's annotator when present, otherwise draw basic boxes."""
    supplied = getattr(visual, "annotate_frame", None)
    if supplied is not None:
        return supplied(frame, detections, frame_number=frame_number)

    output = frame.copy()
    colors = {"CRACK": (0, 0, 255), "ROAD": (255, 0, 0), "RAILWAY": (0, 255, 255), "RUST": (0, 255, 0)}
    for detection in detections or []:
        bbox = detection.get("bbox", [0, 0, 0, 0])
        x1, y1, x2, y2 = [max(0, int(value)) for value in bbox]
        model = str(detection.get("model", "MODEL"))
        label = str(detection.get("label", "detection"))
        confidence = float(detection.get("confidence", 0.0))
        color = colors.get(model, (255, 255, 255))
        cv2.rectangle(output, (x1, y1), (x2, y2), color, 2)
        cv2.putText(output, f"{model} | {label} | {confidence:.2f}", (x1, max(20, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2, cv2.LINE_AA)
    cv2.putText(output, f"DRIFT LIVE | {len(detections or [])} detections", (18, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 0), 2, cv2.LINE_AA)
    return output


DEFAULT_SOURCE = "rtsp://127.0.0.1:8554/drift"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="View and infer on DJI Fly -> MediaMTX live video")
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="RTSP/HLS URL or camera index")
    parser.add_argument("--every-nth-frame", type=int, default=5, help="Run inference every N frames")
    parser.add_argument("--backend", default=os.getenv("DRIFT_BASE_URL", ""), help="Render backend URL; enables backend ML upload")
    parser.add_argument("--token", default=os.getenv("DRIFT_INGEST_TOKEN", ""), help="DRIFT ingest token")
    parser.add_argument("--mission-id", type=int, default=int(os.getenv("DRIFT_MISSION_ID", "0")), help="Existing hardware mission ID")
    parser.add_argument("--latitude", type=float, help="Trusted current drone latitude for frame metadata")
    parser.add_argument("--longitude", type=float, help="Trusted current drone longitude for frame metadata")
    parser.add_argument("--asset-id", type=int, default=1)
    parser.add_argument("--asset-criticality", type=int, default=3)
    parser.add_argument("--upload-every", type=int, default=1, help="Upload every Nth inference frame to Render")
    parser.add_argument("--imgsz", type=int, choices=(640, 1280), default=640)
    parser.add_argument("--conf", type=float, default=0.30)
    parser.add_argument("--iou", type=float, default=0.45)
    parser.add_argument("--device", default="auto", help="auto, cpu, 0, etc.")
    parser.add_argument("--roboflow", action="store_true", help="Enable Railway and Rust Roboflow models")
    parser.add_argument("--road-tiling", action="store_true")
    parser.add_argument("--road-tile-size", type=int, default=640)
    parser.add_argument("--road-overlap", type=float, default=0.20)
    parser.add_argument("--no-display", action="store_true")
    parser.add_argument("--annotated-rtmp", default=os.getenv("DRIFT_ANNOTATED_RTMP_URL", ""), help="Optional RTMP publish URL for browser-visible annotated frames")
    return parser.parse_args()


def build_model_args(args: argparse.Namespace) -> SimpleNamespace:
    # These names match the arguments expected by functions in visual.py.
    return SimpleNamespace(
        imgsz=args.imgsz,
        conf=max(0.25, args.conf),
        iou=args.iou,
        device=args.device,
        road_tiling=args.road_tiling,
        road_tile_size=args.road_tile_size,
        road_overlap=args.road_overlap,
        disable_crack=False,
        disable_road=False,
        disable_railway=not args.roboflow,
        disable_rust=not args.roboflow,
        roboflow_retries=3,
    )


def upload_frame(args: argparse.Namespace, frame, frame_number: int) -> dict | None:
    if not args.backend:
        return None
    if not args.token or args.mission_id <= 0:
        raise ValueError("Backend upload requires --token and a positive --mission-id")
    if args.latitude is None or args.longitude is None:
        raise ValueError("Backend upload requires trusted --latitude and --longitude")

    ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    if not ok:
        raise RuntimeError("Could not encode live frame as JPEG")
    encoded_b64 = base64.b64encode(encoded.tobytes()).decode("ascii")
    payload = {
        "missionId": args.mission_id,
        "fileName": f"dji-live-frame-{frame_number:08d}.jpg",
        "mimeType": "image/jpeg",
        "base64": f"data:image/jpeg;base64,{encoded_b64}",
        "mediaKind": "photo",
        "latitude": args.latitude,
        "longitude": args.longitude,
        "cameraId": "DJI Mini 3 Pro",
        "captureZone": "aerial-live-stream",
        "inspectionDomain": "roads",
        "aircraftProfile": "DJI Mini 3 Pro + DJI RC-N1",
        "assetId": args.asset_id,
        "assetCriticality": args.asset_criticality,
        "priorOpenDefects": 0,
        "runInference": True,
        "correlationKey": f"dji-live:{args.mission_id}:{frame_number}",
    }
    response = requests.post(
        f"{args.backend.rstrip('/')}/api/drift/evidence",
        headers={"Authorization": f"Bearer {args.token}"},
        json=payload,
        timeout=120,
    )
    response.raise_for_status()
    return response.json()


def start_annotated_publisher(url: str, width: int, height: int, fps: float = 20.0):
    if not url:
        return None
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("--annotated-rtmp requires ffmpeg in PATH")
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "warning", "-f", "rawvideo",
        "-pix_fmt", "bgr24", "-s", f"{width}x{height}", "-r", f"{fps:.2f}", "-i", "-",
        "-an", "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
        "-pix_fmt", "yuv420p", "-f", "flv", url,
    ]
    print(f"[DRIFT] Publishing annotated browser stream to {url}")
    return subprocess.Popen(command, stdin=subprocess.PIPE)


def write_annotated_frame(publisher, frame):
    if publisher is None or publisher.stdin is None:
        return publisher
    try:
        publisher.stdin.write(frame.tobytes())
        return publisher
    except (BrokenPipeError, OSError):
        print("[WARN] Annotated browser stream publisher stopped")
        try:
            publisher.kill()
        except OSError:
            pass
        return None


def stop_annotated_publisher(publisher):
    if publisher is None:
        return
    try:
        if publisher.stdin:
            publisher.stdin.close()
        publisher.wait(timeout=3)
    except (BrokenPipeError, OSError, subprocess.TimeoutExpired):
        try:
            publisher.kill()
        except OSError:
            pass


def open_capture(source: str):
    try:
        source_value = int(source)
    except ValueError:
        source_value = source

    capture = cv2.VideoCapture(source_value, cv2.CAP_FFMPEG)
    if not capture.isOpened():
        capture.release()
        capture = cv2.VideoCapture(source_value)
    return capture


def main() -> int:
    args = parse_args()
    if args.every_nth_frame < 1 or args.upload_every < 1:
        raise SystemExit("--every-nth-frame and --upload-every must be at least 1")
    if args.backend and (not args.token or args.mission_id <= 0):
        raise SystemExit("Backend mode requires --token and a positive --mission-id")
    if args.backend and (args.latitude is None or args.longitude is None):
        raise SystemExit("Backend mode requires trusted --latitude and --longitude")
    if args.backend:
        print(f"[DRIFT] Backend upload enabled: {args.backend.rstrip('/')}/api/drift/evidence")
        print("[DRIFT] Render will run ML and persist each uploaded frame as hardware evidence.")

    model_args = build_model_args(args)
    print("[DRIFT] Loading local models from C:\\ml models ...")
    try:
        local_models = load_local_models(model_args)
    except Exception as exc:
        print(f"[ERROR] Could not load local models: {exc}")
        print("Check that these files exist:")
        print(r"  C:\ml models\cracks\main_crack.pt")
        print(r"  C:\ml models\road-ml\main_road.pt")
        return 2

    roboflow_client = None
    if args.roboflow:
        try:
            if create_roboflow_client is None:
                raise RuntimeError("This visual.py does not provide create_roboflow_client")
            roboflow_client = create_roboflow_client()
            print("[DRIFT] Roboflow Railway/Rust models enabled")
        except Exception as exc:
            print(f"[WARN] Roboflow disabled: {exc}")
            model_args.disable_railway = True
            model_args.disable_rust = True

    print(f"[DRIFT] Opening live source: {args.source}")
    print("[DRIFT] Start DJI Fly RTMP and publish to rtmp://192.168.137.1:1935/drift")
    capture = open_capture(args.source)
    if not capture.isOpened():
        print("[ERROR] Could not open the live stream.")
        print("Confirm MediaMTX shows: [path drift] stream is available and online")
        print("Try: python main_app2.py --source http://127.0.0.1:8888/drift/index.m3u8")
        return 3

    window = "DRIFT Live Inference"
    annotated_publisher = None
    if args.annotated_rtmp:
        try:
            width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
            height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)
            annotated_publisher = start_annotated_publisher(args.annotated_rtmp, width, height)
        except Exception as exc:
            print(f"[WARN] Annotated browser stream disabled: {exc}")
    if not args.no_display:
        cv2.namedWindow(window, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(window, 1280, 720)

    frame_number = 0
    inference_count = 0
    latest_detections = []
    started = time.time()

    try:
        while True:
            ok, frame = capture.read()
            if not ok or frame is None:
                print("[WARN] No frame received. Restart DJI Fly livestream and try again.")
                break

            frame_number += 1
            if frame_number == 1 or frame_number % args.every_nth_frame == 0:
                try:
                    result = run_all_models(
                        frame=frame,
                        local_models=local_models,
                        roboflow_client=roboflow_client,
                        args=model_args,
                        frame_number=frame_number,
                    )
                    latest_detections = result.get("detections", [])
                    inference_count += 1
                    labels = [f"{item.get('model')}:{item.get('label')}" for item in latest_detections]
                    print(f"[FRAME {frame_number}] {len(latest_detections)} local detections: {', '.join(labels) or 'none'}")
                except Exception as exc:
                    print(f"[WARN] Local inference failed on frame {frame_number}: {exc}")

                if args.backend and inference_count % args.upload_every == 0:
                    try:
                        backend_result = upload_frame(args, frame, frame_number)
                        backend_inference = (backend_result or {}).get("inference")
                        backend_label = (backend_inference or {}).get("label") or (backend_inference or {}).get("defectType") or "none"
                        print(f"[FRAME {frame_number}] uploaded to Render; backend ML result: {backend_label}")
                    except Exception as exc:
                        print(f"[WARN] Render upload failed on frame {frame_number}: {exc}")

            annotated = annotate_frame(frame, latest_detections, frame_number=frame_number)
            elapsed = max(time.time() - started, 0.001)
            fps = frame_number / elapsed
            cv2.putText(
                annotated,
                f"LIVE | FPS {fps:.1f} | INFERENCES {inference_count} | Q/Esc quit",
                (18, max(160, annotated.shape[0] - 20)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                (0, 255, 0),
                2,
                cv2.LINE_AA,
            )

            annotated_publisher = write_annotated_frame(annotated_publisher, annotated)

            if not args.no_display:
                cv2.imshow(window, annotated)
                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), ord("Q"), 27):
                    break
    finally:
        stop_annotated_publisher(annotated_publisher)
        capture.release()
        if not args.no_display:
            cv2.destroyAllWindows()

    return 0


if __name__ == "__main__":
    sys.exit(main())
