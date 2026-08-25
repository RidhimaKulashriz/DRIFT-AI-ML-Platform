import { describe, expect, it } from "vitest";
import { authorizeBridgeToken } from "./services/hardwareAdapter";

describe("configured DRIFT bridge secret", () => {
  it("authorizes the configured token and rejects altered credentials", () => {
    const configured = process.env.DRIFT_INGEST_TOKEN;
    expect(configured).toBeTruthy();
    expect(authorizeBridgeToken(configured, configured)).toBe(true);
    expect(authorizeBridgeToken(`${configured}x`, configured)).toBe(false);
  });
});
