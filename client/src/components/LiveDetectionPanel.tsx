import { useEffect, useMemo, useState } from "react";

type Detection = { label?: string; confidence?: number; severity?: string; boundingBox?: unknown };
type LiveEvent = { type: string; fileName?: string; imageUrl?: string; frameId?: string; detections?: Detection[]; latitude?: number; longitude?: number; occurredAt?: string; error?: string };

const backendOrigin = (import.meta.env.VITE_BACKEND_URL || "https://drift-node-api.onrender.com").replace(/\/$/, "");

export function LiveDetectionPanel({ missionId }: { missionId: number }) {
  const [event, setEvent] = useState<LiveEvent | null>(null);
  const [status, setStatus] = useState<"waiting" | "live" | "error">("waiting");

  useEffect(() => {
    if (!missionId) return;
    const source = new EventSource(`${backendOrigin}/api/drift/live/events?missionId=${encodeURIComponent(missionId)}`);
    source.onopen = () => setStatus("live");
    source.onmessage = message => {
      try {
        setEvent(JSON.parse(message.data) as LiveEvent);
        setStatus("live");
      } catch {
        setStatus("error");
      }
    };
    source.onerror = () => setStatus("error");
    return () => source.close();
  }, [missionId]);

  const detections = event?.detections ?? [];
  const statusLabel = status === "live" ? "CONNECTED" : status === "error" ? "RECONNECTING" : "WAITING FOR MEDIA X";
  const coordinates = useMemo(() => event?.latitude !== undefined && event.longitude !== undefined ? `${event.latitude.toFixed(6)}, ${event.longitude.toFixed(6)}` : "GPS not included", [event]);

  return <article className="panel live-detection-panel" aria-live="polite">
    <div className="panel-heading"><div><span className="eyebrow">ROBOFLOW · LIVE RESULTS</span><h2>Latest analyzed frame</h2></div><span className={`hardware-status ${status === "live" ? "connected" : "disconnected"}`}>{statusLabel}</span></div>
    {event?.imageUrl ? <div className="live-detection-image-wrap"><img src={event.imageUrl} alt={event.fileName ? `Analyzed ${event.fileName}` : "Latest analyzed Media X frame"} /><div className="live-detection-badges">{detections.map((detection, index) => <span key={`${detection.label}-${index}`} className="live-detection-badge">{detection.label ?? "defect"} · {Math.round((detection.confidence ?? 0) * 100)}%</span>)}</div></div> : <div className="live-detection-empty"><strong>Start Media X to receive frames</strong><span>The backend will store each frame, run the road-damage model, and publish the result here.</span></div>}
    <div className="live-detection-meta"><span>{event?.fileName ?? "No frame received"}</span><span>{coordinates}</span><span>{detections.length} detection{detections.length === 1 ? "" : "s"}</span></div>
    {event?.error && <p className="access-note">Last processing error: {event.error}</p>}
  </article>;
}
