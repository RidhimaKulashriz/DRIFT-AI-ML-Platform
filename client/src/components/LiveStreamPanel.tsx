import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import type { CSSProperties } from "react";

type Detection = { label?: string; confidence?: number; severity?: string; boundingBox?: unknown };
type LiveEvent = { detections?: Detection[]; fileName?: string; imageUrl?: string; occurredAt?: string };
const configuredStreamUrl = String(import.meta.env.VITE_DRIFT_LIVE_STREAM_URL ?? "").trim();
const streamUrl = configuredStreamUrl;
const backendOrigin = (import.meta.env.VITE_BACKEND_URL || "https://drift-node-api.onrender.com").replace(/\/$/, "");
const uploadedDemoVideoUrl = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663855346163/OqjPCGreoHnnniLg.mp4";
const uploadedDemoPosterUrl = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663855346163/KxynhPEtQoLZhrFd.jpg";
const isAnnotatedFeed = streamUrl.includes("drift-annotated") || streamUrl.includes("annotated");
function boxStyle(box: unknown): CSSProperties | null {
  if (!box || typeof box !== "object") return null;
  const value = box as Record<string, unknown>;
  const numbers = ["x", "y", "width", "height"].map(key => Number(value[key]));
  if (numbers.some(number => !Number.isFinite(number))) return null;
  const [x, y, width, height] = numbers;
  const scale = Math.max(x, y, width, height) <= 1 ? 100 : 1;
  return { left: `${x * scale}%`, top: `${y * scale}%`, width: `${width * scale}%`, height: `${height * scale}%` };
}
function defectColor(label = "") {
  const value = label.toLowerCase();
  if (value.includes("crack")) return "crack";
  if (value.includes("pothole")) return "pothole";
  if (value.includes("corrosion") || value.includes("rust")) return "corrosion";
  return "other";
}
function isValidLiveDetection(detection: Detection) {
  return Number(detection.confidence ?? 0) >= 0.6 && Boolean(boxStyle(detection.boundingBox));
}
export function LiveStreamPanel({ missionId }: { missionId?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState(streamUrl ? "connecting" : "demo");
  const [detections, setDetections] = useState<Detection[]>([]);
  const [lastFile, setLastFile] = useState("");
  useEffect(() => {
    if (!missionId) return;
    const source = new EventSource(`${backendOrigin}/api/drift/live/events?missionId=${encodeURIComponent(missionId)}`);
    source.onmessage = message => { try { const event = JSON.parse(message.data) as LiveEvent; setDetections(event.detections ?? []); setLastFile(event.fileName ?? ""); } catch {} };
    return () => source.close();
  }, [missionId]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;
    let hls: Hls | null = null;
    if (video.canPlayType("application/vnd.apple.mpegurl")) { video.src = streamUrl; video.addEventListener("loadedmetadata", () => setStatus("live"), { once: true }); }
    else if (Hls.isSupported()) { hls = new Hls({ enableWorker: true, lowLatencyMode: true, liveSyncDurationCount: 2 }); hls.loadSource(streamUrl); hls.attachMedia(video); hls.on(Hls.Events.MANIFEST_PARSED, () => setStatus("live")); hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) setStatus("error"); }); }
    else setStatus("unsupported");
    return () => { hls?.destroy(); video.removeAttribute("src"); video.load(); };
  }, []);
  const hasLiveFeed = Boolean(streamUrl);
  return <section className="panel live-stream-panel" aria-label="Live drone stream">
    <div className="panel-heading"><div><span className="eyebrow">DJI UAV · {hasLiveFeed ? "LIVE FEED" : "UPLOADED VIDEO"}</span><h2>{hasLiveFeed ? "Live inspection stream" : "Inspection livestream preview"}</h2></div><span className={`status-chip ${status === "live" ? "status-active" : ""}`}>{status === "live" ? "LIVE" : status === "demo" ? "VIDEO PREVIEW" : status.toUpperCase()}</span></div>
    {hasLiveFeed ? <><div className="live-video-overlay-stage"><video ref={videoRef} className="live-stream-video" controls autoPlay muted playsInline aria-label="Live DJI drone video with ML detection overlays" />{detections.map((detection, index) => { const style = boxStyle(detection.boundingBox); const color = defectColor(detection.label); return style ? <span key={`${lastFile}-${index}`} className={`live-video-detection-box detection-${color}`} style={style}><b>{detection.label ?? "defect"} · {Math.round((detection.confidence ?? 0) * 100)}%</b></span> : null; })}<div className="live-video-detection-strip">{detections.length ? detections.map((detection, index) => <span key={`strip-${index}`} className={`detection-${defectColor(detection.label)}`}>{detection.label ?? "defect"} {Math.round((detection.confidence ?? 0) * 100)}%</span>) : <span>Waiting for live ML detections</span>}</div></div><p className="stream-caption">{isAnnotatedFeed ? "Browser feed: live DJI video with ML detection overlays" : "Live drone video · ML detections overlaid on the current feed"}</p></> : <><video className="live-stream-video" controls autoPlay muted loop playsInline preload="metadata" poster={uploadedDemoPosterUrl} src={uploadedDemoVideoUrl} aria-label="Uploaded DJI inspection video preview" /><p className="stream-caption">Uploaded inspection video preview. Configure VITE_DRIFT_LIVE_STREAM_URL for live drone streaming.</p></>}
  </section>;
}
export { uploadedDemoPosterUrl, uploadedDemoVideoUrl };
