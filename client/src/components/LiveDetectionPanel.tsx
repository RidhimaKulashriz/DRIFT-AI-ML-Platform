import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

type Detection = { label?: string; confidence?: number; severity?: string; boundingBox?: unknown };
type LiveEvent = { type: string; fileName?: string; imageUrl?: string; frameId?: string; detections?: Detection[]; latitude?: number; longitude?: number; occurredAt?: string; error?: string };
const backendOrigin = (import.meta.env.VITE_BACKEND_URL || "https://drift-node-api.onrender.com").replace(/\/$/, "");
function resolveImageUrl(url?: string) { if (!url) return undefined; return /^https?:\/\//i.test(url) ? url : `${backendOrigin}${url.startsWith("/") ? url : `/${url}`}`; }
function boxStyle(box: unknown): CSSProperties | null {
  if (!box || typeof box !== "object") return null;
  const value = box as Record<string, unknown>;
  const numbers = ["x", "y", "width", "height"].map(key => Number(value[key]));
  if (numbers.some(number => !Number.isFinite(number))) return null;
  const [x, y, width, height] = numbers;
  const scale = Math.max(x, y, width, height) <= 1 ? 100 : 1;
  return { left: `${x * scale}%`, top: `${y * scale}%`, width: `${width * scale}%`, height: `${height * scale}%` };
}
export function LiveDetectionPanel({ missionId }: { missionId: number }) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [status, setStatus] = useState<"waiting" | "live" | "error">("waiting");
  useEffect(() => {
    if (!missionId) return;
    const source = new EventSource(`${backendOrigin}/api/drift/live/events?missionId=${encodeURIComponent(missionId)}`);
    source.onopen = () => setStatus("live");
    source.onmessage = message => { try { const next = JSON.parse(message.data) as LiveEvent; if (next.imageUrl) setEvents(previous => [next, ...previous.filter(item => item.frameId !== next.frameId)].slice(0, 6)); setStatus("live"); } catch { setStatus("error"); } };
    source.onerror = () => setStatus("error");
    return () => source.close();
  }, [missionId]);
  const latest = events[0];
  const detections = latest?.detections ?? [];
  const coordinates = useMemo(() => latest?.latitude !== undefined && latest.longitude !== undefined ? `${latest.latitude.toFixed(6)}, ${latest.longitude.toFixed(6)}` : "GPS not included", [latest]);
  return <article className="panel live-detection-panel" aria-live="polite">
    <div className="panel-heading"><div><span className="eyebrow">ROBOFLOW · LIVE RESULTS</span><h2>Analyzed drone frames</h2></div><span className={`hardware-status ${status === "live" ? "connected" : "disconnected"}`}>{status === "live" ? "CONNECTED" : status === "error" ? "RECONNECTING" : "WAITING FOR DRONE"}</span></div>
    {events.length ? <div className="live-detection-history">{events.map((event, eventIndex) => <div className="live-detection-history-card" key={event.frameId ?? event.fileName ?? eventIndex}><div className="live-detection-image-wrap"><div className="live-detection-image-stage"><img src={resolveImageUrl(event.imageUrl)} alt={event.fileName ? `Analyzed ${event.fileName}` : "Analyzed drone frame"} />{(event.detections ?? []).map((detection, index) => { const style = boxStyle(detection.boundingBox); return style ? <span key={`box-${index}`} className="live-detection-box" style={style} /> : null; })}</div><div className="live-detection-badges">{(event.detections ?? []).map((detection, index) => <span key={`${detection.label}-${index}`} className="live-detection-badge">{detection.label ?? "defect"} · {Math.round((detection.confidence ?? 0) * 100)}%</span>)}</div></div><small>{event.fileName ?? event.frameId ?? "drone frame"}</small></div>)}</div> : <div className="live-detection-empty"><strong>Waiting for drone frames</strong><span>Each incoming drone frame is analyzed and retained here.</span></div>}
    <div className="live-detection-meta"><span>{latest?.fileName ?? "No frame received"}</span><span>{coordinates}</span><span>{detections.length} detection{detections.length === 1 ? "" : "s"} · {events.length} frames</span></div>
    {latest?.error && <p className="access-note">Last processing error: {latest.error}</p>}
  </article>;
}
