import crypto from "node:crypto";

export type HardwareStatus = "offline" | "connecting" | "connected" | "degraded" | "retrying";

export type HardwareConnection = {
  adapter: "http-webhook" | "mavlink-bridge" | "rtsp-media";
  status: HardwareStatus;
  endpoint?: string;
  lastHeartbeatAt?: number;
  retryAfterSeconds?: number;
  operatorMessage: string;
};

export type TelemetryPayload = {
  missionId: number;
  latitude: number;
  longitude: number;
  altitude: number;
  speedMps: number;
  batteryPercent: number;
  timestamp: number;
};

export function getHardwareConnection(endpoint?: string): HardwareConnection {
  if (!endpoint) {
    return {
      adapter: "http-webhook",
      status: "offline",
      operatorMessage: "No compatible hardware endpoint configured. Simulator mode is available; no flight commands are issued.",
    };
  }
  return {
    adapter: endpoint.includes("rtsp") ? "rtsp-media" : endpoint.includes("mavlink") ? "mavlink-bridge" : "http-webhook",
    status: "degraded",
    endpoint,
    retryAfterSeconds: 15,
    operatorMessage: "Bridge endpoint is configured but not independently validated. DRIFT accepts telemetry and media only; it never arms, launches, navigates, or commands an aircraft.",
  };
}

export async function probeHardwareConnection(endpoint = process.env.DRIFT_HARDWARE_ENDPOINT): Promise<HardwareConnection> {
  const base = getHardwareConnection(endpoint);
  if (!endpoint) return base;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(endpoint, { method: "GET", signal: controller.signal, headers: { accept: "application/json,text/plain" } });
    clearTimeout(timeout);
    if (!response.ok) return { ...base, status: "retrying", retryAfterSeconds: 30, operatorMessage: `Hardware bridge responded ${response.status}. Retry the health check in 30 seconds; simulator mode remains available.` };
    return { ...base, status: "connected", lastHeartbeatAt: Date.now(), operatorMessage: "Bridge health check passed. Verify telemetry and media with the bench-test sequence before any live operation." };
  } catch {
    return { ...base, status: "retrying", retryAfterSeconds: 30, operatorMessage: "Hardware bridge could not be reached. Retry on the next status request; simulator mode remains available." };
  }
}

export function validateTelemetryPayload(payload: unknown): { valid: boolean; message: string; value?: TelemetryPayload } {
  if (!payload || typeof payload !== "object") return { valid: false, message: "Telemetry payload must be a JSON object." };
  const value = payload as Record<string, unknown>;
  const required = ["missionId", "latitude", "longitude", "altitude", "speedMps", "batteryPercent", "timestamp"];
  const missing = required.filter(key => value[key] === undefined || value[key] === null);
  if (missing.length) return { valid: false, message: `Missing required telemetry fields: ${missing.join(", ")}` };
  const numericFields = ["missionId", "latitude", "longitude", "altitude", "speedMps", "batteryPercent", "timestamp"];
  if (numericFields.some(key => typeof value[key] !== "number" || !Number.isFinite(value[key]))) return { valid: false, message: "Telemetry numeric fields must be finite numbers." };
  const telemetry = value as unknown as TelemetryPayload;
  if (!Number.isInteger(telemetry.missionId) || telemetry.missionId <= 0) return { valid: false, message: "missionId must be a positive integer." };
  if (telemetry.latitude < -90 || telemetry.latitude > 90 || telemetry.longitude < -180 || telemetry.longitude > 180) return { valid: false, message: "latitude or longitude is outside valid geographic bounds." };
  if (telemetry.altitude < 0 || telemetry.speedMps < 0) return { valid: false, message: "altitude and speedMps cannot be negative." };
  if (telemetry.batteryPercent < 0 || telemetry.batteryPercent > 100) return { valid: false, message: "batteryPercent must be between 0 and 100." };
  if (!Number.isInteger(telemetry.timestamp) || telemetry.timestamp < 1_000_000_000_000 || telemetry.timestamp > Date.now() + 5 * 60_000) return { valid: false, message: "timestamp must be a millisecond epoch within a five-minute future-skew window." };
  return { valid: true, message: "Telemetry payload passed adapter validation.", value: telemetry };
}

export function authorizeBridgeToken(providedToken: string | undefined, configuredToken = process.env.DRIFT_INGEST_TOKEN): boolean {
  if (!configuredToken || !providedToken) return false;
  const expected = Buffer.from(configuredToken);
  const provided = Buffer.from(providedToken);
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}
