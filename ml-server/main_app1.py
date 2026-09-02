"""
======================================================================
DRIFT - INTEGRATED MULTI-MODEL DEFECT DETECTION
======================================================================

LOCAL MODELS
------------
1. CRACKS
   C:\\ml model\\cracks\\main_crack.pt

2. ROAD
   C:\\ml model\\road-ml\\main_road.pt

ROBOFLOW MODELS
---------------
3. RAILWAY
   railway-track-fault-detection-hrem8/3

4. RUST / CORROSION
   corrosion-yolov8/4

SUPPORTED INPUTS
----------------
- JPG
- JPEG
- PNG
- BMP
- WEBP
- TIFF
- MP4
- AVI
- MOV
- MKV
- WEBM
- M4V
- Webcam
- Network stream supported by OpenCV

OUTPUTS
-------
For image:

outputs/
└── image_name/
    ├── image_name_output.jpg
    ├── image_name.json
    └── image_name.csv

For video:

outputs/
└── video_name/
    ├── video_name_output.mp4
    ├── video_name.json
    └── video_name.csv

The JSON contains:
- model
- label
- class ID
- confidence
- bounding box
- pixel coordinates
- center
- width
- height
- frame number
- timestamp

The CSV contains one row per detection.

IMPORTANT
---------
The local ROAD model is run with the special CPU/tiled-compatible
pipeline from your original road application.

The local CRACK model is loaded using Ultralytics.

The Railway and Rust models are queried through Roboflow.

Models are intentionally executed sequentially in this version
because reliability/debuggability is more important right now.

======================================================================
"""

from __future__ import annotations

# ----------------------------------------------------------------------
# PyTorch compatibility for older Ultralytics checkpoints
# ----------------------------------------------------------------------
import os

# Required by the ROAD model you supplied.
# PyTorch 2.6+ changed torch.load defaults.
os.environ.setdefault(
    "TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD",
    "1",
)

import argparse
import csv
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import cv2
import torch
from ultralytics import YOLO

from inference_sdk import (
    InferenceHTTPClient,
    InferenceConfiguration,
)


# ======================================================================
# PROJECT PATHS
# ======================================================================

# You explicitly said the root is "ml model".
BASE_DIR = Path(
    r"C:\ml models"
)

CRACK_MODEL_PATH = (
    BASE_DIR
    / "cracks"
    / "main_crack.pt"
)

ROAD_MODEL_PATH = (
    BASE_DIR
    / "road-ml"
    / "main_road.pt"
)


# ======================================================================
# ROBOFLOW CONFIGURATION
# ======================================================================

ROBOFLOW_API_URL = (
    "https://serverless.roboflow.com"
)

RAILWAY_MODEL_ID = (
    "railway-track-fault-detection-hrem8/3"
)

RUST_MODEL_ID = (
    "corrosion-yolov8/4"
)


# ======================================================================
# VISUAL COLORS
# OpenCV uses BGR.
# ======================================================================

MODEL_COLORS = {

    "CRACK": (
        0,
        0,
        255,
    ),       # Red

    "ROAD": (
        255,
        0,
        0,
    ),       # Blue

    "RAILWAY": (
        0,
        255,
        255,
    ),       # Yellow

    "RUST": (
        0,
        255,
        0,
    ),       # Green
}


# ======================================================================
# EXTENSIONS
# ======================================================================

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".webp",
    ".tif",
    ".tiff",
}

VIDEO_EXTENSIONS = {
    ".mp4",
    ".avi",
    ".mov",
    ".mkv",
    ".webm",
    ".m4v",
}


# ======================================================================
# ARGUMENT PARSER
# ======================================================================

def parse_args() -> argparse.Namespace:

    parser = argparse.ArgumentParser(
        description=(
            "DRIFT integrated Crack + Road + Railway + Rust inference"
        )
    )

    parser.add_argument(
        "--source",
        required=True,
        help=(
            "Image, video, webcam index or stream URL"
        ),
    )

    parser.add_argument(
        "--imgsz",
        type=int,
        choices=[
            640,
            1280,
        ],
        default=640,
        help=(
            "Local YOLO inference size: 640 or 1280"
        ),
    )

    parser.add_argument(
        "--conf",
        type=float,
        default=0.30,
        help=(
            "Minimum confidence. Must be >= 0.25"
        ),
    )

    parser.add_argument(
        "--iou",
        type=float,
        default=0.45,
        help=(
            "IoU threshold for local duplicate removal"
        ),
    )

    parser.add_argument(
        "--device",
        default="auto",
        help=(
            "Local YOLO device: auto, 0, cpu, etc."
        ),
    )

    parser.add_argument(
        "--road-tiling",
        action="store_true",
        help=(
            "Use tiled inference for the road model"
        ),
    )

    parser.add_argument(
        "--road-tile-size",
        type=int,
        default=640,
        help=(
            "Road tile size. Default: 640"
        ),
    )

    parser.add_argument(
        "--road-overlap",
        type=float,
        default=0.20,
        help=(
            "Road tile overlap. Default: 0.20"
        ),
    )

    parser.add_argument(
        "--every-nth-frame",
        type=int,
        default=1,
        help=(
            "Video/live: run full multi-model inference "
            "every Nth frame."
        ),
    )

    parser.add_argument(
        "--display",
        action="store_true",
        help=(
            "Show the annotated video/live window."
        ),
    )

    parser.add_argument(
        "--no-save-video",
        action="store_true",
        help=(
            "Do not save annotated video."
        ),
    )

    parser.add_argument(
        "--output-dir",
        default="outputs",
        help=(
            "Root output directory. Default: outputs"
        ),
    )

    parser.add_argument(
        "--disable-crack",
        action="store_true",
        help="Disable crack model",
    )

    parser.add_argument(
        "--disable-road",
        action="store_true",
        help="Disable road model",
    )

    parser.add_argument(
        "--disable-railway",
        action="store_true",
        help="Disable railway Roboflow model",
    )

    parser.add_argument(
        "--disable-rust",
        action="store_true",
        help="Disable rust Roboflow model",
    )

    parser.add_argument(
        "--roboflow-retries",
        type=int,
        default=3,
        help=(
            "Roboflow retry attempts. Default: 3"
        ),
    )

    return parser.parse_args()


# ======================================================================
# DEVICE
# ======================================================================

def resolve_device(
    requested: str,
) -> str:

    if requested.lower() != "auto":

        return requested

    if torch.cuda.is_available():

        return "0"

    return "cpu"


# ======================================================================
# ROBOFLOW API KEY
# ======================================================================

def get_roboflow_api_key() -> str:

    api_key = os.getenv(
        "ROBOFLOW_API_KEY"
    )

    if not api_key:

        raise RuntimeError(
            "\n"
            "ROBOFLOW_API_KEY is not set.\n\n"
            "Run this in PowerShell:\n\n"
            '$env:ROBOFLOW_API_KEY="YOUR_ROBOFLOW_API_KEY"\n'
        )

    return api_key.strip()


# ======================================================================
# ROBOFLOW CLIENT
# ======================================================================

def create_roboflow_client():

    api_key = (
        get_roboflow_api_key()
    )

    return InferenceHTTPClient(
        api_url=ROBOFLOW_API_URL,
        api_key=api_key,
    ).configure(
        InferenceConfiguration(
            api_key_transport="header"
        )
    )


# ======================================================================
# LOAD LOCAL MODELS
# ======================================================================

def load_local_models(args):

    models = {}

    # --------------------------------------------------------------
    # CRACK
    # --------------------------------------------------------------

    if not args.disable_crack:

        if not CRACK_MODEL_PATH.exists():

            raise FileNotFoundError(
                "\nCRACK MODEL NOT FOUND:\n"
                f"{CRACK_MODEL_PATH}\n"
            )

        print()
        print(
            "[LOAD] CRACK model"
        )
        print(
            f"       {CRACK_MODEL_PATH}"
        )

        models["CRACK"] = YOLO(
            str(
                CRACK_MODEL_PATH
            )
        )

        print(
            "[OK] Crack model loaded"
        )

        print(
            f"     Classes: "
            f"{models['CRACK'].names}"
        )

    # --------------------------------------------------------------
    # ROAD
    # --------------------------------------------------------------

    if not args.disable_road:

        if not ROAD_MODEL_PATH.exists():

            raise FileNotFoundError(
                "\nROAD MODEL NOT FOUND:\n"
                f"{ROAD_MODEL_PATH}\n"
            )

        print()
        print(
            "[LOAD] ROAD model"
        )
        print(
            f"       {ROAD_MODEL_PATH}"
        )

        models["ROAD"] = YOLO(
            str(
                ROAD_MODEL_PATH
            )
        )

        print(
            "[OK] Road model loaded"
        )

        print(
            f"     Classes: "
            f"{models['ROAD'].names}"
        )

    return models


# ======================================================================
# SOURCE TYPE
# ======================================================================

def determine_source_type(
    source: str,
) -> str:

    path = Path(
        source
    )

    if path.exists():

        if path.is_dir():

            return "image_folder"

        if (
            path.suffix.lower()
            in IMAGE_EXTENSIONS
        ):

            return "image"

        if (
            path.suffix.lower()
            in VIDEO_EXTENSIONS
        ):

            return "video"

        return "video"

    try:

        int(source)

        return "camera"

    except ValueError:

        return "stream"


# ======================================================================
# DIRECTORY
# ======================================================================

def create_output_directory(
    output_root: Path,
    source: str,
    source_type: str,
):

    if source_type in {
        "image",
        "video",
    }:

        stem = Path(
            source
        ).stem

    else:

        stem = (
            "live_"
            + datetime.now().strftime(
                "%Y%m%d_%H%M%S"
            )
        )

    directory = (
        output_root / stem
    )

    directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    return directory


# ======================================================================
# BBOX UTILITIES
# ======================================================================

def clamp_bbox(
    bbox,
    width,
    height,
):

    x1, y1, x2, y2 = bbox

    x1 = max(
        0,
        min(
            int(round(x1)),
            width - 1,
        ),
    )

    y1 = max(
        0,
        min(
            int(round(y1)),
            height - 1,
        ),
    )

    x2 = max(
        0,
        min(
            int(round(x2)),
            width - 1,
        ),
    )

    y2 = max(
        0,
        min(
            int(round(y2)),
            height - 1,
        ),
    )

    return [
        x1,
        y1,
        x2,
        y2,
    ]


def calculate_iou(
    box_a,
    box_b,
):

    ax1, ay1, ax2, ay2 = box_a

    bx1, by1, bx2, by2 = box_b

    ix1 = max(
        ax1,
        bx1,
    )

    iy1 = max(
        ay1,
        by1,
    )

    ix2 = min(
        ax2,
        bx2,
    )

    iy2 = min(
        ay2,
        by2,
    )

    iw = max(
        0,
        ix2 - ix1,
    )

    ih = max(
        0,
        iy2 - iy1,
    )

    intersection = (
        iw * ih
    )

    area_a = (
        max(
            0,
            ax2 - ax1,
        )
        *
        max(
            0,
            ay2 - ay1,
        )
    )

    area_b = (
        max(
            0,
            bx2 - bx1,
        )
        *
        max(
            0,
            by2 - by1,
        )
    )

    union = (
        area_a
        + area_b
        - intersection
    )

    if union <= 0:

        return 0.0

    return (
        intersection
        / union
    )


# ======================================================================
# LOCAL NMS
# ======================================================================

def apply_classwise_nms(
    detections,
    iou_threshold,
):

    if not detections:

        return []

    final = []

    class_ids = sorted(
        set(
            detection[
                "class_id"
            ]
            for detection
            in detections
        )
    )

    for class_id in class_ids:

        current = [
            detection
            for detection
            in detections
            if detection[
                "class_id"
            ]
            == class_id
        ]

        current.sort(
            key=lambda x:
                x["confidence"],
            reverse=True,
        )

        while current:

            best = current.pop(0)

            final.append(
                best
            )

            remaining = []

            for candidate in current:

                overlap = calculate_iou(
                    best["bbox"],
                    candidate[
                        "bbox"
                    ],
                )

                if (
                    overlap
                    < iou_threshold
                ):

                    remaining.append(
                        candidate
                    )

            current = remaining

    final.sort(
        key=lambda x:
            x["confidence"],
        reverse=True,
    )

    return final


# ======================================================================
# CRACK MODEL
# ======================================================================

def infer_crack(
    model,
    frame,
    args,
):

    start = time.perf_counter()

    results = model.predict(
        source=frame,
        imgsz=args.imgsz,
        conf=args.conf,
        iou=args.iou,
        device=resolve_device(
            args.device
        ),
        verbose=False,
    )

    elapsed_ms = (
        time.perf_counter()
        - start
    ) * 1000

    result = results[0]

    detections = []

    if (
        result.boxes is None
        or len(result.boxes) == 0
    ):

        return {
            "model": "CRACK",
            "detections": [],
            "latency_ms": elapsed_ms,
        }

    boxes = (
        result.boxes.xyxy
        .cpu()
        .numpy()
    )

    confidences = (
        result.boxes.conf
        .cpu()
        .numpy()
    )

    class_ids = (
        result.boxes.cls
        .cpu()
        .numpy()
        .astype(int)
    )

    for (
        bbox,
        confidence,
        class_id,
    ) in zip(
        boxes,
        confidences,
        class_ids,
    ):

        x1, y1, x2, y2 = [
            float(value)
            for value
            in bbox
        ]

        label = result.names.get(
            int(class_id),
            str(class_id),
        )

        detections.append(
            {
                "model": "CRACK",

                "label": str(
                    label
                ),

                "class_id": int(
                    class_id
                ),

                "confidence": round(
                    float(
                        confidence
                    ),
                    6,
                ),

                "bbox": [
                    x1,
                    y1,
                    x2,
                    y2,
                ],
            }
        )

    return {
        "model": "CRACK",
        "detections": detections,
        "latency_ms": elapsed_ms,
    }


# ======================================================================
# ROAD MODEL - FULL IMAGE
# ======================================================================

def infer_road_full(
    model,
    frame,
    args,
):

    start = time.perf_counter()

    results = model.predict(
        source=frame,
        device="cpu",
        conf=args.conf,
        iou=args.iou,
        imgsz=args.imgsz,
        verbose=False,
    )

    elapsed_ms = (
        time.perf_counter()
        - start
    ) * 1000

    result = results[0]

    detections = []

    if (
        result.boxes is None
        or len(result.boxes) == 0
    ):

        return {
            "model": "ROAD",
            "detections": [],
            "latency_ms": elapsed_ms,
        }

    boxes = (
        result.boxes.xyxy
        .cpu()
        .numpy()
    )

    confidences = (
        result.boxes.conf
        .cpu()
        .numpy()
    )

    class_ids = (
        result.boxes.cls
        .cpu()
        .numpy()
        .astype(int)
    )

    for (
        bbox,
        confidence,
        class_id,
    ) in zip(
        boxes,
        confidences,
        class_ids,
    ):

        x1, y1, x2, y2 = [
            float(value)
            for value in bbox
        ]

        detections.append(
            {
                "model": "ROAD",

                "label": str(
                    result.names.get(
                        int(class_id),
                        str(class_id),
                    )
                ),

                "class_id": int(
                    class_id
                ),

                "confidence": round(
                    float(
                        confidence
                    ),
                    6,
                ),

                "bbox": [
                    x1,
                    y1,
                    x2,
                    y2,
                ],
            }
        )

    return {
        "model": "ROAD",
        "detections": detections,
        "latency_ms": elapsed_ms,
    }


# ======================================================================
# ROAD MODEL - TILED
# ======================================================================

def infer_road_tiled(
    model,
    frame,
    args,
):

    start = time.perf_counter()

    image_height, image_width = (
        frame.shape[:2]
    )

    tile_size = (
        args.road_tile_size
    )

    overlap = (
        args.road_overlap
    )

    stride = int(
        tile_size
        * (
            1.0
            - overlap
        )
    )

    if stride <= 0:

        raise ValueError(
            "Road tile overlap is too large."
        )

    x_positions = list(
        range(
            0,
            max(
                1,
                image_width
                - tile_size
                + 1,
            ),
            stride,
        )
    )

    y_positions = list(
        range(
            0,
            max(
                1,
                image_height
                - tile_size
                + 1,
            ),
            stride,
        )
    )

    # Ensure right edge covered
    if image_width > tile_size:

        final_x = (
            image_width
            - tile_size
        )

        x_positions.append(
            final_x
        )

    # Ensure bottom edge covered
    if image_height > tile_size:

        final_y = (
            image_height
            - tile_size
        )

        y_positions.append(
            final_y
        )

    x_positions = sorted(
        set(
            x_positions
        )
    )

    y_positions = sorted(
        set(
            y_positions
        )
    )

    raw_detections = []

    total_tiles = (
        len(x_positions)
        * len(y_positions)
    )

    print(
        f"       Road tiles: "
        f"{total_tiles}"
    )

    tile_number = 0

    for y in y_positions:

        for x in x_positions:

            tile_number += 1

            x2 = min(
                x + tile_size,
                image_width,
            )

            y2 = min(
                y + tile_size,
                image_height,
            )

            tile = frame[
                y:y2,
                x:x2
            ]

            results = model.predict(
                source=tile,
                device="cpu",
                conf=args.conf,
                iou=args.iou,
                imgsz=tile_size,
                verbose=False,
            )

            result = results[0]

            if (
                result.boxes is None
                or len(result.boxes) == 0
            ):

                continue

            for box in result.boxes:

                local_x1, local_y1, local_x2, local_y2 = (
                    box.xyxy[0]
                    .tolist()
                )

                class_id = int(
                    box.cls[
                        0
                    ].item()
                )

                confidence = float(
                    box.conf[
                        0
                    ].item()
                )

                raw_detections.append(
                    {
                        "model": "ROAD",

                        "label": str(
                            result.names.get(
                                class_id,
                                str(
                                    class_id
                                ),
                            )
                        ),

                        "class_id": class_id,

                        "confidence":
                            round(
                                confidence,
                                6,
                            ),

                        "bbox": [
                            float(
                                local_x1
                                + x
                            ),

                            float(
                                local_y1
                                + y
                            ),

                            float(
                                local_x2
                                + x
                            ),

                            float(
                                local_y2
                                + y
                            ),
                        ],
                    }
                )

    # Remove duplicate boxes from overlapping tiles
    detections = (
        apply_classwise_nms(
            raw_detections,
            args.iou,
        )
    )

    elapsed_ms = (
        time.perf_counter()
        - start
    ) * 1000

    return {
        "model": "ROAD",
        "detections": detections,
        "latency_ms": elapsed_ms,
    }


# ======================================================================
# ROAD DISPATCHER
# ======================================================================

def infer_road(
    model,
    frame,
    args,
):

    if args.road_tiling:

        return infer_road_tiled(
            model,
            frame,
            args,
        )

    return infer_road_full(
        model,
        frame,
        args,
    )


# ======================================================================
# ROBOFLOW RESPONSE
# ======================================================================

def extract_roboflow_predictions(
    result,
    model_name,
    confidence_threshold,
):

    if isinstance(
        result,
        dict,
    ):

        predictions = result.get(
            "predictions",
            [],
        )

    else:

        predictions = getattr(
            result,
            "predictions",
            [],
        )

    if not predictions:

        return []

    detections = []

    for prediction in predictions:

        if hasattr(
            prediction,
            "dict",
        ):

            prediction = (
                prediction.dict()
            )

        elif hasattr(
            prediction,
            "__dict__",
        ):

            prediction = vars(
                prediction
            )

        if not isinstance(
            prediction,
            dict,
        ):

            continue

        try:

            confidence = float(
                prediction.get(
                    "confidence",
                    0.0,
                )
            )

        except (
            TypeError,
            ValueError,
        ):

            confidence = 0.0

        if (
            confidence
            < confidence_threshold
        ):

            continue

        label = (
            prediction.get(
                "class"
            )
            or prediction.get(
                "class_name"
            )
            or prediction.get(
                "label"
            )
            or "unknown"
        )

        # ---------------------------------------------------------
        # Standard Roboflow format
        # ---------------------------------------------------------

        if all(
            key in prediction
            for key in (
                "x",
                "y",
                "width",
                "height",
            )
        ):

            x = float(
                prediction[
                    "x"
                ]
            )

            y = float(
                prediction[
                    "y"
                ]
            )

            width = float(
                prediction[
                    "width"
                ]
            )

            height = float(
                prediction[
                    "height"
                ]
            )

            x1 = (
                x
                - width / 2
            )

            y1 = (
                y
                - height / 2
            )

            x2 = (
                x
                + width / 2
            )

            y2 = (
                y
                + height / 2
            )

        # ---------------------------------------------------------
        # Explicit coordinate format
        # ---------------------------------------------------------

        elif all(
            key in prediction
            for key in (
                "x1",
                "y1",
                "x2",
                "y2",
            )
        ):

            x1 = float(
                prediction[
                    "x1"
                ]
            )

            y1 = float(
                prediction[
                    "y1"
                ]
            )

            x2 = float(
                prediction[
                    "x2"
                ]
            )

            y2 = float(
                prediction[
                    "y2"
                ]
            )

        else:

            continue

        detections.append(
            {
                "model": model_name,

                "label": str(
                    label
                ),

                "class_id": int(
                    prediction.get(
                        "class_id",
                        -1,
                    )
                ),

                "confidence": round(
                    confidence,
                    6,
                ),

                "bbox": [
                    x1,
                    y1,
                    x2,
                    y2,
                ],
            }
        )

    return detections


# ======================================================================
# ROBOFLOW WITH RETRIES
# ======================================================================

def infer_roboflow(
    client,
    frame,
    model_id,
    model_name,
    confidence_threshold,
    retries,
):

    start = time.perf_counter()

    last_error = None

    for attempt in range(
        1,
        retries + 1,
    ):

        try:

            result = client.infer(
                frame,
                model_id=model_id,
            )

            elapsed_ms = (
                time.perf_counter()
                - start
            ) * 1000

            detections = (
                extract_roboflow_predictions(
                    result,
                    model_name,
                    confidence_threshold,
                )
            )

            return {
                "model":
                    model_name,

                "detections":
                    detections,

                "latency_ms":
                    elapsed_ms,

                "status":
                    "success",
            }

        except Exception as error:

            last_error = error

            print(
                f"\n       "
                f"[Roboflow attempt "
                f"{attempt}/{retries}] "
                f"{model_name} failed:"
            )

            print(
                f"       {error}"
            )

            if (
                attempt
                < retries
            ):

                wait = (
                    2
                    ** (
                        attempt
                        - 1
                    )
                )

                print(
                    f"       Retrying "
                    f"in {wait}s..."
                )

                time.sleep(
                    wait
                )

    return {
        "model":
            model_name,

        "detections": [],

        "latency_ms":
            (
                time.perf_counter()
                - start
            )
            * 1000,

        "status":
            "failed",

        "error":
            str(
                last_error
            ),
    }


# ======================================================================
# RUN ALL FOUR MODELS
# ======================================================================

def run_all_models(
    frame,
    local_models,
    roboflow_client,
    args,
    frame_number=None,
):

    all_detections = []

    timings = {}

    statuses = {}

    # ==============================================================
    # 1. CRACK
    # ==============================================================

    if (
        not args.disable_crack
        and "CRACK"
        in local_models
    ):

        print()
        print(
            "       [1/4] CRACK"
        )

        try:

            result = infer_crack(
                local_models["CRACK"],
                frame,
                args,
            )

            timings[
                "CRACK"
            ] = result[
                "latency_ms"
            ]

            statuses[
                "CRACK"
            ] = "success"

            all_detections.extend(
                result[
                    "detections"
                ]
            )

            print(
                f"       CRACK: "
                f"{len(result['detections'])} "
                f"detections | "
                f"{result['latency_ms']:.1f} ms"
            )

        except Exception as error:

            statuses[
                "CRACK"
            ] = "failed"

            print(
                f"       CRACK ERROR: "
                f"{error}"
            )

    # ==============================================================
    # 2. ROAD
    # ==============================================================

    if (
        not args.disable_road
        and "ROAD"
        in local_models
    ):

        print(
            "       [2/4] ROAD"
        )

        try:

            result = infer_road(
                local_models["ROAD"],
                frame,
                args,
            )

            timings[
                "ROAD"
            ] = result[
                "latency_ms"
            ]

            statuses[
                "ROAD"
            ] = "success"

            all_detections.extend(
                result[
                    "detections"
                ]
            )

            print(
                f"       ROAD: "
                f"{len(result['detections'])} "
                f"detections | "
                f"{result['latency_ms']:.1f} ms"
            )

        except Exception as error:

            statuses[
                "ROAD"
            ] = "failed"

            print(
                f"       ROAD ERROR: "
                f"{error}"
            )

    # ==============================================================
    # 3. RAILWAY
    # ==============================================================

    if (
        not args.disable_railway
    ):

        print(
            "       [3/4] RAILWAY"
        )

        if roboflow_client is None:

            statuses[
                "RAILWAY"
            ] = "unavailable"

            print(
                "       RAILWAY: "
                "Roboflow client unavailable"
            )

        else:

            result = infer_roboflow(
                roboflow_client,
                frame,
                RAILWAY_MODEL_ID,
                "RAILWAY",
                args.conf,
                args.roboflow_retries,
            )

            timings[
                "RAILWAY"
            ] = result[
                "latency_ms"
            ]

            statuses[
                "RAILWAY"
            ] = result[
                "status"
            ]

            all_detections.extend(
                result[
                    "detections"
                ]
            )

            print(
                f"       RAILWAY: "
                f"{len(result['detections'])} "
                f"detections | "
                f"{result['latency_ms']:.1f} ms"
            )

    # ==============================================================
    # 4. RUST
    # ==============================================================

    if (
        not args.disable_rust
    ):

        print(
            "       [4/4] RUST"
        )

        if roboflow_client is None:

            statuses[
                "RUST"
            ] = "unavailable"

            print(
                "       RUST: "
                "Roboflow client unavailable"
            )

        else:

            result = infer_roboflow(
                roboflow_client,
                frame,
                RUST_MODEL_ID,
                "RUST",
                args.conf,
                args.roboflow_retries,
            )

            timings[
                "RUST"
            ] = result[
                "latency_ms"
            ]

            statuses[
                "RUST"
            ] = result[
                "status"
            ]

            all_detections.extend(
                result[
                    "detections"
                ]
            )

            print(
                f"       RUST: "
                f"{len(result['detections'])} "
                f"detections | "
                f"{result['latency_ms']:.1f} ms"
            )

    total_time = sum(
        timings.values()
    )

    print()
    print(
        "       -----------------------------------------"
    )

    print(
        f"       TOTAL MODEL TIME: "
        f"{total_time:.1f} ms"
    )

    print(
        "       -----------------------------------------"
    )

    return {
        "detections":
            all_detections,

        "timings":
            timings,

        "statuses":
            statuses,

        "total_model_time_ms":
            total_time,
    }


# ======================================================================
# DRAW DETECTIONS
# ======================================================================

def draw_detection(
    frame,
    detection,
):

    height, width = (
        frame.shape[:2]
    )

    bbox = clamp_bbox(
        detection[
            "bbox"
        ],
        width,
        height,
    )

    detection[
        "bbox"
    ] = bbox

    x1, y1, x2, y2 = bbox

    model = detection[
        "model"
    ]

    label = detection[
        "label"
    ]

    confidence = detection[
        "confidence"
    ]

    color = MODEL_COLORS.get(
        model,
        (
            255,
            255,
            255,
        ),
    )

    # -------------------------------------------------------------
    # Box
    # -------------------------------------------------------------

    cv2.rectangle(
        frame,
        (
            x1,
            y1,
        ),
        (
            x2,
            y2,
        ),
        color,
        3,
    )

    # -------------------------------------------------------------
    # Text
    # -------------------------------------------------------------

    text = (
        f"{model} | "
        f"{label} | "
        f"{confidence:.2f}"
    )

    font = (
        cv2.FONT_HERSHEY_SIMPLEX
    )

    font_scale = 0.60

    thickness = 2

    (
        text_width,
        text_height,
    ), baseline = cv2.getTextSize(
        text,
        font,
        font_scale,
        thickness,
    )

    label_y = max(
        y1,
        text_height
        + baseline
        + 5,
    )

    cv2.rectangle(
        frame,
        (
            x1,
            label_y
            - text_height
            - baseline
            - 5,
        ),
        (
            min(
                width - 1,
                x1
                + text_width
                + 8,
            ),
            label_y,
        ),
        color,
        -1,
    )

    cv2.putText(
        frame,
        text,
        (
            x1 + 4,
            label_y
            - baseline
            - 2,
        ),
        font,
        font_scale,
        (
            0,
            0,
            0,
        ),
        thickness,
        cv2.LINE_AA,
    )


# ======================================================================
# DRAW EVERYTHING
# ======================================================================

def annotate_frame(
    frame,
    detections,
    frame_number=None,
):

    output = frame.copy()

    for detection in detections:

        draw_detection(
            output,
            detection,
        )

    # -------------------------------------------------------------
    # Summary panel
    # -------------------------------------------------------------

    counts = {
        "CRACK": 0,
        "ROAD": 0,
        "RAILWAY": 0,
        "RUST": 0,
    }

    for detection in detections:

        model = detection[
            "model"
        ]

        if model in counts:

            counts[
                model
            ] += 1

    panel_bottom = 135

    cv2.rectangle(
        output,
        (
            10,
            10,
        ),
        (
            650,
            panel_bottom,
        ),
        (
            0,
            0,
            0,
        ),
        -1,
    )

    cv2.putText(
        output,
        "DRIFT | INTEGRATED DEFECT DETECTION",
        (
            20,
            38,
        ),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.62,
        (
            255,
            255,
            255,
        ),
        2,
        cv2.LINE_AA,
    )

    cv2.putText(
        output,
        (
            f"CRACK: {counts['CRACK']} | "
            f"ROAD: {counts['ROAD']}"
        ),
        (
            20,
            67,
        ),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (
            255,
            255,
            255,
        ),
        2,
        cv2.LINE_AA,
    )

    cv2.putText(
        output,
        (
            f"RAILWAY: {counts['RAILWAY']} | "
            f"RUST: {counts['RUST']}"
        ),
        (
            20,
            94,
        ),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (
            255,
            255,
            255,
        ),
        2,
        cv2.LINE_AA,
    )

    bottom_text = (
        f"TOTAL: {len(detections)}"
    )

    if frame_number is not None:

        bottom_text += (
            f" | FRAME: "
            f"{frame_number}"
        )

    cv2.putText(
        output,
        bottom_text,
        (
            20,
            121,
        ),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.52,
        (
            255,
            255,
            255,
        ),
        2,
        cv2.LINE_AA,
    )

    return output


# ======================================================================
# JSON NORMALIZATION
# ======================================================================

def detection_to_json(
    detection,
):

    x1, y1, x2, y2 = (
        detection[
            "bbox"
        ]
    )

    return {
        "model":
            detection[
                "model"
            ],

        "label":
            detection[
                "label"
            ],

        "class_id":
            detection.get(
                "class_id",
                -1,
            ),

        "confidence":
            round(
                float(
                    detection[
                        "confidence"
                    ]
                ),
                6,
            ),

        "bounding_box": {
            "x1": int(x1),
            "y1": int(y1),
            "x2": int(x2),
            "y2": int(y2),
        },

        "pixel_coordinates": {
            "top_left": [
                int(x1),
                int(y1),
            ],

            "bottom_right": [
                int(x2),
                int(y2),
            ],
        },

        "center": {
            "x": round(
                (
                    x1 + x2
                ) / 2,
                2,
            ),

            "y": round(
                (
                    y1 + y2
                ) / 2,
                2,
            ),
        },

        "width":
            int(
                x2 - x1
            ),

        "height":
            int(
                y2 - y1
            ),
    }


# ======================================================================
# SAVE IMAGE
# ======================================================================

def process_image(
    image_path,
    output_dir,
    local_models,
    roboflow_client,
    args,
):

    frame = cv2.imread(
        str(image_path)
    )

    if frame is None:

        raise RuntimeError(
            f"Could not read image:\n"
            f"{image_path}"
        )

    height, width = (
        frame.shape[:2]
    )

    print()
    print(
        "=" * 78
    )

    print(
        f"INPUT IMAGE: "
        f"{image_path.name}"
    )

    print(
        f"Resolution: "
        f"{width}x{height}"
    )

    print(
        "=" * 78
    )

    start = time.perf_counter()

    result = run_all_models(
        frame,
        local_models,
        roboflow_client,
        args,
    )

    total_time = (
        time.perf_counter()
        - start
    ) * 1000

    detections = (
        result[
            "detections"
        ]
    )

    annotated = annotate_frame(
        frame,
        detections,
    )

    # -------------------------------------------------------------
    # Output files
    # -------------------------------------------------------------

    output_image = (
        output_dir
        / f"{image_path.stem}_output.jpg"
    )

    output_json = (
        output_dir
        / f"{image_path.stem}.json"
    )

    output_csv = (
        output_dir
        / f"{image_path.stem}.csv"
    )

    # -------------------------------------------------------------
    # Save image
    # -------------------------------------------------------------

    cv2.imwrite(
        str(output_image),
        annotated,
        [
            cv2.IMWRITE_JPEG_QUALITY,
            95,
        ],
    )

    # -------------------------------------------------------------
    # JSON
    # -------------------------------------------------------------

    json_data = {

        "source":
            str(
                image_path.resolve()
            ),

        "input_type":
            "image",

        "image": {
            "width":
                int(width),

            "height":
                int(height),
        },

        "configuration": {
            "confidence_threshold":
                args.conf,

            "iou_threshold":
                args.iou,

            "local_image_size":
                args.imgsz,

            "road_tiling":
                args.road_tiling,

            "road_tile_size":
                args.road_tile_size,

            "road_overlap":
                args.road_overlap,
        },

        "model_status":
            result[
                "statuses"
            ],

        "timings_ms":
            result[
                "timings"
            ],

        "total_inference_ms":
            round(
                total_time,
                2,
            ),

        "detection_count":
            len(detections),

        "detections": [
            detection_to_json(
                detection
            )
            for detection in detections
        ],
    }

    output_json.write_text(
        json.dumps(
            json_data,
            indent=4,
        ),
        encoding="utf-8",
    )

    # -------------------------------------------------------------
    # CSV
    # -------------------------------------------------------------

    with output_csv.open(
        "w",
        newline="",
        encoding="utf-8",
    ) as file:

        writer = csv.writer(
            file
        )

        writer.writerow(
            [
                "frame",
                "timestamp_sec",
                "model",
                "label",
                "class_id",
                "confidence",
                "x1",
                "y1",
                "x2",
                "y2",
                "center_x",
                "center_y",
                "bbox_width",
                "bbox_height",
                "image_width",
                "image_height",
            ]
        )

        for detection in detections:

            x1, y1, x2, y2 = (
                detection[
                    "bbox"
                ]
            )

            writer.writerow(
                [
                    1,
                    0.0,

                    detection[
                        "model"
                    ],

                    detection[
                        "label"
                    ],

                    detection.get(
                        "class_id",
                        -1,
                    ),

                    detection[
                        "confidence"
                    ],

                    int(x1),
                    int(y1),
                    int(x2),
                    int(y2),

                    round(
                        (
                            x1 + x2
                        ) / 2,
                        2,
                    ),

                    round(
                        (
                            y1 + y2
                        ) / 2,
                        2,
                    ),

                    int(
                        x2 - x1
                    ),

                    int(
                        y2 - y1
                    ),

                    width,
                    height,
                ]
            )

    # -------------------------------------------------------------
    # Terminal summary
    # -------------------------------------------------------------

    print()
    print(
        "=" * 78
    )

    print(
        "FINAL IMAGE SUMMARY"
    )

    print(
        "=" * 78
    )

    if not detections:

        print(
            "NO DEFECTS ABOVE CONFIDENCE THRESHOLD."
        )

    else:

        for index, detection in enumerate(
            detections,
            start=1,
        ):

            print(
                f"{index}. "
                f"[{detection['model']}] "
                f"{detection['label']} "
                f"| conf="
                f"{detection['confidence']:.3f} "
                f"| bbox="
                f"{detection['bbox']}"
            )

    print()
    print(
        f"TOTAL INFERENCE TIME: "
        f"{total_time:.2f} ms"
    )

    print(
        f"\nIMAGE: "
        f"{output_image}"
    )

    print(
        f"JSON : "
        f"{output_json}"
    )

    print(
        f"CSV  : "
        f"{output_csv}"
    )

    # Display result
    display_result(
        annotated,
        (
            f"DRIFT - "
            f"{image_path.name}"
        ),
    )


# ======================================================================
# DISPLAY
# ======================================================================

def display_result(
    frame,
    title,
):

    max_width = 1400
    max_height = 900

    display = frame.copy()

    height, width = (
        display.shape[:2]
    )

    scale = min(
        max_width / width,
        max_height / height,
        1.0,
    )

    if scale < 1:

        display = cv2.resize(
            display,
            (
                int(
                    width
                    * scale
                ),
                int(
                    height
                    * scale
                ),
            ),
            interpolation=cv2.INTER_AREA,
        )

    cv2.namedWindow(
        title,
        cv2.WINDOW_NORMAL,
    )

    cv2.imshow(
        title,
        display,
    )

    print(
        "\nPress Q in the "
        "display window to close."
    )

    while True:

        key = (
            cv2.waitKey(100)
            & 0xFF
        )

        if key in (
            ord("q"),
            ord("Q"),
            27,
        ):

            break

    cv2.destroyWindow(
        title
    )


# ======================================================================
# VIDEO
# ======================================================================

def process_video(
    source,
    output_dir,
    local_models,
    roboflow_client,
    args,
):

    # --------------------------------------------------------------
    # Open source
    # --------------------------------------------------------------

    try:

        source_index = int(
            source
        )

        capture = cv2.VideoCapture(
            source_index
        )

    except ValueError:

        capture = cv2.VideoCapture(
            source
        )

    if not capture.isOpened():

        raise RuntimeError(
            f"Could not open source:\n"
            f"{source}"
        )

    fps = capture.get(
        cv2.CAP_PROP_FPS
    )

    if fps <= 0:

        fps = 20.0

    width = int(
        capture.get(
            cv2.CAP_PROP_FRAME_WIDTH
        )
    )

    height = int(
        capture.get(
            cv2.CAP_PROP_FRAME_HEIGHT
        )
    )

    # --------------------------------------------------------------
    # Output paths
    # --------------------------------------------------------------

    if Path(
        source
    ).exists():

        stem = Path(
            source
        ).stem

    else:

        stem = "live"

    video_output = (
        output_dir
        / f"{stem}_output.mp4"
    )

    json_output = (
        output_dir
        / f"{stem}.json"
    )

    csv_output = (
        output_dir
        / f"{stem}.csv"
    )

    # --------------------------------------------------------------
    # Video writer
    # --------------------------------------------------------------

    writer = None

    if not args.no_save_video:

        writer = cv2.VideoWriter(
            str(video_output),
            cv2.VideoWriter_fourcc(
                *"mp4v"
            ),
            fps,
            (
                width,
                height,
            ),
        )

        if not writer.isOpened():

            print(
                "[WARNING] "
                "Could not create "
                "output video."
            )

            writer.release()

            writer = None

    # --------------------------------------------------------------
    # JSON
    # --------------------------------------------------------------

    video_json = {

        "source":
            (
                str(
                    Path(
                        source
                    ).resolve()
                )
                if Path(source).exists()
                else source
            ),

        "input_type":
            (
                "video"
                if Path(source).exists()
                else "live_stream"
            ),

        "video": {
            "width":
                width,

            "height":
                height,

            "fps":
                fps,
        },

        "configuration": {
            "confidence_threshold":
                args.conf,

            "iou_threshold":
                args.iou,

            "local_image_size":
                args.imgsz,

            "every_nth_frame":
                args.every_nth_frame,

            "road_tiling":
                args.road_tiling,
        },

        "frames": [],
    }

    # --------------------------------------------------------------
    # CSV
    # --------------------------------------------------------------

    csv_file = csv_output.open(
        "w",
        newline="",
        encoding="utf-8",
    )

    csv_writer = csv.writer(
        csv_file
    )

    csv_writer.writerow(
        [
            "frame",
            "timestamp_sec",
            "model",
            "label",
            "class_id",
            "confidence",
            "x1",
            "y1",
            "x2",
            "y2",
            "center_x",
            "center_y",
            "bbox_width",
            "bbox_height",
            "image_width",
            "image_height",
        ]
    )

    # --------------------------------------------------------------
    # Loop
    # --------------------------------------------------------------

    frame_number = 0

    processed_frames = 0

    total_inference_ms = 0.0

    last_detections = []

    print()
    print(
        "=" * 78
    )

    print(
        "VIDEO / LIVE MULTI-MODEL INFERENCE"
    )

    print(
        f"Source     : "
        f"{source}"
    )

    print(
        f"Resolution : "
        f"{width}x{height}"
    )

    print(
        f"FPS        : "
        f"{fps:.2f}"
    )

    print(
        f"Every Nth  : "
        f"{args.every_nth_frame}"
    )

    print(
        "=" * 78
    )

    try:

        while True:

            success, frame = (
                capture.read()
            )

            if not success:

                break

            frame_number += 1

            should_process = (
                (
                    frame_number
                    - 1
                )
                % args.every_nth_frame
                == 0
            )

            if should_process:

                print()
                print(
                    "############################################################"
                )

                print(
                    f"FRAME "
                    f"{frame_number}"
                    f" | "
                    f"{frame_number / fps:.2f}s"
                )

                print(
                    "############################################################"
                )

                frame_start = (
                    time.perf_counter()
                )

                try:

                    result = (
                        run_all_models(
                            frame,
                            local_models,
                            roboflow_client,
                            args,
                            frame_number,
                        )
                    )

                    last_detections = (
                        result[
                            "detections"
                        ]
                    )

                    processed_frames += 1

                    frame_time = (
                        time.perf_counter()
                        - frame_start
                    ) * 1000

                    total_inference_ms += (
                        frame_time
                    )

                    # ------------------------------------------------
                    # FRAME JSON
                    # ------------------------------------------------

                    frame_record = {

                        "frame":
                            frame_number,

                        "timestamp_sec":
                            round(
                                frame_number
                                / fps,
                                3,
                            ),

                        "detection_count":
                            len(
                                last_detections
                            ),

                        "model_status":
                            result[
                                "statuses"
                            ],

                        "timings_ms":
                            result[
                                "timings"
                            ],

                        "detections": [
                            detection_to_json(
                                detection
                            )
                            for detection
                            in last_detections
                        ],
                    }

                    video_json[
                        "frames"
                    ].append(
                        frame_record
                    )

                    # ------------------------------------------------
                    # CSV
                    # ------------------------------------------------

                    timestamp = (
                        frame_number
                        / fps
                    )

                    for detection in (
                        last_detections
                    ):

                        (
                            x1,
                            y1,
                            x2,
                            y2,
                        ) = detection[
                            "bbox"
                        ]

                        csv_writer.writerow(
                            [
                                frame_number,

                                round(
                                    timestamp,
                                    3,
                                ),

                                detection[
                                    "model"
                                ],

                                detection[
                                    "label"
                                ],

                                detection.get(
                                    "class_id",
                                    -1,
                                ),

                                detection[
                                    "confidence"
                                ],

                                int(x1),
                                int(y1),
                                int(x2),
                                int(y2),

                                round(
                                    (
                                        x1 + x2
                                    )
                                    / 2,
                                    2,
                                ),

                                round(
                                    (
                                        y1 + y2
                                    )
                                    / 2,
                                    2,
                                ),

                                int(
                                    x2 - x1
                                ),

                                int(
                                    y2 - y1
                                ),

                                width,
                                height,
                            ]
                        )

                    csv_file.flush()

                    print()
                    print(
                        f"FRAME TOTAL: "
                        f"{len(last_detections)} detections"
                    )

                    print(
                        f"FRAME INFERENCE: "
                        f"{frame_time:.2f} ms"
                    )

                except Exception as error:

                    print(
                        f"\nFRAME ERROR: "
                        f"{error}"
                    )

                    last_detections = []

            # ----------------------------------------------------------
            # Draw latest detections
            # ----------------------------------------------------------

            annotated = (
                annotate_frame(
                    frame,
                    last_detections,
                    frame_number,
                )
            )

            # ----------------------------------------------------------
            # Save video
            # ----------------------------------------------------------

            if writer is not None:

                writer.write(
                    annotated
                )

            # ----------------------------------------------------------
            # Display
            # ----------------------------------------------------------

            if args.display:

                cv2.imshow(
                    "DRIFT - Integrated Detection",
                    annotated,
                )

                key = (
                    cv2.waitKey(1)
                    & 0xFF
                )

                if key in (
                    ord("q"),
                    ord("Q"),
                    27,
                ):

                    break

    finally:

        capture.release()

        if writer is not None:

            writer.release()

        csv_file.close()

        cv2.destroyAllWindows()

    # --------------------------------------------------------------
    # Summary
    # --------------------------------------------------------------

    average_ms = (
        total_inference_ms
        / processed_frames
        if processed_frames
        else 0.0
    )

    video_json[
        "summary"
    ] = {

        "frames_read":
            frame_number,

        "frames_processed":
            processed_frames,

        "total_detection_records":
            sum(
                len(
                    frame[
                        "detections"
                    ]
                )
                for frame
                in video_json[
                    "frames"
                ]
            ),

        "average_multi_model_inference_ms":
            round(
                average_ms,
                2,
            ),
    }

    json_output.write_text(
        json.dumps(
            video_json,
            indent=4,
        ),
        encoding="utf-8",
    )

    print()
    print(
        "=" * 78
    )

    print(
        "VIDEO PROCESSING COMPLETE"
    )

    print(
        "=" * 78
    )

    print(
        f"Frames read      : "
        f"{frame_number}"
    )

    print(
        f"Frames processed : "
        f"{processed_frames}"
    )

    print(
        f"Average inference: "
        f"{average_ms:.2f} ms"
    )

    if writer is not None:

        print(
            f"Video output     : "
            f"{video_output}"
        )

    print(
        f"JSON             : "
        f"{json_output}"
    )

    print(
        f"CSV              : "
        f"{csv_output}"
    )


# ======================================================================
# IMAGE FOLDER
# ======================================================================

def process_image_folder(
    folder,
    output_root,
    local_models,
    roboflow_client,
    args,
):

    images = sorted(
        [
            path
            for path
            in folder.rglob("*")
            if (
                path.is_file()
                and path.suffix.lower()
                in IMAGE_EXTENSIONS
            )
        ]
    )

    if not images:

        raise RuntimeError(
            f"No supported images found:\n"
            f"{folder}"
        )

    print(
        f"Found {len(images)} images."
    )

    for image_path in images:

        output_dir = (
            output_root
            / image_path.stem
        )

        output_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        try:

            process_image(
                image_path,
                output_dir,
                local_models,
                roboflow_client,
                args,
            )

        except Exception as error:

            print()
            print(
                f"[ERROR] "
                f"{image_path}"
            )

            print(
                error
            )


# ======================================================================
# MAIN
# ======================================================================

def main():

    args = parse_args()

    # --------------------------------------------------------------
    # Validate confidence
    # --------------------------------------------------------------

    if args.conf < 0.25:

        raise ValueError(
            "Confidence threshold "
            "must be >= 0.25."
        )

    if args.conf > 1:

        raise ValueError(
            "Confidence threshold "
            "cannot be > 1."
        )

    if args.every_nth_frame < 1:

        raise ValueError(
            "every-nth-frame "
            "must be >= 1."
        )

    # --------------------------------------------------------------
    # Resolve input
    # --------------------------------------------------------------

    source_type = (
        determine_source_type(
            args.source
        )
    )

    output_root = Path(
        args.output_dir
    )

    output_root.mkdir(
        parents=True,
        exist_ok=True,
    )

    # --------------------------------------------------------------
    # Header
    # --------------------------------------------------------------

    print()
    print(
        "=" * 78
    )

    print(
        "DRIFT - INTEGRATED MULTI-MODEL SYSTEM"
    )

    print(
        "=" * 78
    )

    print(
        f"Source     : "
        f"{args.source}"
    )

    print(
        f"Source type: "
        f"{source_type}"
    )

    print(
        f"YOLO size  : "
        f"{args.imgsz}"
    )

    print(
        f"Confidence : "
        f"{args.conf}"
    )

    print(
        f"Device     : "
        f"{resolve_device(args.device)}"
    )

    print(
        f"Road tiling: "
        f"{args.road_tiling}"
    )

    print(
        "=" * 78
    )

    # --------------------------------------------------------------
    # Load local models
    # --------------------------------------------------------------

    local_models = (
        load_local_models(
            args
        )
    )

    # --------------------------------------------------------------
    # Load Roboflow if needed
    # --------------------------------------------------------------

    needs_roboflow = (
        not args.disable_railway
        or not args.disable_rust
    )

    roboflow_client = None

    if needs_roboflow:

        print()
        print(
            "[LOAD] Initializing Roboflow..."
        )

        roboflow_client = (
            create_roboflow_client()
        )

        print(
            "[OK] Roboflow client initialized."
        )

    # --------------------------------------------------------------
    # Output directory
    # --------------------------------------------------------------

    output_dir = (
        create_output_directory(
            output_root,
            args.source,
            source_type,
        )
    )

    print()
    print(
        f"[OUTPUT] "
        f"{output_dir.resolve()}"
    )

    # --------------------------------------------------------------
    # Dispatch
    # --------------------------------------------------------------

    if source_type == "image":

        process_image(
            Path(
                args.source
            ),
            output_dir,
            local_models,
            roboflow_client,
            args,
        )

    elif source_type == "image_folder":

        process_image_folder(
            Path(
                args.source
            ),
            output_root,
            local_models,
            roboflow_client,
            args,
        )

    elif source_type in {
        "video",
        "camera",
        "stream",
    }:

        process_video(
            args.source,
            output_dir,
            local_models,
            roboflow_client,
            args,
        )

    else:

        raise RuntimeError(
            "Unsupported source type."
        )


# ======================================================================
# ENTRY POINT
# ======================================================================

if __name__ == "__main__":

    try:

        main()

    except KeyboardInterrupt:

        print(
            "\nStopped by user."
        )

        sys.exit(0)

    except Exception as error:

        print()
        print(
            "=" * 78
        )

        print(
            "FATAL ERROR"
        )

        print(
            "=" * 78
        )

        print(
            error
        )

        sys.exit(1)