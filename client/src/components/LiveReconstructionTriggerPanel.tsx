import { useEffect, useMemo, useState } from "react";
import { Layers3, Play, ScanLine } from "lucide-react";

type Detection = { label?: string; confidence?: number };
type ReconstructionTrigger = { threshold?: number; confidence?: number; captureWindowSeconds?: number; status?: string };
type LiveEvent = {
  type?: string;
  fileName?: string;
  detections?: Detection[];
  reconstructionTrigger?: ReconstructionTrigger;
  occurredAt?: string;
};

const backendOrigin = (import.meta.env.VITE_BACKEND_URL || "https://drift-node-api.onrender.com").replace(/\/$/, "");
const CRACK_THRESHOLD = 0.6;

function isCrack(label?: string) {
  return Boolean(label && /crack|fissure|fracture/i.test(label));
}

export function LiveReconstructionTriggerPanel({ missionId, onOpenLab }: { missionId: number; onOpenLab: () => void }) {
  const [status, setStatus] = useState<"waiting" | "armed" | "capturing" | "error">("waiting");
  const [confidence, setConfidence] = useState(0);
  const [frameName, setFrameName] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!missionId) return;
    setStatus("waiting");
    setConfidence(0);
    setFrameName("");
    setStartedAt(null);
    const source = new EventSource(`${backendOrigin}/api/drift/live/events?missionId=${encodeURIComponent(missionId)}`);
    source.onopen = () => setStatus(current => current === "waiting" ? "armed" : current);
    source.onmessage = message => {
      try {
        const event = JSON.parse(message.data) as LiveEvent;
        const crack = (event.detections ?? []).find(detection => isCrack(detection.label) && Number(detection.confidence ?? 0) >= CRACK_THRESHOLD);
        if (event.reconstructionTrigger || crack) {
          const nextConfidence = event.reconstructionTrigger?.confidence ?? crack?.confidence ?? 0;
          setConfidence(nextConfidence);
          setFrameName(event.fileName ?? "live crack frame");
          setStartedAt(previous => previous ?? Date.now());
          setStatus("capturing");
        }
      } catch {
        setStatus("error");
      }
    };
    source.onerror = () => setStatus(current => current === "capturing" ? current : "error");
    return () => source.close();
  }, [missionId]);

  const elapsed = useMemo(() => startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0, [startedAt, status]);
  const copy = status === "capturing"
    ? "Crack confirmed. The bridge should preserve the surrounding live video window for multi-view reconstruction."
    : status === "armed"
      ? "Listening for a crack detection at or above 60% confidence."
      : status === "error"
        ? "Live event connection interrupted; reconstruction has not been claimed."
        : "Waiting for the drone and ML inference stream.";

  return <article className="panel live-reconstruction-trigger" aria-live="polite">
    <div className="panel-heading">
      <div><span className="eyebrow">EVENT-TRIGGERED PHOTOGRAMMETRY</span><h2>Crack reconstruction capture</h2></div>
      <span className={`hardware-status ${status === "capturing" ? "connected" : status === "error" ? "disconnected" : ""}`}>{status === "capturing" ? "CAPTURE WINDOW ACTIVE" : status === "armed" ? "ARMED" : status === "error" ? "RECONNECTING" : "WAITING"}</span>
    </div>
    <div className="live-reconstruction-trigger-body">
      <div className="live-reconstruction-icon"><ScanLine /></div>
      <div><strong>{status === "capturing" ? `Reconstruction triggered · ${Math.round(confidence * 100)}% crack confidence` : "Automatic reconstruction trigger"}</strong><p>{copy}</p>{frameName && <small>Trigger frame: {frameName}{elapsed ? ` · ${elapsed}s elapsed` : ""}</small>}</div>
    </div>
    <div className="live-reconstruction-actions"><span><Layers3 /> Requires overlapping video + camera pose/IMU</span><button type="button" className="primary-action" onClick={onOpenLab}><Play /> OPEN RECONSTRUCTION LAB</button></div>
  </article>;
}
