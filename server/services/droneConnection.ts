/**
 * Drone connection service.
 * Handles the flow: Drone → Laptop → Backend → ML → Backend → Frontend
 *
 * DJI Mini 3 Pro connects via DJI Fly app on phone,
 * phone connects to laptop via USB/WiFi, laptop sends media to this backend.
 */

export type DroneMediaPayload = {
  fileName: string;
  mimeType: string;
  base64: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  timestamp?: number;
  batteryPercent?: number;
  mediaKind: "photo" | "video";
  missionId?: number;
  cameraId?: string;
  headingDegrees?: number;
};

export type DroneConnectionStatus = {
  connected: boolean;
  droneModel: string;
  lastHeartbeat: string | null;
  batteryPercent: number | null;
  gpsLock: boolean;
  signalStrength: number | null;
  mode: string;
};

let lastConnection: DroneConnectionStatus = {
  connected: false,
  droneModel: "DJI Mini 3 Pro",
  lastHeartbeat: null,
  batteryPercent: null,
  gpsLock: false,
  signalStrength: null,
  mode: "standby",
};

/**
 * Update drone connection status from the laptop-side bridge.
 */
export function updateDroneStatus(status: Partial<DroneConnectionStatus>): DroneConnectionStatus {
  lastConnection = { ...lastConnection, ...status, lastHeartbeat: new Date().toISOString() };
  return lastConnection;
}

/**
 * Get current drone connection status.
 */
export function getDroneStatus(): DroneConnectionStatus {
  return lastConnection;
}

/**
 * Validate that a drone media payload has required fields.
 */
export function validateDroneMediaPayload(payload: unknown): {
  valid: boolean;
  message: string;
  value?: DroneMediaPayload;
} {
  if (!payload || typeof payload !== "object") {
    return { valid: false, message: "Payload is not an object" };
  }
  const p = payload as Record<string, unknown>;
  const required = ["fileName", "mimeType", "base64", "latitude", "longitude", "mediaKind"];
  const missing = required.filter((k) => p[k] === undefined || p[k] === null);
  if (missing.length) {
    return { valid: false, message: `Missing fields: ${missing.join(", ")}` };
  }
  if (typeof p.latitude !== "number" || typeof p.longitude !== "number") {
    return { valid: false, message: "latitude and longitude must be numbers" };
  }
  if (p.latitude < -90 || p.latitude > 90 || p.longitude < -180 || p.longitude > 180) {
    return { valid: false, message: "Invalid GPS coordinates" };
  }
  if (!["photo", "video"].includes(String(p.mediaKind))) {
    return { valid: false, message: "mediaKind must be photo or video" };
  }
  return { valid: true, message: "OK", value: payload as DroneMediaPayload };
}

/**
 * Generate the expected pipeline configuration for DJI Mini 3 Pro.
 */
export function getDroneIntegrationGuide() {
  return {
    drone: "DJI Mini 3 Pro",
    connectionFlow: [
      "1. Connect DJI Mini 3 Pro to phone via DJI Fly app",
      "2. Connect phone to laptop via USB cable or WiFi",
      "3. Laptop runs DRIFT Bridge software",
      "4. Bridge captures photos/videos from DJI camera feed",
      "5. Bridge sends media + GPS to DRIFT backend via API",
      "6. Backend runs ML inference on received media",
      "7. Detection results stored in database with GPS coordinates",
      "8. Results displayed on frontend map in real-time",
    ],
    apiEndpoint: "/api/drift/telemetry",
    evidenceEndpoint: "/api/drift/evidence",
    environmentVariables: {
      DRIFT_HARDWARE_ENDPOINT: "URL of the laptop bridge server",
      ML_INFERENCE_URL: "Optional external ML inference endpoint",
    },
    supportedMedia: ["image/jpeg", "image/png", "video/mp4", "video/quicktime"],
    maxFileSize: "50MB",
  };
}
