"""Convert Hitakshi's YOLO .pt models to ONNX for lightweight inference."""
import os, sys

def convert():
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[CONVERT] ultralytics not installed, skipping")
        return

    models = [
        ("cracks/main_crack.pt", "cracks/main_crack.onnx"),
        ("road-ml/main_road.pt", "road-ml/main_road.onnx"),
    ]

    for pt_path, onnx_path in models:
        if os.path.exists(onnx_path):
            print(f"[CONVERT] {onnx_path} already exists, skipping")
            continue
        if not os.path.exists(pt_path):
            print(f"[CONVERT] {pt_path} not found, skipping")
            continue
        print(f"[CONVERT] Converting {pt_path} -> {onnx_path} ...")
        model = YOLO(pt_path)
        model.export(format="onnx", imgsz=640, simplify=True)
        print(f"[CONVERT] Done: {onnx_path}")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)) or ".")
    convert()
