export type LiveGatewayState = "offline" | "connected" | "delayed";

type GatewayHeartbeat = {
  sessionId: string;
  gatewayId: string;
  sequence: number;
  capturedAt: number;
  phoneConnected: boolean;
  aircraftConnected: boolean;
  queueDepth: number;
};

type GatewaySession = GatewayHeartbeat & { receivedAt: number; telemetryAccepted: number; mediaAccepted: number };

const sessions = new Map<string, GatewaySession>();
const recentEvents = new Map<string, number>();
const EVENT_TTL_MS = 6 * 60 * 60 * 1000;

function safeIdentifier(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,79}$/.test(value);
}

function cleanup(now: number) {
  recentEvents.forEach((seenAt, key) => { if (seenAt + EVENT_TTL_MS < now) recentEvents.delete(key); });
  sessions.forEach((session, key) => { if (session.receivedAt + EVENT_TTL_MS < now) sessions.delete(key); });
}

export function validateGatewayHeartbeat(payload: unknown): { valid: true; value: GatewayHeartbeat } | { valid: false; message: string } {
  if (!payload || typeof payload !== "object") return { valid: false, message: "Gateway heartbeat must be a JSON object." };
  const value = payload as Record<string, unknown>;
  if (!safeIdentifier(value.sessionId) || !safeIdentifier(value.gatewayId)) return { valid: false, message: "sessionId and gatewayId must be safe non-empty identifiers." };
  if (!Number.isInteger(value.sequence) || Number(value.sequence) < 0) return { valid: false, message: "sequence must be a non-negative integer." };
  if (!Number.isInteger(value.capturedAt) || Number(value.capturedAt) < Date.now() - 24 * 60 * 60 * 1000 || Number(value.capturedAt) > Date.now() + 5 * 60_000) return { valid: false, message: "capturedAt must be a recent millisecond epoch." };
  if (typeof value.phoneConnected !== "boolean" || typeof value.aircraftConnected !== "boolean") return { valid: false, message: "phoneConnected and aircraftConnected must be booleans." };
  if (!Number.isInteger(value.queueDepth) || Number(value.queueDepth) < 0 || Number(value.queueDepth) > 10_000) return { valid: false, message: "queueDepth must be an integer from 0 to 10000." };
  return { valid: true, value: value as GatewayHeartbeat };
}

export function acceptGatewayHeartbeat(payload: unknown, now = Date.now()) {
  const validation = validateGatewayHeartbeat(payload);
  if (!validation.valid) return validation;
  cleanup(now);
  const previous = sessions.get(validation.value.sessionId);
  if (previous && validation.value.sequence < previous.sequence) return { valid: false as const, message: "Stale heartbeat sequence rejected." };
  const next: GatewaySession = { ...validation.value, receivedAt: now, telemetryAccepted: previous?.telemetryAccepted ?? 0, mediaAccepted: previous?.mediaAccepted ?? 0 };
  sessions.set(next.sessionId, next);
  return { valid: true as const, duplicate: Boolean(previous && validation.value.sequence === previous.sequence), acknowledgement: { sessionId: next.sessionId, sequence: next.sequence, receivedAt: now } };
}

export function acceptGatewayEvent(input: { sessionId: string; gatewayId: string; sequence: number; eventType: "telemetry" | "media"; idempotencyKey: string }, now = Date.now()) {
  cleanup(now);
  if (!safeIdentifier(input.sessionId) || !safeIdentifier(input.gatewayId) || !safeIdentifier(input.idempotencyKey) || !Number.isInteger(input.sequence) || input.sequence < 0) return { valid: false as const, message: "Live gateway event headers are invalid." };
  const eventKey = `${input.sessionId}:${input.eventType}:${input.idempotencyKey}`;
  if (recentEvents.has(eventKey)) return { valid: true as const, duplicate: true, acknowledgement: { sessionId: input.sessionId, sequence: input.sequence, eventType: input.eventType, receivedAt: now } };
  recentEvents.set(eventKey, now);
  const current = sessions.get(input.sessionId);
  if (current) sessions.set(input.sessionId, { ...current, receivedAt: now, telemetryAccepted: current.telemetryAccepted + (input.eventType === "telemetry" ? 1 : 0), mediaAccepted: current.mediaAccepted + (input.eventType === "media" ? 1 : 0) });
  return { valid: true as const, duplicate: false, acknowledgement: { sessionId: input.sessionId, sequence: input.sequence, eventType: input.eventType, receivedAt: now } };
}

export function getLiveGatewayStatus(now = Date.now()) {
  cleanup(now);
  const latest = Array.from(sessions.values()).sort((a, b) => b.receivedAt - a.receivedAt)[0];
  if (!latest) return { state: "offline" as LiveGatewayState, message: "No authenticated Android/laptop gateway heartbeat has been received in this backend process.", lastHeartbeatAt: null, queueDepth: null, phoneConnected: false, aircraftConnected: false, telemetryAccepted: 0, mediaAccepted: 0 };
  const ageMs = Math.max(0, now - latest.receivedAt);
  const state: LiveGatewayState = ageMs <= 15_000 ? "connected" : ageMs <= 60_000 ? "delayed" : "offline";
  return { state, message: state === "connected" ? "Authenticated gateway heartbeat is current." : state === "delayed" ? "Gateway heartbeat is delayed; queued uploads may still retry." : "Gateway heartbeat is stale; no live connection is claimed.", lastHeartbeatAt: latest.receivedAt, heartbeatAgeMs: ageMs, queueDepth: latest.queueDepth, phoneConnected: latest.phoneConnected, aircraftConnected: latest.aircraftConnected, telemetryAccepted: latest.telemetryAccepted, mediaAccepted: latest.mediaAccepted };
}

export function resetLiveGatewayStateForTests() {
  sessions.clear();
  recentEvents.clear();
}
