import { describe, expect, it } from "vitest";
import { affectedDerivedNodes, compareState, detectChangePoint } from "./domainEvents";

describe("DRIFT domain-event computation", () => {
  it("invalidates only descendants of the changed evidence node", () => {
    const nodes = affectedDerivedNodes("EvidenceRejected");
    expect(nodes).toContain("asset_risk");
    expect(nodes).toContain("inspection_priority");
    expect(nodes).toContain("mission_priority");
  });

  it("computes reusable temporal state deltas", () => {
    const delta = compareState([{ id: 1, value: "same" }, { id: 2, value: "old" }], [{ id: 1, value: "changed" }, { id: 3, value: "new" }], "id");
    expect(delta.changed).toHaveLength(1);
    expect(delta.added).toHaveLength(1);
    expect(delta.removed).toHaveLength(1);
  });

  it("detects a supported statistical mean shift instead of a raw threshold", () => {
    const values = Array.from({ length: 8 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 0, index + 1)), value: index < 4 ? 10 : 24 }));
    const result = detectChangePoint(values);
    expect(result.supported).toBe(true);
    expect(result.direction).toBe("increasing");
    expect(result.changePoint).not.toBeNull();
  });
});
