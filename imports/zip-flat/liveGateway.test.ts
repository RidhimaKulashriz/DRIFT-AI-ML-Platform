import { beforeEach, describe, expect, it } from "vitest";
import { acceptGatewayEvent, acceptGatewayHeartbeat, getLiveGatewayStatus, resetLiveGatewayStateForTests } from "./liveGateway";

describe("live gateway runtime contract", () => {
  beforeEach(() => resetLiveGatewayStateForTests());

  it("derives connected, delayed, and offline from measured heartbeat age", () => {
    const now = Date.now();
    expect(acceptGatewayHeartbeat({ sessionId: "session-001", gatewayId: "laptop-001", sequence: 1, capturedAt: now, phoneConnected: true, aircraftConnected: true, queueDepth: 2 }, now).valid).toBe(true);
    expect(getLiveGatewayStatus(now + 10_000).state).toBe("connected");
    expect(getLiveGatewayStatus(now + 30_000).state).toBe("delayed");
    expect(getLiveGatewayStatus(now + 90_000).state).toBe("offline");
  });

  it("acknowledges repeated event keys without counting a duplicate twice", () => {
    const now = Date.now();
    acceptGatewayHeartbeat({ sessionId: "session-001", gatewayId: "laptop-001", sequence: 1, capturedAt: now, phoneConnected: true, aircraftConnected: true, queueDepth: 0 }, now);
    const event = { sessionId: "session-001", gatewayId: "laptop-001", sequence: 2, eventType: "media" as const, idempotencyKey: "frame-000002" };
    expect(acceptGatewayEvent(event, now).duplicate).toBe(false);
    expect(acceptGatewayEvent(event, now + 10).duplicate).toBe(true);
    expect(getLiveGatewayStatus(now + 10).mediaAccepted).toBe(1);
  });

  it("rejects stale heartbeat sequences and unsafe identifiers", () => {
    const now = Date.now();
    acceptGatewayHeartbeat({ sessionId: "session-001", gatewayId: "laptop-001", sequence: 4, capturedAt: now, phoneConnected: true, aircraftConnected: false, queueDepth: 0 }, now);
    expect(acceptGatewayHeartbeat({ sessionId: "session-001", gatewayId: "laptop-001", sequence: 3, capturedAt: now, phoneConnected: true, aircraftConnected: false, queueDepth: 0 }, now)).toMatchObject({ valid: false });
    expect(acceptGatewayEvent({ sessionId: "bad id", gatewayId: "laptop-001", sequence: 1, eventType: "telemetry", idempotencyKey: "telemetry-1" }, now)).toMatchObject({ valid: false });
  });
});
