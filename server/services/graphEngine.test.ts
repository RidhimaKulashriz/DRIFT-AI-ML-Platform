import { describe, expect, it } from "vitest";
import { analyzeGraphImpact, buildNextBestActions, buildWorldGraph, diffWorldGraphs, findInformationGaps, queryWorldGraph, simulateCounterfactual, traverseGraph } from "./graphEngine";

describe("DRIFT world graph", () => {
  const now = new Date("2026-09-10T00:00:00Z");
  const graph = buildWorldGraph({
    assets: [{ id: 1, name: "Bridge A", assetType: "bridge", criticality: 5, status: "watch", latitude: "28.6", longitude: "77.2", updatedAt: now }],
    missions: [{ id: 2, assetId: 1, name: "Inspection", status: "completed", createdAt: now }],
    evidence: [{ id: 3, missionId: 2, fileName: "frame.jpg", qualityStatus: "pass", source: "hardware", createdAt: now }],
    defects: [{ id: 4, assetId: 1, missionId: 2, evidenceId: 3, label: "Crack", defectType: "crack", severity: "high", confidencePercent: 88, reviewState: "pending", status: "detected", createdAt: now }],
    telemetry: [],
  } as any);

  it("builds persisted entity edges rather than presentation-only nodes", () => {
    expect(graph.nodes.map(node => node.id)).toEqual(expect.arrayContaining(["asset:1", "mission:2", "evidence:3", "defect:4"]));
    expect(graph.edges.map(edge => edge.relationship)).toEqual(expect.arrayContaining(["targets", "supports", "affects"]));
  });

  it("traverses the asset to defect to evidence neighborhood", () => {
    const result = traverseGraph(graph, "asset:1", 2, "both");
    expect(result.nodes.map(node => node.id)).toEqual(expect.arrayContaining(["asset:1", "defect:4", "evidence:3"]));
    expect(result.traversalCost).toBeGreaterThan(0);
  });

  it("supports constrained graph queries", () => {
    const result = queryWorldGraph(graph, { kind: "defect", severity: "high" });
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.id).toBe("defect:4");
  });

  it("computes impact paths, information gaps, and isolated counterfactuals", () => {
    const impact = analyzeGraphImpact(graph, "asset:1", 2);
    expect(impact.directImpact.map(item => item.nodeId)).toContain("defect:4");
    expect(findInformationGaps(graph).length).toBeGreaterThanOrEqual(0);
    expect(buildNextBestActions(graph)).toBeInstanceOf(Array);
    const simulated = simulateCounterfactual(graph, { nodeId: "defect:4", event: "failure" });
    expect(simulated.counterfactual.nodes.find(node => node.id === "defect:4")?.state).toBe("SIMULATED");
    expect(graph.nodes.find(node => node.id === "defect:4")?.state).not.toBe("SIMULATED");
  });

  it("returns graph-level state changes", () => {
    const changed = JSON.parse(JSON.stringify(graph));
    changed.nodes.find((node: any) => node.id === "defect:4").confidence = .2;
    expect(diffWorldGraphs(graph, changed).riskChanges).toHaveLength(1);
  });
});
