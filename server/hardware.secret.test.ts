import { describe, expect, it } from "vitest";
import { authorizeBridgeToken } from "./services/hardwareAdapter";

describe("configured DRIFT bridge secret", () => {
  it.skipIf(process.env.DRIFT_RUN_EXTERNAL_CONNECTIVITY_TESTS !== "true" || !process.env.DRIFT_INGEST_TOKEN)("authorizes the configured token and rejects altered credentials", () => {
    const configured = process.env.DRIFT_INGEST_TOKEN;
    expect(configured).toBeTruthy();
    expect(authorizeBridgeToken(configured, configured)).toBe(true);
    expect(authorizeBridgeToken(`${configured}x`, configured)).toBe(false);
  });
});
