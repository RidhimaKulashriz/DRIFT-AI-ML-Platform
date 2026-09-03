import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

const configuredStreamUrl = String(import.meta.env.VITE_DRIFT_LIVE_STREAM_URL ?? "").trim();
const streamUrl = configuredStreamUrl;
const uploadedDemoVideoUrl = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663855346163/OqjPCGreoHnnniLg.mp4";
const uploadedDemoPosterUrl = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663855346163/KxynhPEtQoLZhrFd.jpg";
const isAnnotatedFeed = streamUrl.includes("drift-annotated") || streamUrl.includes("annotated");

export function LiveStreamPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState(streamUrl ? "connecting" : "demo");

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

  const hasLiveFeed = Boolean(streamUrl);

  return (
    <section className="panel live-stream-panel" aria-label="Live drone stream">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">DJI UAV · {hasLiveFeed ? "LIVE FEED" : "UPLOADED VIDEO"}</span>
          <h2>{hasLiveFeed ? "Live inspection stream" : "Inspection livestream preview"}</h2>
        </div>
        <span className={`status-chip ${status === "live" ? "status-active" : ""}`}>
          {status === "live" ? "LIVE" : status === "demo" ? "VIDEO PREVIEW" : status === "not-configured" ? "LOCAL ONLY" : status.toUpperCase()}
        </span>
      </div>
      {hasLiveFeed ? (
        <>
          <video ref={videoRef} className="live-stream-video" controls autoPlay muted playsInline aria-label={isAnnotatedFeed ? "Live DJI drone video with ML annotations" : "Live DJI drone video"} />
          <p className="stream-caption">{isAnnotatedFeed ? "Browser feed: live DJI video with ML detection overlays" : "Browser feed: live DJI video"}</p>
        </>
      ) : (
        <>
          <video className="live-stream-video" controls autoPlay muted loop playsInline preload="metadata" poster={uploadedDemoPosterUrl} src={uploadedDemoVideoUrl} aria-label="Uploaded DJI inspection video preview" />
          <p className="stream-caption">Uploaded inspection video preview. This is recorded footage, not a live camera feed; configure <code>VITE_DRIFT_LIVE_STREAM_URL</code> to switch to HLS livestreaming.</p>
        </>
      )}
    </section>
  );
}

export { uploadedDemoPosterUrl, uploadedDemoVideoUrl };
