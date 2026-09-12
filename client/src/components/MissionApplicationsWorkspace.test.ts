import { describe, expect, it } from "vitest";
import { computeModel, modes, type MissionMode } from "./MissionApplicationsWorkspace";

const points = [
  { id: 1, name: "A", lat: "28.61710", lng: "77.21310", status: "ready" as const },
  { id: 2, name: "B", lat: "28.61902", lng: "77.21648", status: "review" as const },
  { id: 3, name: "C", lat: "28.61544", lng: "77.21970", status: "ready" as const },
];

describe("mission computation kernel", () => {
  it("exposes a distinct model for every application workspace", () => {
    const results = modes.map(mode => computeModel(mode.key as MissionMode, points, 48));
    expect(results).toHaveLength(7);
    expect(results.every(result => result.distance > 0 && result.trace.length >= 3)).toBe(true);
    expect(results[1]!.trace.some(step => step.includes("dependency graph"))).toBe(true);
    expect(results[3]!.trace.some(step => step.includes("temporal capture"))).toBe(true);
    expect(results[4]!.trace.some(step => step.includes("provenance chain"))).toBe(true);
    expect(results[6]!.trace.some(step => step.includes("route safety"))).toBe(true);
  });

  it("reacts to observation state and scenario intensity", () => {
    const baseline = computeModel("military", points, 20);
    const highRisk = computeModel("military", points.map(point => ({ ...point, status: "risk" as const })), 90);
    expect(highRisk.metrics.readiness).toBeLessThan(baseline.metrics.readiness!);
    expect(highRisk.metrics.battery).toBeLessThan(baseline.metrics.battery!);
    expect(highRisk.trace.some(step => step.includes("restricted-zone"))).toBe(true);
  });
});
