import { assets, defects, evidence, missions, telemetry } from "../../drizzle/schema";

type Asset = typeof assets.$inferSelect;
type Defect = typeof defects.$inferSelect;
type Evidence = typeof evidence.$inferSelect;
type Mission = typeof missions.$inferSelect;
type Telemetry = typeof telemetry.$inferSelect;

export type IntelligenceSnapshot = {
  generatedAt: string;
  algorithm: "drift-intelligence-v1";
  dataQuality: { score: number; issues: string[]; checked: number };
  uncertainty: { derivedConfidence: number; status: "high_confidence" | "low_confidence" | "conflicting_evidence" | "insufficient_evidence" | "stale_evidence"; drivers: string[] };
  fusion: { agreement: number; conflictCount: number; sources: Array<{ source: string; observations: number; reliability: number }> };
  eventGraph: Array<{ id: string; type: string; label: string; from?: string; relation?: "causes" | "supports" | "affects" | "responds_to"; confidence: number }>;
  hotspots: Array<{ latitude: number; longitude: number; intensity: number; evidenceCount: number; persistence: "emerging" | "persistent" | "isolated" }>;
  inspectionTargets: Array<{ assetId: number; assetName: string; priority: number; informationGain: number; riskReduction: number; uncertaintyReduction: number; estimatedCost: number; reason: string }>;
  trajectories: Array<{ assetId: number; assetName: string; supported: boolean; currentRisk: number; projectedRisk: number; horizonDays: number; confidence: number; limitation?: string }>;
  lineage: Array<{ conclusionId: string; conclusion: string; supportingEvidenceIds: number[]; defectIds: number[]; assetId: number; confidence: number }>;
};

type SnapshotInput = { assets: Asset[]; defects: Defect[]; evidence: Evidence[]; missions: Mission[]; telemetry: Telemetry[] };

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));
const severityWeight: Record<string, number> = { low: 15, medium: 35, high: 65, critical: 90 };
const daysSince = (date: Date | null | undefined) => date ? Math.max(0, (Date.now() - date.getTime()) / 86_400_000) : 999;
const haversine = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const rad = Math.PI / 180; const dLat = (bLat - aLat) * rad; const dLng = (bLng - aLng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

export function evaluateDataQuality(input: SnapshotInput) {
  const issues: string[] = [];
  const seenEvidence = new Set<string>();
  for (const item of input.evidence) {
    if (!item.latitude || !item.longitude) issues.push(`evidence:${item.id}:missing_gps`);
    if (!item.capturedAt) issues.push(`evidence:${item.id}:missing_timestamp`);
    if (item.sha256 && seenEvidence.has(item.sha256)) issues.push(`evidence:${item.id}:duplicate_hash`);
    if (item.sha256) seenEvidence.add(item.sha256);
  }
  for (const defect of input.defects) {
    if (!defect.evidenceId) issues.push(`defect:${defect.id}:missing_evidence_link`);
    if (!input.assets.some(asset => asset.id === defect.assetId)) issues.push(`defect:${defect.id}:orphan_asset`);
  }
  for (const point of input.telemetry) {
    const lat = Number(point.latitude); const lng = Number(point.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) issues.push(`telemetry:${point.id}:invalid_coordinates`);
  }
  const checked = Math.max(1, input.evidence.length * 2 + input.defects.length * 2 + input.telemetry.length);
  return { score: clamp(100 - issues.length / checked * 100), issues, checked };
}

function buildFusion(input: SnapshotInput) {
  const sources = [
    { source: "rgb/video evidence", observations: input.evidence.length, reliability: input.evidence.length ? clamp(82 - input.evidence.filter(item => item.qualityStatus === "fail").length * 15) : 0 },
    { source: "computer vision defects", observations: input.defects.length, reliability: input.defects.length ? clamp(input.defects.reduce((sum, item) => sum + item.confidencePercent, 0) / input.defects.length) : 0 },
    { source: "telemetry", observations: input.telemetry.length, reliability: input.telemetry.length ? clamp(91 - input.telemetry.filter(item => daysSince(item.capturedAt) > 7).length * 20) : 0 },
    { source: "operator review", observations: input.defects.filter(item => item.reviewState !== "pending").length, reliability: 95 },
  ];
  const conflictCount = input.defects.filter(item => item.reviewState === "overridden" || item.reviewState === "rejected").length + input.evidence.filter(item => item.qualityStatus === "fail").length;
  const active = sources.filter(item => item.observations > 0);
  const agreement = active.length ? clamp(active.reduce((sum, item) => sum + item.reliability, 0) / active.length - conflictCount * 8) : 0;
  return { agreement, conflictCount, sources };
}

function buildEventGraph(input: SnapshotInput) {
  const graph: IntelligenceSnapshot["eventGraph"] = [];
  for (const defect of input.defects) {
    const evidenceId = defect.evidenceId ? `evidence:${defect.evidenceId}` : undefined;
    const defectId = `defect:${defect.id}`;
    if (evidenceId) graph.push({ id: evidenceId, type: "OBSERVATION", label: `Evidence ${defect.evidenceId}`, confidence: 88 });
    graph.push({ id: defectId, type: "FINDING", label: `${defect.label} · ${defect.severity}`, from: evidenceId, relation: "supports", confidence: defect.confidencePercent });
    const assetId = `asset:${defect.assetId}`;
    graph.push({ id: assetId, type: "STATE_CHANGE", label: `Asset ${defect.assetId} risk updated`, from: defectId, relation: "affects", confidence: clamp(defect.confidencePercent * .8) });
    if (defect.reviewState === "approved" || defect.status === "verified") graph.push({ id: `response:${defect.id}`, type: "RESPONSE", label: "Engineer verification required for action", from: assetId, relation: "responds_to", confidence: 90 });
  }
  return graph;
}

function buildHotspots(input: SnapshotInput) {
  const bins = new Map<string, { lat: number; lng: number; count: number; ages: number[] }>();
  for (const defect of input.defects) {
    const lat = Number(defect.latitude); const lng = Number(defect.longitude); if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = `${lat.toFixed(2)}:${lng.toFixed(2)}`; const current = bins.get(key) ?? { lat: 0, lng: 0, count: 0, ages: [] };
    current.lat += lat; current.lng += lng; current.count += 1; current.ages.push(daysSince(defect.createdAt)); bins.set(key, current);
  }
  return Array.from(bins.values()).map(bin => ({ latitude: bin.lat / bin.count, longitude: bin.lng / bin.count, intensity: clamp(bin.count * 22), evidenceCount: bin.count, persistence: bin.count >= 3 ? "persistent" as const : bin.ages.some((age: number) => age < 14) ? "emerging" as const : "isolated" as const })).sort((a, b) => b.intensity - a.intensity);
}

function buildTargets(input: SnapshotInput) {
  return input.assets.map(asset => {
    const related = input.defects.filter(defect => defect.assetId === asset.id);
    const risk = clamp(related.reduce((sum, defect) => sum + severityWeight[defect.severity] * (defect.confidencePercent / 100), 0) + asset.criticality * 8);
    const stale = related.length === 0 || Math.max(...related.map(item => daysSince(item.createdAt)), 0) > 30;
    const uncertainty = clamp(100 - (related.length ? related.reduce((sum, item) => sum + item.confidencePercent, 0) / related.length : 25));
    const informationGain = clamp(uncertainty * .55 + (stale ? 25 : 0));
    const riskReduction = clamp(risk * .7); const estimatedCost = Math.round(35 + haversine(28.6139, 77.2090, Number(asset.latitude), Number(asset.longitude)) * 12);
    return { assetId: asset.id, assetName: asset.name, priority: clamp(risk * .45 + informationGain * .35 + asset.criticality * 5 - estimatedCost * .08), informationGain, riskReduction, uncertaintyReduction: uncertainty, estimatedCost, reason: stale ? "stale or missing observation history" : `${related.length} linked defect observation${related.length === 1 ? "" : "s"} with residual uncertainty` };
  }).sort((a, b) => b.priority - a.priority).slice(0, 25);
}

function buildTrajectories(input: SnapshotInput) {
  return input.assets.map(asset => {
    const related = input.defects.filter(defect => defect.assetId === asset.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const supported = related.length >= 2; const currentRisk = clamp(related.reduce((sum, item) => sum + severityWeight[item.severity] * item.confidencePercent / 100, 0) + asset.criticality * 8);
    const trend = supported ? (severityWeight[related.at(-1)!.severity] - severityWeight[related[0]!.severity]) / Math.max(1, related.length - 1) : 0;
    return { assetId: asset.id, assetName: asset.name, supported, currentRisk, projectedRisk: clamp(currentRisk + trend * 2), horizonDays: 30, confidence: supported ? clamp(55 + related.length * 8) : 20, ...(supported ? {} : { limitation: "At least two temporally ordered observations are required; no prediction asserted." }) };
  });
}

export function buildIntelligenceSnapshot(input: SnapshotInput): IntelligenceSnapshot {
  const quality = evaluateDataQuality(input); const fusion = buildFusion(input); const graph = buildEventGraph(input);
  const staleEvidence = input.evidence.filter(item => daysSince(item.capturedAt) > 90).length;
  const drivers = [...(quality.score < 70 ? ["data quality below operational threshold"] : []), ...(fusion.conflictCount ? [`${fusion.conflictCount} conflicting source decisions`] : []), ...(staleEvidence ? [`${staleEvidence} stale evidence records`] : []), ...(input.assets.length === 0 ? ["no persisted assets available"] : [])];
  const status = quality.score < 45 ? "insufficient_evidence" : fusion.conflictCount > 0 ? "conflicting_evidence" : staleEvidence > 0 ? "stale_evidence" : quality.score < 75 ? "low_confidence" : "high_confidence";
  const lineage = input.defects.filter(item => item.evidenceId).map(defect => ({ conclusionId: `asset-risk:${defect.assetId}`, conclusion: `${defect.severity} ${defect.label} contributes to asset risk`, supportingEvidenceIds: defect.evidenceId ? [defect.evidenceId] : [], defectIds: [defect.id], assetId: defect.assetId, confidence: clamp(defect.confidencePercent * (quality.score / 100)) }));
  return { generatedAt: new Date().toISOString(), algorithm: "drift-intelligence-v1", dataQuality: quality, uncertainty: { derivedConfidence: clamp((quality.score + fusion.agreement) / 2 - drivers.length * 5), status, drivers }, fusion, eventGraph: graph, hotspots: buildHotspots(input), inspectionTargets: buildTargets(input), trajectories: buildTrajectories(input), lineage };
}

export function simulateTwinFailure(snapshot: IntelligenceSnapshot, failedAssetIds: number[]) {
  const failed = new Set(failedAssetIds); const affected = snapshot.inspectionTargets.filter(target => failed.has(target.assetId) || target.priority > 70).map(target => ({ assetId: target.assetId, assetName: target.assetName, state: failed.has(target.assetId) ? "failed" : "exposed", risk: clamp(target.priority + (failed.has(target.assetId) ? 20 : 8)), relation: failed.has(target.assetId) ? "direct_effect" : "potential_cascade" }));
  return { scenario: "isolated_failure_simulation", failedAssetIds, affected, productionStateChanged: false, explanation: "Temporary state overlay traversed risk-ranked dependencies; no persisted entity was mutated." };
}

export type { SnapshotInput };
export { daysSince };
