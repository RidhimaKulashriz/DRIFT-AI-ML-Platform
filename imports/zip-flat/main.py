import asyncio
import sys
# Windows: switch to ProactorEventLoop — no 512 fd select() limit
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from contextlib import asynccontextmanager
from pathlib import Path
import json, asyncio, base64, logging, queue, threading, time, os
from datetime import datetime
import numpy as np
import cv2
from ultralytics import YOLO

from video_stream import (
    set_latest_frame, get_latest_frame, make_placeholder_jpeg,
    clear_frame_cache,
)

from database import (
    init_db,
    get_latest_detections, get_filtered_detections,
    get_recent_llm_reports,
    update_detection_sam, update_detection_report, get_detection_report,
    get_detection_embedding, get_severity_counts,
    CURRENT_TABLE, _SESSION_ID,
)
from pdf_generator import generate_inspection_pdf
from sam2_segmenter import SAM2Segmenter
from llm_reporter import LLMReporter
from dinov2_embedder import get_embedder
import sam3_worker
import llm_worker
import processing_worker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(threadName)s] %(levelname)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── GCS display / stats (integrated from gcs_client.py) ───────
_HEADLESS  = os.getenv("GCS_HEADLESS", "1") == "1"   # default: headless (no OpenCV window)
_SAVE_DIR  = os.getenv("GCS_SAVE_DIR",  "captures")
_AUTO_SAVE = os.getenv("GCS_AUTO_SAVE", "0") == "1"
_AUTO_SAVE_CONF = float(os.getenv("GCS_AUTO_SAVE_CONF", "0.70"))
_LOG_FILE  = os.getenv("GCS_LOG_FILE",  "detections.jsonl")

# Shared queues / events
_display_queue: queue.Queue = queue.Queue(maxsize=2)
_running = threading.Event()
_running.set()

# ── Drone reverse channel (query forwarding to Jetson) ────────────────────────
current_query: str  = ""    # raw text of the last query sent via POST /query
current_classes: list[str] = []   # parsed class list forwarded to the Jetson
jetson_ws = None            # active Jetson WebSocket; None when disconnected
_jetson_send_queue: asyncio.Queue = asyncio.Queue()

# Live connection stats — updated by drone WebSocket handler
gcs_stats = {
    "connected":        False,
    "connect_time":     None,
    "drone_address":    None,
    "frames_received":  0,
    "total_detections": 0,
    "yolo_detections":  0,
    "gdino_detections": 0,
    "gs_detections":    0,
    "frames_saved":     0,
    "last_gps":         {"lat": None, "lon": None, "alt_m": None},
    "fps":              0.0,
}
_fps_times: list[float] = []


def _update_fps():
    now = time.time()
    _fps_times.append(now)
    while _fps_times and _fps_times[0] < now - 2.0:
        _fps_times.pop(0)
    gcs_stats["fps"] = len(_fps_times) / (now - _fps_times[0]) if len(_fps_times) >= 2 else 0.0


def _ensure_save_dir():
    os.makedirs(_SAVE_DIR, exist_ok=True)


def _save_frame(frame: np.ndarray, detections: list, gps: dict, reason: str = "auto"):
    _ensure_save_dir()
    ts       = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
    img_path = os.path.join(_SAVE_DIR, f"frame_{ts}.jpg")
    meta_path = os.path.join(_SAVE_DIR, f"frame_{ts}.json")
    cv2.imwrite(img_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
    meta = {"timestamp": ts, "reason": reason, "gps": gps, "detections": detections}
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    gcs_stats["frames_saved"] += 1
    logger.info(f"Frame auto-saved: {img_path} ({len(detections)} detections)")


def _log_detections_jsonl(payload: dict):
    all_dets = payload.get("all_detections") or (
        payload.get("yolo_detections", []) + payload.get("gdino_detections", [])
    )
    if not all_dets:
        return
    entry = {
        "timestamp":  payload.get("timestamp", time.time()),
        "gps":        payload.get("gps", {}),
        "detections": all_dets,
    }
    try:
        with open(_LOG_FILE, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:
        logger.warning(f"Detection log write failed: {e}")


def _draw_stats_overlay(frame: np.ndarray, detections: list, gps: dict) -> np.ndarray:
    panel_h, panel_w = 220, 380
    overlay = frame.copy()
    cv2.rectangle(overlay, (10, 10), (10 + panel_w, 10 + panel_h), (15, 15, 15), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)
    cv2.rectangle(frame, (10, 10), (10 + panel_w, 10 + panel_h), (0, 200, 255), 1)

    y = 35
    cv2.putText(frame, "HAWK-I GCS", (20, y), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 255), 2)
    y += 30
    sc = (0, 255, 0) if gcs_stats["connected"] else (0, 0, 255)
    cv2.circle(frame, (25, y - 5), 5, sc, -1)
    cv2.putText(frame, "CONNECTED" if gcs_stats["connected"] else "WAITING",
                (38, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, sc, 1)
    y += 25
    cv2.putText(frame, f"RX FPS : {gcs_stats['fps']:.1f}", (20, y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
    y += 22
    cv2.putText(frame, f"Frames : {gcs_stats['frames_received']}", (20, y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
    y += 22
    cv2.putText(frame, f"Detections: Y={gcs_stats['yolo_detections']} GD={gcs_stats['gdino_detections']} GS={gcs_stats['gs_detections']}",
                (20, y), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (200, 200, 200), 1)
    y += 22
    lat = gps.get("lat"); lon = gps.get("lon"); alt = gps.get("alt_m")
    if lat is not None and lon is not None:
        gps_txt = f"GPS: {lat:.6f}, {lon:.6f}  Alt: {(alt or 0.0):.1f}m"
        gps_col = (0, 255, 200)
    else:
        gps_txt = "GPS: No fix"
        gps_col = (100, 100, 100)
    cv2.putText(frame, gps_txt, (20, y), cv2.FONT_HERSHEY_SIMPLEX, 0.42, gps_col, 1)
    y += 22
    cv2.putText(frame, f"Saved: {gcs_stats['frames_saved']}", (20, y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
    h = frame.shape[0]
    cv2.putText(frame, "[S] Save  [Q] Quit", (10, h - 15),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (100, 100, 100), 1)
    return frame


def _draw_waiting_screen() -> np.ndarray:
    frame = np.zeros((480, 720, 3), dtype=np.uint8)
    cv2.putText(frame, "HAWK-I GCS",                    (230, 180), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 200, 255), 2)
    cv2.putText(frame, "Waiting for Jetson connection...", (180, 230), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (100, 100, 100), 1)
    cv2.putText(frame, "Backend: ws://0.0.0.0:8000/ws/drone", (185, 270), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (80, 80, 80), 1)
    dots = "." * (int(time.time() * 2) % 4)
    cv2.putText(frame, dots, (510, 230), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (100, 100, 100), 1)
    return frame


def _gcs_display_thread():
    """Background thread: shows live OpenCV window with drone feed + stats overlay."""
    if _HEADLESS:
        logger.info("GCS display: headless mode — no OpenCV window")
        return
    logger.info("GCS display thread started")
    cv2.namedWindow("DRIFT GCS", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("DRIFT GCS", 1280, 720)
    last_fd = None
    while _running.is_set():
        try:
            last_fd = _display_queue.get(timeout=0.1)
        except queue.Empty:
            pass
        if last_fd is not None:
            frame = last_fd["frame"].copy()
            frame = _draw_stats_overlay(frame, last_fd["detections"], last_fd["gps"])
        else:
            frame = _draw_waiting_screen()
        cv2.imshow("DRIFT GCS", frame)
        key = cv2.waitKey(1) & 0xFF
        if key in (ord('q'), ord('Q')):
            _running.clear()
            break
        if key in (ord('s'), ord('S')) and last_fd is not None:
            _save_frame(last_fd["frame"], last_fd["detections"], last_fd["gps"], reason="manual")
    cv2.destroyAllWindows()
    logger.info("GCS display thread stopped")


def _gcs_stats_thread():
    """Periodic stats logger (useful when headless)."""
    while _running.is_set():
        time.sleep(3.0)
        if not _running.is_set():
            break
        gps = gcs_stats["last_gps"]
        gps_str = (
            f"{gps['lat']:.6f}, {gps['lon']:.6f} @ {(gps.get('alt_m') or 0):.1f}m"
            if gps.get("lat") is not None else "No fix"
        )
        logger.info(
            f"[GCS] Frames={gcs_stats['frames_received']} FPS={gcs_stats['fps']:.1f} "
            f"Dets(Y={gcs_stats['yolo_detections']} GD={gcs_stats['gdino_detections']} GS={gcs_stats['gs_detections']}) "
            f"Saved={gcs_stats['frames_saved']} GPS={gps_str} "
            f"{'CONNECTED' if gcs_stats['connected'] else 'WAITING'}"
        )

# ── GPU tuning (applied once at module load) ──────────────────
import torch as _torch
if _torch.cuda.is_available():
    _torch.backends.cudnn.benchmark       = True
    _torch.backends.cuda.matmul.allow_tf32 = True
    logger.info("CUDA available — cudnn.benchmark + TF32 enabled")

# ── Ground-station YOLO model (loaded at startup) ─────────────
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_YOLO_WEIGHTS = _PROJECT_ROOT / "models" / "DRIFT_yolo11n.pt"
_YOLO_DEVICE  = 0 if _torch.cuda.is_available() else "cpu"   # 0 = cuda:0
try:
    gs_yolo_model = YOLO(str(_YOLO_WEIGHTS))
    gs_yolo_model.to(_YOLO_DEVICE)
    logger.info(f"Loaded GS YOLO weights from {_YOLO_WEIGHTS} → device={_YOLO_DEVICE}")
except Exception as _yolo_err:
    gs_yolo_model = None
    logger.warning(f"Could not load GS YOLO weights ({_yolo_err}). GS inference disabled.")

# ── SAM2 segmenter (lazy-loads model on first request) ────────
segmenter = SAM2Segmenter()

# ── LLM reporter (calls Ollama / Gemma-3) ─────────────────────
reporter = LLMReporter()

# ── Startup: connect to DB + launch GCS background threads ───
@asynccontextmanager
async def lifespan(app):
    # Purge stale frames from the previous run so the feed isn't frozen
    clear_frame_cache()
    logger.info("Cleared stale frames from data/frames/")

    await init_db()
    for tgt, name in [(_gcs_display_thread, "GCS-Display"), (_gcs_stats_thread, "GCS-Stats")]:
        t = threading.Thread(target=tgt, name=name, daemon=True)
        t.start()
        logger.info(f"Started background thread: {name}")

    logger.info(f"Session started: {_SESSION_ID}  →  table: {CURRENT_TABLE}")

    # ── SAM2 health check at startup ──────────────────────────────────────
    loop = asyncio.get_running_loop()
    sam2_ok = await loop.run_in_executor(None, segmenter.sam2_health_check)
    if not sam2_ok:
        logger.error("SAM2 health check FAILED — segmentation will not work correctly")
    else:
        logger.info("SAM2 health check passed ✓")

    # ── Wire LLM batch worker (30 s sweep for dashboard cards) ──
    llm_worker.set_dashboard_clients(connected_dashboards)
    asyncio.create_task(llm_worker.run_llm_worker())
    logger.info("LLM worker background task started")

    # ── Processing worker: SAM2 + DINOv2 + LLM per detection ───
    asyncio.create_task(processing_worker.run_processing_worker())
    logger.info("Processing worker background task started")

    yield

    # ── Auto-generate PDF report on shutdown ──────────────────
    _running.clear()
    logger.info("Generating session report on shutdown…")
    try:
        rows = await get_latest_detections(limit=10000)
        for r in rows:
            if r.get("detected_at"):
                r["detected_at"] = str(r["detected_at"])

        if rows:
            os.makedirs("reports", exist_ok=True)
            report_path = os.path.join("reports", f"DRIFT_{_SESSION_ID}.pdf")
            loop = asyncio.get_running_loop()
            pdf_bytes = await loop.run_in_executor(None, generate_inspection_pdf, rows)
            with open(report_path, "wb") as f:
                f.write(pdf_bytes)
            logger.info(f"Session report saved: {report_path}  ({len(rows)} detections)")
        else:
            logger.info("No detections this session — skipping report")
    except Exception as e:
        logger.error(f"Auto-report generation failed: {e}")

    # ── Close all open dashboard WebSocket connections ────────────
    for client in list(connected_dashboards):
        try:
            await client.close(code=1001)
        except Exception:
            pass
    connected_dashboards.clear()

    # ── Close asyncpg connection pool ─────────────────────────────
    from database import pool as _db_pool
    if _db_pool:
        await _db_pool.close()
        logger.info("Database pool closed")

# Set of currently connected dashboard WebSocket clients.
# A set is used (not a list) so discard() is safe and there are no
# index-based eviction bugs.  Declared before the lifespan function
# runs so set_dashboard_clients() gets the live object at startup.
connected_dashboards: set = set()

app = FastAPI(lifespan=lifespan)

# Serve SAM-annotated frames so the dashboard can show them by URL
os.makedirs(os.path.join("data", "frames"), exist_ok=True)
app.mount("/frames", StaticFiles(directory=os.path.join("data", "frames")), name="frames")


# ── Helpers ───────────────────────────────────────────────────

def _strip_data_uri(frame_b64: str) -> str:
    """Remove 'data:image/...;base64,' prefix if present."""
    if "," in frame_b64:
        return frame_b64.split(",", 1)[1]
    return frame_b64


def b64_to_jpeg_bytes(frame_b64: str) -> bytes:
    """Decode a base64 string (with optional data-URI prefix) → raw JPEG bytes."""
    return base64.b64decode(_strip_data_uri(frame_b64))


def decode_jpeg(frame_b64: str) -> np.ndarray:
    """Decode a base64 JPEG string (with optional data-URI prefix) → RGB numpy array."""
    frame_bytes = b64_to_jpeg_bytes(frame_b64)
    frame_np    = np.frombuffer(frame_bytes, dtype=np.uint8)
    frame_bgr   = cv2.imdecode(frame_np, cv2.IMREAD_COLOR)
    return cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)


def run_gs_yolo(frame_rgb: np.ndarray) -> list[dict]:
    """Run ground-station YOLO inference on an RGB frame.

    Returns detections in the same format as the drone's yolo_detections
    so they can be merged into all_detections transparently.
    """
    if gs_yolo_model is None:
        return []
    results = gs_yolo_model(frame_rgb, verbose=False, device=_YOLO_DEVICE)[0]
    detections = []
    for box in results.boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        conf            = float(box.conf[0])
        cls_id          = int(box.cls[0])
        class_name      = gs_yolo_model.names[cls_id]
        detections.append({
            "class":  class_name,
            "conf":   conf,
            "box":    [x1, y1, x2, y2],
            "source": "gs_yolo",
        })
    return detections



# ── Drone WebSocket ───────────────────────────────────────────
@app.websocket("/ws/drone")
async def drone_receiver(websocket: WebSocket):
    """Receive detection payloads from the Jetson and forward backend commands back.

    Two concurrent tasks run on the same WebSocket:
      _receiver — reads detection frames from the Jetson and stores them.
      _sender   — drains _jetson_send_queue and writes commands to the Jetson.

    This lets POST /query push a query / ping down to the Jetson without
    blocking the receive loop.
    """
    global jetson_ws
    await websocket.accept()
    client_addr = websocket.client.host if websocket.client else "unknown"
    logger.info("✓ Drone/Jetson connected from %s", client_addr)

    gcs_stats["connected"]     = True
    gcs_stats["connect_time"]  = time.time()
    gcs_stats["drone_address"] = client_addr
    jetson_ws = websocket

    # Drain any stale messages left in the queue from a previous connection
    while not _jetson_send_queue.empty():
        try:
            _jetson_send_queue.get_nowait()
        except asyncio.QueueEmpty:
            break

    async def _receiver():
        loop = asyncio.get_event_loop()
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)

            # Skip any control messages the Jetson might send back
            if data.get("type"):
                continue

            # ── Fast path — store raw JPEG in memory immediately ───────────
            # No disk access; /video_feed reads from this directly.
            frame_b64 = data.get("frame_jpeg") or ""
            frame_np  = None
            if frame_b64:
                raw_b64 = frame_b64
                if raw_b64.startswith("data:"):
                    raw_b64 = raw_b64.split(",", 1)[1]
                frame_bytes = base64.b64decode(raw_b64)
                set_latest_frame(frame_bytes)

                # Decode to numpy for SAM2 — only when there are detections
                # to process (avoids imdecode overhead on empty frames).
                yolo_dets  = data.get("yolo_detections",  [])
                gdino_dets = data.get("gdino_detections", [])
                if yolo_dets or gdino_dets:
                    buf = np.frombuffer(frame_bytes, dtype=np.uint8)
                    bgr = cv2.imdecode(buf, cv2.IMREAD_COLOR)
                    if bgr is not None:
                        frame_np = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            else:
                yolo_dets  = data.get("yolo_detections",  [])
                gdino_dets = data.get("gdino_detections", [])

            # ── Parse GPS ─────────────────────────────────────
            gps = data.get("gps") or {}
            lat = float(gps.get("lat")   or 0.0)
            lon = float(gps.get("lon")   or 0.0)
            alt = float(gps.get("alt_m") or 0.0)

            # ── Fast in-memory stats — NO blocking I/O here ────
            gcs_stats["frames_received"]  += 1
            gcs_stats["yolo_detections"]  += len(yolo_dets)
            gcs_stats["gdino_detections"] += len(gdino_dets)
            gcs_stats["total_detections"] += len(yolo_dets) + len(gdino_dets)
            gcs_stats["last_gps"]          = gps
            _update_fps()

            # Fire-and-forget JSONL write — push to thread pool
            loop.run_in_executor(
                None, _log_detections_jsonl,
                {**data, "all_detections": yolo_dets + gdino_dets},
            )

            # ── One queue item per frame (not per detection) ───────────────
            # Filter low-confidence detections before queuing.
            filtered_yolo  = [d for d in yolo_dets  if d.get("conf", 0) >= 0.45]
            filtered_gdino = [d for d in gdino_dets if d.get("conf", 0) >= 0.45]

            if filtered_yolo or filtered_gdino:
                processing_worker.raw_queue.put_nowait({
                    "timestamp":        time.time(),
                    "gps":              {"lat": lat, "lon": lon, "alt_m": alt},
                    "yolo_detections":  filtered_yolo,
                    "gdino_detections": filtered_gdino,
                    "frame_np":         frame_np,
                })

            logger.info(
                "Frame received: %d yolo + %d gdino detection(s) queued | "
                "GPS=(%.4f,%.4f) | queue_depth=%d",
                len(filtered_yolo), len(filtered_gdino), lat, lon,
                processing_worker.raw_queue.qsize(),
            )

            # Yield to the event loop so dashboard pings are not starved
            await asyncio.sleep(0)

    async def _sender():
        """Forward backend-originated messages (queries, pings) to the Jetson."""
        while True:
            msg = await _jetson_send_queue.get()
            await websocket.send_text(json.dumps(msg))

    recv_task   = asyncio.create_task(_receiver())
    sender_task = asyncio.create_task(_sender())

    try:
        done, pending = await asyncio.wait(
            [recv_task, sender_task],
            return_when=asyncio.FIRST_EXCEPTION,
        )
        for t in pending:
            t.cancel()
        # Re-raise the first exception so the caller can log it
        for t in done:
            if not t.cancelled():
                exc = t.exception()
                if exc:
                    raise exc
    except WebSocketDisconnect:
        logger.info("✗ Drone disconnected from %s", client_addr)
    except json.JSONDecodeError as e:
        logger.warning("Invalid JSON from drone: %s", e)
    except Exception as e:
        logger.error("Drone WebSocket error: %s", e)
    finally:
        jetson_ws = None
        gcs_stats["connected"]     = False
        gcs_stats["drone_address"] = None
        logger.info("Drone connection cleaned up")


# ── Dashboard WebSocket ───────────────────────────────────────

@app.websocket("/ws/dashboard")
async def dashboard_ws(websocket: WebSocket):
    """Minimal, crash-proof dashboard WebSocket handler.

    Design:
    - accept() is the very first call, outside any try/except, so FastAPI
      never sees an "ASGI callable returned without sending handshake" error.
    - connected_dashboards is a set; .add() / .discard() are both safe to
      call even if the connection is already gone.
    - The keep-alive loop uses asyncio.sleep(1) which never raises on its own.
      WebSocketDisconnect is only raised by send/receive calls — the LLM worker
      catches it when it tries to push a report and removes the dead client.
    - Any unexpected exception is logged with a full traceback so it's visible
      in the server log rather than silently closing the connection.
    """
    import traceback

    client_ip = websocket.client.host if websocket.client else "unknown"
    try:
        await websocket.accept()
        logger.info("Dashboard WS accepted from %s (%d total)",
                    client_ip, len(connected_dashboards) + 1)

        connected_dashboards.add(websocket)
        try:
            while True:
                await asyncio.sleep(1)
        except WebSocketDisconnect:
            pass
        finally:
            connected_dashboards.discard(websocket)
            logger.debug("Dashboard client %s removed (%d remaining)",
                         client_ip, len(connected_dashboards))

    except Exception:
        logger.error("Dashboard WS handler CRASHED for %s:\n%s",
                     client_ip, traceback.format_exc())


# ── REST endpoints ────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "DRIFT backend running ✓"}


@app.get("/health")
def health():
    """Lightweight health check — returns 200 if the server is up."""
    return {"ok": True, "timestamp": time.time()}


@app.get("/frame/latest")
async def frame_latest():
    """Single JPEG snapshot of the latest raw drone frame.

    Served directly from the in-memory store — no disk access.
    Falls back to a placeholder if no frame has been received yet.
    """
    jpeg = get_latest_frame() or make_placeholder_jpeg()
    return Response(content=jpeg, media_type="image/jpeg",
                    headers={"Cache-Control": "no-store"})


@app.get("/video_feed")
async def video_feed():
    """
    MJPEG stream of the latest drone frame.

    Each part is:
        --frame\\r\\n
        Content-Type: image/jpeg\\r\\n\\r\\n
        <raw JPEG bytes>\\r\\n

    If no frame has been received yet (or the last one is stale),
    a placeholder 'Waiting for feed' image is served instead so the
    stream never stalls.
    """
    async def _generate():
        while True:
            # Serve from in-memory store — zero disk access on the hot path.
            jpeg = get_latest_frame() or make_placeholder_jpeg()
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + jpeg
                + b"\r\n"
            )
            await asyncio.sleep(0.033)  # ~30 fps — pure memory read is fast

    return StreamingResponse(
        _generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/api/session")
def get_session():
    """Return the current session ID, active table, and live detection count."""
    return JSONResponse({
        "session_id":  _SESSION_ID,
        "table":       CURRENT_TABLE,
        "detections":  gcs_stats["total_detections"],
        "started_at":  gcs_stats["connect_time"],
    })


@app.get("/api/gcs/status")
def gcs_status():
    """Return live GCS connection stats (useful for testing connectivity)."""
    uptime_s = None
    if gcs_stats["connect_time"] and gcs_stats["connected"]:
        uptime_s = round(time.time() - gcs_stats["connect_time"], 1)
    return JSONResponse({
        **gcs_stats,
        "uptime_s": uptime_s,
    })


@app.get("/detections/llm_reports/latest")
async def get_latest_llm_reports(seconds: int = 60, limit: int = 10):
    """Return detections with llm_report populated in the last `seconds` seconds."""
    rows = await get_recent_llm_reports(seconds=seconds, limit=limit)
    for r in rows:
        if r.get("detected_at"):
            r["detected_at"] = str(r["detected_at"])
    return JSONResponse(rows)


@app.get("/detections/latest")
async def get_latest(limit: int = 20):
    rows = await get_latest_detections(limit=limit)
    for r in rows:
        if r.get("detected_at"):
            r["detected_at"] = str(r["detected_at"])
    return JSONResponse(rows)


@app.get("/api/detections")
async def get_detections(
    limit: int = 100,
    class_name: str | None = None,
    severity: str | None = None,
):
    """Filtered detections. class_name and severity are comma-separated lists."""
    class_names = [c.strip() for c in class_name.split(",")] if class_name else None
    severities  = [s.strip() for s in severity.split(",")]   if severity  else None
    rows = await get_filtered_detections(limit=limit, class_names=class_names, severities=severities)
    for r in rows:
        if r.get("detected_at"):
            r["detected_at"] = str(r["detected_at"])
    return JSONResponse(rows)


def _parse_classes(raw: str) -> list[str]:
    """Split a free-text query into a clean class list.

    Splits on commas, 'and', '&', '+'.  Strips whitespace and drops empties.
    'cracked concrete, rust stain and exposed rebar'
        → ["cracked concrete", "rust stain", "exposed rebar"]
    """
    import re
    parts = re.split(r",|\band\b|&|\+", raw, flags=re.IGNORECASE)
    return [p.strip() for p in parts if p.strip()]


# ── Query expansion map ───────────────────────────────────────────────────────
# Maps user-friendly shorthand → YOLO-World sub-queries that the Jetson model
# actually understands.  Mirrors multi_query_yoloworld.py QUERY_MAP on the
# Jetson side; keep in sync when adding new defect classes.
_QUERY_MAP: dict[str, list[str]] = {
    "crack": [
        "thin line in concrete",
        "fracture in wall",
        "hairline crack",
        "vertical crack in wall",
        "horizontal crack in concrete",
    ],
    "spalling": [
        "broken concrete chunk",
        "missing piece of wall",
        "concrete falling off",
        "deep chip in concrete",
        "hollow area in wall",
    ],
    "exposed rebar": [
        "bare metal rod",
        "protruding steel bar",
        "rebar sticking out of concrete",
        "metal rod in broken concrete",
        "corroded steel bar",
    ],
    "exposed_reinforcement": [
        "bare metal rod",
        "protruding steel bar",
        "rebar sticking out of concrete",
        "metal rod in broken concrete",
        "corroded steel bar",
    ],
    "rust": [
        "brown stain on concrete",
        "orange streak on wall",
        "rust mark on surface",
        "iron stain on cement",
        "reddish discoloration",
    ],
    "ruststain": [
        "brown stain on concrete",
        "orange streak on wall",
        "rust mark on surface",
        "iron stain on cement",
        "reddish discoloration",
    ],
    "scaling": [
        "peeling concrete surface",
        "flaking wall layer",
        "surface layer coming off",
        "deteriorating concrete top",
        "rough eroded surface",
    ],
    "efflorescence": [
        "white powder on wall",
        "white crust on concrete",
        "salt deposit on surface",
        "chalky white stain",
        "mineral deposit on brick",
    ],
    "corrosion": [
        "corroded metal surface",
        "rust on steel beam",
        "oxidised metal structure",
        "orange rust on rebar",
        "corroded iron surface",
    ],
    "delamination": [
        "concrete layer separating",
        "surface sheet peeling from slab",
        "hollow sound area on wall",
        "concrete layer debonding",
        "loose surface layer",
    ],
}


def _expand_query(classes: list[str]) -> list[str]:
    """
    Expand each canonical class name into its YOLO-World sub-queries.

    E.g. ["crack"] → ["thin line in concrete", "fracture in wall", ...]
         ["unknown_thing"] → ["unknown_thing"]   (no expansion, kept as-is)

    Lookup is case-insensitive and normalises spaces/underscores.
    Deduplicates while preserving insertion order.
    """
    expanded: list[str] = []
    seen: set[str] = set()

    for cls in classes:
        key = cls.lower().replace(" ", "_").replace("-", "_")
        # Also try without underscores for natural-language inputs
        key_plain = cls.lower().strip()
        sub = _QUERY_MAP.get(key) or _QUERY_MAP.get(key_plain)
        if sub:
            for q in sub:
                if q not in seen:
                    expanded.append(q)
                    seen.add(q)
        else:
            if cls not in seen:
                expanded.append(cls)
                seen.add(cls)

    return expanded


@app.post("/query")
async def send_query(payload: dict):
    """Parse a free-text query, expand to YOLO-World sub-queries, and forward to Jetson.

    Input  {"query": "crack"}
    Output {"status": "ok", "classes": ["thin line in concrete", "fracture in wall", ...]}

    The expanded class list is what actually reaches the Jetson's set_classes() call,
    giving the model descriptive visual phrases instead of bare one-word labels.
    """
    global current_query, current_classes
    query_text = payload.get("query", "").strip()
    current_query = query_text

    parsed  = _parse_classes(query_text)       # ["crack", "spalling"]
    classes = _expand_query(parsed)            # ["thin line in concrete", ...]
    current_classes = parsed                   # store canonical names for UI display

    if jetson_ws is None:
        return JSONResponse({"status": "no_drone_connected"})

    await _jetson_send_queue.put({"type": "query", "query": query_text, "classes": classes})
    logger.info(
        "Query expand: %r → %d canonical → %d sub-queries: %s",
        query_text, len(parsed), len(classes), classes,
    )
    return JSONResponse({"status": "ok", "classes": classes, "canonical": parsed})


@app.get("/query/current")
def get_current_query():
    """Return the last class list sent to the drone and the original raw query."""
    return JSONResponse({"classes": current_classes, "raw_query": current_query})


@app.get("/api/report/pdf")
async def download_pdf_report(
    severity:   str | None = None,
    class_name: str | None = None,
    limit:      int        = 500,
):
    """
    Generate and return a full inspection report PDF.
    Optional filters:
      ?severity=L3          — comma-separated, e.g. L3,L2
      ?class_name=crack     — comma-separated defect class names
    """
    severities  = [s.strip() for s in severity.split(",")]    if severity    else None
    class_names = [c.strip() for c in class_name.split(",")]  if class_name  else None

    rows = await get_filtered_detections(
        limit=limit,
        class_names=class_names,
        severities=severities,
    )
    for r in rows:
        if r.get("detected_at"):
            r["detected_at"] = str(r["detected_at"])

    loop = asyncio.get_running_loop()

    # Pre-generate mission summary (async LLM call) before PDF thread
    mission_summary = None
    try:
        mission_summary = await reporter.batch_report(rows)
    except Exception as e:
        logger.warning("batch_report failed: %s — PDF without mission summary", e)

    pdf_bytes = await loop.run_in_executor(
        None, generate_inspection_pdf, rows, mission_summary
    )

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"DRIFT_report_{ts}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/report/{detection_id}")
async def get_report(detection_id: int):
    """Return the LLM-generated inspection report for a given detection."""
    row = await get_detection_report(detection_id)
    if row is None:
        return JSONResponse({"error": "detection not found"}, status_code=404)
    if not row.get("llm_report"):
        return JSONResponse({"error": "report not yet generated"}, status_code=202)
    return JSONResponse({
        "id":         row["id"],
        "class_name": row["class_name"],
        "report":     row["llm_report"],
    })


class SegmentRequest(BaseModel):
    frame_jpeg:  str         # base64-encoded JPEG
    box:         list[float] # [x1, y1, x2, y2]
    altitude_m:  float


@app.post("/api/segment")
async def segment_single(req: SegmentRequest):
    """
    Accept a single base64 frame + bounding box + altitude.
    Return the SAM2-segmented area in cm².
    """
    try:
        loop   = asyncio.get_running_loop()
        frame  = await loop.run_in_executor(None, decode_jpeg, req.frame_jpeg)
        result = await loop.run_in_executor(
            None,
            segmenter.segment_box,
            frame,
            req.box,
        )
        area_cm2 = segmenter.px_to_cm2(
            result["area_px"], req.altitude_m, image_width_px=frame.shape[1]
        )
        return {
            "area_px":   result["area_px"],
            "area_cm2":  area_cm2,
            "sam_score": result["score"],
        }
    except Exception as e:
        logger.error(f"/api/segment failed: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/similar/{detection_id}")
async def get_similar_detections(detection_id: int):
    """
    Return the top 3 most visually similar past detections to the given ID,
    ranked by DINOv2 cosine similarity.

    Response: [{id, lat, lon, class, area_cm2, detected_at, similarity}]
    """
    row = await get_detection_embedding(detection_id)
    if row is None:
        return JSONResponse({"error": "detection not found"}, status_code=404)

    emb_bytes = row.get("embedding")
    if not emb_bytes:
        return JSONResponse(
            {"error": "embedding not yet computed for this detection"},
            status_code=202,
        )

    try:
        embedding = np.frombuffer(bytes(emb_bytes), dtype=np.float32)
        if embedding.shape != (768,):
            return JSONResponse({"error": "invalid embedding shape"}, status_code=500)
    except Exception as e:
        return JSONResponse({"error": f"embedding decode failed: {e}"}, status_code=500)

    embedder = get_embedder()
    similar = await embedder.find_similar(
        embedding, row["class_name"], top_k=3
    )
    # Exclude the detection itself
    similar = [s for s in similar if s["id"] != detection_id]

    return JSONResponse(similar)


@app.get("/api/site_health")
async def site_health():
    """
    Compute and return an overall site health score (0–100).

    Score formula:
        100 - (CRITICAL×25 + HIGH×10 + MEDIUM×3 + LOW×1)  capped at 0.

    CRITICAL = L3 with confidence > 0.85
    HIGH     = L3 with confidence ≤ 0.85
    MEDIUM   = L2
    LOW      = L1
    """
    counts = await get_severity_counts()
    penalty = (
        counts.get("critical", 0) * 25
        + counts.get("high", 0)   * 10
        + counts.get("medium", 0) * 3
        + counts.get("low", 0)    * 1
    )
    score = max(0, 100 - penalty)
    return JSONResponse({
        "score":            score,
        "total_detections": counts.get("total", 0),
        "breakdown": {
            "critical": counts.get("critical", 0),
            "high":     counts.get("high", 0),
            "medium":   counts.get("medium", 0),
            "low":      counts.get("low", 0),
        },
    })
