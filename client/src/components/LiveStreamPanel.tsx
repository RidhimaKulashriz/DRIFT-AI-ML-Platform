import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

const streamUrl = String(import.meta.env.VITE_DRIFT_LIVE_STREAM_URL ?? "").trim();

export function LiveStreamPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState(streamUrl ? "connecting" : "not-configured");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    let hls: Hls | null = null;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      video.addEventListener("loadedmetadata", () => setStatus("live"), { once: true });
    } else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true, liveSyncDurationCount: 2 });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => setStatus("live"));
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setStatus("error");
      });
    } else {
      setStatus("unsupported");
    }

    return () => {
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, []);

  return (
    <section className="panel live-stream-panel" aria-label="Live drone stream">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">DJI UAV · LIVE FEED</span>
          <h2>Live inspection stream</h2>
        </div>
        <span className={`status-chip ${status === "live" ? "status-active" : ""}`}>
          {status === "live" ? "LIVE" : status === "not-configured" ? "LOCAL ONLY" : status.toUpperCase()}
        </span>
      </div>
      {streamUrl ? (
        <video ref={videoRef} className="live-stream-video" controls autoPlay muted playsInline aria-label="Live DJI drone video" />
      ) : (
        <div className="empty-state live-stream-empty">
          <h3>Frontend stream URL is not configured</h3>
          <p>Set <code>VITE_DRIFT_LIVE_STREAM_URL</code> to a public HLS URL from MediaMTX or your streaming provider. The local laptop URL cannot be reached by Vercel.</p>
        </div>
      )}
    </section>
  );
}
