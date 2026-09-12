import { describe, expect, it } from "vitest";
import { markerAccessibilityLabel, requestedSeverityFilter } from "./driftInteractions";

describe("DRIFT interaction contracts", () => {
  it("only proposes a severity filter for explicit map/filter questions", () => {
    expect(requestedSeverityFilter("Show only critical findings on the map")).toBe("critical");
    expect(requestedSeverityFilter("Filter high defects near the bridge")).toBe("high");
    expect(requestedSeverityFilter("Why is this finding critical?")).toBeNull();
  });

  it("keeps exact coordinates in marker accessibility text", () => {
    expect(markerAccessibilityLabel("Deck crack", "critical", 28.6139, 77.209)).toContain("28.6139, 77.209");
  });
});
