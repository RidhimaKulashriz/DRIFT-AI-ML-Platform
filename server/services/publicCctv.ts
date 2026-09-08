export type PublicCamera = {
  id: string;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  area: string;
  locationPrecision: "exact" | "city_reference";
  zoneLabel: string;
  city: "Delhi" | "NCR";
  streamType: "hls" | "mjpeg" | "snapshot" | "webrtc" | "youtube" | "webcam_page";
  streamUrl: string;
  sourceUrl: string;
  status: "live" | "offline" | "unknown";
  lastChecked?: string;
  verifiedAt?: string;
  provider: string;
  accessClassification: "authorized_public" | "public_webcam";
  sourceKind: "authorized-live-stream" | "public-webcam-page";
};

type CameraConfig = Omit<PublicCamera, "status" | "lastChecked"> & { verifiedAt: string };

const EMPTY_MESSAGE = "No authorized in-app Delhi/NCR camera image feeds are configured. Add an approved MJPEG, HLS, WebRTC, or snapshot endpoint; provider webpages and redirect links are not displayed.";
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_MS = 30_000;
let cache: { expiresAt: number; cameras: PublicCamera[] } = { expiresAt: 0, cameras: [] };
let inflight: Promise<PublicCamera[]> | null = null;
const VERIFIED_PUBLIC_WEBCAMS: CameraConfig[] = [];

function isValidConfig(value: unknown): value is CameraConfig {
  if (!value || typeof value !== "object") return false;
  const camera = value as Partial<CameraConfig>;
  return (
    typeof camera.id === "string" &&
    typeof camera.name === "string" &&
    typeof camera.displayName === "string" &&
    typeof camera.latitude === "number" &&
    typeof camera.longitude === "number" &&
    camera.latitude >= 28.3 && camera.latitude <= 29.0 &&
    camera.longitude >= 76.7 && camera.longitude <= 77.6 &&
    (camera.city === "Delhi" || camera.city === "NCR") &&
    typeof camera.area === "string" &&
    (camera.locationPrecision === "exact" || camera.locationPrecision === "city_reference") &&
    typeof camera.zoneLabel === "string" &&
    ["hls", "mjpeg", "snapshot", "webrtc", "youtube", "webcam_page"].includes(String(camera.streamType)) &&
    typeof camera.streamUrl === "string" &&
    typeof camera.sourceUrl === "string" &&
    camera.sourceUrl.startsWith("https://") &&
    typeof camera.provider === "string" &&
    typeof camera.verifiedAt === "string"
  );
}

function configuredCameras(): CameraConfig[] {
  const raw = process.env.DELHI_AUTHORIZED_CAMERAS_JSON?.trim();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidConfig) : [];
  } catch (error) {
    console.warn("[public-cctv] DELHI_AUTHORIZED_CAMERAS_JSON is invalid:", error instanceof Error ? error.message : error);
    return [];
  }
}

async function probe(camera: CameraConfig): Promise<PublicCamera> {
  const lastChecked = new Date().toISOString();
  const isPublicWebcam = camera.streamType === "webcam_page";
  const base = { ...camera, lastChecked, sourceKind: isPublicWebcam ? "public-webcam-page" as const : "authorized-live-stream" as const, accessClassification: isPublicWebcam ? "public_webcam" as const : "authorized_public" as const };
  if (camera.streamType === "webrtc" || camera.streamType === "youtube" || isPublicWebcam) {
    return { ...base, status: "unknown" };
  }
  try {
    const response = await fetch(camera.streamUrl, {
      method: "GET",
      headers: { Accept: camera.streamType === "hls" ? "application/vnd.apple.mpegurl, application/x-mpegURL, */*" : "multipart/x-mixed-replace, video/*, */*" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const validMedia = camera.streamType === "hls"
      ? contentType.includes("mpegurl") || camera.streamUrl.includes(".m3u8")
      : camera.streamType === "snapshot"
        ? contentType.startsWith("image/")
        : contentType.includes("multipart") || contentType.startsWith("video/");
    return { ...base, status: response.ok && validMedia ? "live" : "offline" };
  } catch {
    return { ...base, status: "offline" };
  }
}

export async function listPublicCctv(): Promise<PublicCamera[]> {
  if (cache.expiresAt > Date.now()) return cache.cameras;
  if (inflight) return inflight;
  inflight = Promise.all([...VERIFIED_PUBLIC_WEBCAMS, ...configuredCameras()].map(probe))
    .then(cameras => {
      cache = { cameras, expiresAt: Date.now() + CACHE_MS };
      return cameras;
    })
    .catch(error => {
      console.warn("[public-cctv] camera health check failed:", error instanceof Error ? error.message : error);
      cache = { cameras: [], expiresAt: Date.now() + CACHE_MS };
      return [];
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export function publicCctvMessage() {
  return EMPTY_MESSAGE;
}
