"""
config.py — DRIFT Jetson-side configuration.

Reads all network/hardware addresses from .env (repo root).
Copy this file to the Jetson alongside main3.py.

Single source of truth: edit .env, never touch this file.
"""

import argparse
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the same directory as this file
load_dotenv(Path(__file__).resolve().parent / ".env")


def parse_args() -> argparse.Namespace:
    """Parse CLI args for main3.py.

    Network/hardware addresses default to .env values.
    Model/inference args stay hardcoded — only addresses are env-driven.
    """
    parser = argparse.ArgumentParser(
        description="DRIFT Jetson streaming client",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )

    # ── Network — read from .env, override via CLI ────────────────
    parser.add_argument(
        "--server",
        default=os.getenv("GCS_HOST", "172.18.239.242"),
        help="GCS backend IP (set GCS_HOST in .env to avoid passing this each time)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("GCS_PORT", "8000")),
        help="GCS backend port",
    )

    # ── Hardware — read from .env, override via CLI ───────────────
    parser.add_argument(
        "--serial",
        default=os.getenv("MAVLINK_SERIAL", "/dev/ttyTHS1"),
        help="Pixhawk MAVLink serial port",
    )

    # ── Inference — hardcoded defaults, CLI-overridable ───────────
    parser.add_argument(
        "--model",
        default="yolov8s-worldv2.pt",
        help="YOLO-World model checkpoint path",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=0.25,
        help="Detection confidence threshold",
    )
    parser.add_argument(
        "--iou",
        type=float,
        default=0.45,
        help="NMS IoU threshold",
    )

    # ── Mode flags — unchanged ────────────────────────────────────
    parser.add_argument(
        "--no-gps",
        action="store_true",
        help="Disable GPS / MAVLink (use dummy coordinates)",
    )
    parser.add_argument(
        "--no-world",
        action="store_true",
        help="Disable YOLO-World and send blank detections",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Log every frame to stdout",
    )

    args = parser.parse_args()

    # Build the WebSocket URI here so main3.py never hardcodes it
    # Backend endpoint confirmed: @app.websocket("/ws/drone")
    args.ws_uri = f"ws://{args.server}:{args.port}/ws/drone"

    return args


if __name__ == "__main__":
    # Quick sanity-print — run `python config.py` on the Jetson to verify .env loaded
    args = parse_args()
    print(f"GCS backend : {args.server}:{args.port}")
    print(f"WebSocket   : {args.ws_uri}")
    print(f"MAVLink     : {args.serial}")
    print(f"Model       : {args.model}  conf={args.conf}  iou={args.iou}")
    print(f"Flags       : no-gps={args.no_gps}  no-world={args.no_world}  verbose={args.verbose}")
