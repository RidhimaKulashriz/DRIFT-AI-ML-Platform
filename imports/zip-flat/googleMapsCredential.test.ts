import { describe, expect, it } from "vitest";

describe("Google Maps preview credential", () => {
  it("loads the Maps JavaScript bootstrap without an invalid-key response", async () => {
    const key = process.env.VITE_GOOGLE_MAPS_API_KEY;
    expect(key, "VITE_GOOGLE_MAPS_API_KEY must be configured for the managed preview").toBeTruthy();

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key!)}&v=weekly`,
    );
    expect(response.ok, `Maps JavaScript bootstrap returned ${response.status}`).toBe(true);

    const script = await response.text();
    expect(script).not.toContain("InvalidKeyMapError");
  }, 15000);
});
