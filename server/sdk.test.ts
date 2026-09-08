import { afterEach, describe, expect, it, vi } from "vitest";
import { sdk } from "./_core/sdk";

describe("SDK session verification", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("quietly accepts an anonymous request without a session cookie", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(sdk.verifySession(undefined)).resolves.toBeNull();
    expect(warning).not.toHaveBeenCalled();
  });
  it("quietly rejects a token issued with an unsupported JWT algorithm", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const foreignToken = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmb3JlaWduIn0.invalid";
    await expect(sdk.verifySession(foreignToken)).resolves.toBeNull();
    expect(warning).not.toHaveBeenCalled();
  });
});
