import { afterEach, describe, expect, it, vi } from "vitest";
import { getHardwareConnection, probeHardwareConnection, validateTelemetryPayload } from "./hardwareAdapter";

afterEach(() => vi.unstubAllGlobals());

const validTelemetry = () => ({ missionId: 42, latitude: 28.6139, longitude: 77.209, altitude: 44, speedMps: 7.5, batteryPercent: 87, timestamp: Date.now() });

describe("DRIFT receive-only hardware adapter", () => {
  it("accepts coordinate-bearing telemetry while preserving the normalized payload", () => {
    const result = validateTelemetryPayload(validTelemetry());
    expect(result).toEqual(expect.objectContaining({ valid: true, value: expect.objectContaining({ missionId: 42, latitude: 28.6139, longitude: 77.209 }) }));
  });

  it("rejects invalid geographic data and flight-control attempts", () => {
    expect(validateTelemetryPayload({ ...validTelemetry(), latitude: 100 })).toEqual(expect.objectContaining({ valid: false, message: expect.stringContaining("geographic bounds") }));
    expect(validateTelemetryPayload({ ...validTelemetry(), arm: true })).toEqual(expect.objectContaining({ valid: false, message: expect.stringContaining("receive-only") }));
  });

  it("reports a retry-safe state after bridge failure and remains explicit about no-command behavior", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const connection = await probeHardwareConnection("http://mavlink-bridge.local/health");
    expect(connection).toEqual(expect.objectContaining({ adapter: "mavlink-bridge", status: "retrying", retryAfterSeconds: 30 }));
    expect(getHardwareConnection("http://mavlink-bridge.local/health").operatorMessage).toContain("never arms");
  });

  it("records a connected heartbeat only after a successful operator bridge health check", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const connection = await probeHardwareConnection("http://mavlink-bridge.local/health");
    expect(connection).toEqual(expect.objectContaining({ status: "connected", adapter: "mavlink-bridge", lastHeartbeatAt: expect.any(Number) }));
  });
});
