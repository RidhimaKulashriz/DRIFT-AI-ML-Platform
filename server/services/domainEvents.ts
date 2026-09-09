import crypto from "node:crypto";

export type DomainEventType =
  | "EvidenceReceived" | "EvidenceValidated" | "EvidenceRejected" | "InferenceCompleted"
  | "FindingCreated" | "DefectCreated" | "DefectVerified" | "DefectSeverityChanged"
  | "AssetStateChanged" | "RiskChanged" | "MissionGenerated" | "MissionStarted"
  | "MissionCompleted" | "MaintenanceStarted" | "MaintenanceCompleted" | "ClosureVerified";

export type DomainEvent = {
  eventId: string;
  type: DomainEventType;
  occurredAt: string;
  actorId?: number | null;
  missionId?: number | null;
  assetId?: number | null;
  defectId?: number | null;
  evidenceId?: number | null;
  payload: Record<string, unknown>;
};

export type DerivedNode = "evidence_quality" | "finding_confidence" | "defect_state" | "asset_risk" | "mission_priority" | "digital_twin" | "spatial_hotspot" | "inspection_priority";
const dependencyMap: Record<DomainEventType, DerivedNode[]> = {
  EvidenceReceived: ["evidence_quality", "finding_confidence", "defect_state", "asset_risk", "digital_twin", "spatial_hotspot", "inspection_priority"],
  EvidenceValidated: ["evidence_quality", "finding_confidence", "defect_state", "asset_risk", "spatial_hotspot", "inspection_priority"],
  EvidenceRejected: ["evidence_quality", "finding_confidence", "defect_state", "asset_risk", "mission_priority", "inspection_priority"],
  InferenceCompleted: ["finding_confidence", "defect_state", "asset_risk", "digital_twin", "spatial_hotspot", "inspection_priority"],
  FindingCreated: ["defect_state", "asset_risk", "digital_twin", "spatial_hotspot", "inspection_priority"],
  DefectCreated: ["defect_state", "asset_risk", "mission_priority", "digital_twin", "spatial_hotspot", "inspection_priority"],
  DefectVerified: ["defect_state", "asset_risk", "mission_priority", "digital_twin", "inspection_priority"],
  DefectSeverityChanged: ["defect_state", "asset_risk", "mission_priority", "digital_twin", "inspection_priority"],
  AssetStateChanged: ["asset_risk", "digital_twin", "mission_priority", "inspection_priority"],
  RiskChanged: ["mission_priority", "inspection_priority", "digital_twin"],
  MissionGenerated: ["mission_priority"], MissionStarted: ["mission_priority"], MissionCompleted: ["inspection_priority"],
  MaintenanceStarted: ["asset_risk", "digital_twin", "mission_priority"], MaintenanceCompleted: ["asset_risk", "digital_twin", "inspection_priority"], ClosureVerified: ["defect_state", "asset_risk", "inspection_priority"],
};

export function affectedDerivedNodes(type: DomainEventType): DerivedNode[] { return [...dependencyMap[type]]; }
export function createDomainEvent(input: Omit<DomainEvent, "eventId" | "occurredAt">): DomainEvent { return { ...input, eventId: crypto.randomUUID(), occurredAt: new Date().toISOString() }; }

export type StateDelta<T> = { added: T[]; removed: T[]; changed: Array<{ before: T; after: T }>; persistent: T[]; uncertain: T[] };
export function compareState<T extends Record<string, unknown>>(before: T[], after: T[], key: keyof T, uncertainty?: (item: T) => boolean): StateDelta<T> {
  const left = new Map(before.map(item => [String(item[key]), item])); const right = new Map(after.map(item => [String(item[key]), item]));
  const added: T[] = []; const removed: T[] = []; const changed: Array<{ before: T; after: T }> = []; const persistent: T[] = []; const uncertain: T[] = [];
  for (const [id, item] of Array.from(right.entries())) { const previous = left.get(id); if (!previous) added.push(item); else if (JSON.stringify(previous) !== JSON.stringify(item)) changed.push({ before: previous, after: item }); else persistent.push(item); if (uncertainty?.(item)) uncertain.push(item); }
  for (const [id, item] of Array.from(left.entries())) if (!right.has(id)) removed.push(item);
  return { added, removed, changed, persistent, uncertain };
}

export function detectChangePoint(values: Array<{ timestamp: Date | string; value: number }>) {
  if (values.length < 6) return { supported: false, reason: "At least six ordered observations are required.", changePoint: null, direction: "unknown" as const, magnitude: 0, confidence: 0, supportingObservations: values.length };
  const ordered = [...values].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const mean = ordered.reduce((sum, item) => sum + item.value, 0) / ordered.length; const variance = ordered.reduce((sum, item) => sum + (item.value - mean) ** 2, 0) / ordered.length; const sigma = Math.sqrt(variance) || 1;
  let best = { index: 0, score: 0, delta: 0 };
  for (let i = 2; i <= ordered.length - 3; i++) { const left = ordered.slice(0, i).reduce((sum, item) => sum + item.value, 0) / i; const right = ordered.slice(i).reduce((sum, item) => sum + item.value, 0) / (ordered.length - i); const score = Math.abs(right - left) / sigma * Math.sqrt((i * (ordered.length - i)) / ordered.length); if (score > best.score) best = { index: i, score, delta: right - left }; }
  return { supported: best.score >= 1.25, reason: best.score >= 1.25 ? "Mean-shift statistic exceeded the change-point support threshold." : "No statistically supported mean shift detected.", changePoint: best.score >= 1.25 ? ordered[best.index]!.timestamp : null, direction: best.delta > 0 ? "increasing" as const : best.delta < 0 ? "decreasing" as const : "stable" as const, magnitude: Math.round(Math.abs(best.delta) * 100) / 100, confidence: Math.min(99, Math.round(best.score / 3 * 100)), supportingObservations: ordered.length };
}

const dirtyNodes = new Map<string, { nodes: DerivedNode[]; eventId: string; markedAt: string }>();
export function markDerivedDirty(event: DomainEvent) { const scope = `${event.assetId ?? "global"}:${event.missionId ?? "global"}`; dirtyNodes.set(scope, { nodes: affectedDerivedNodes(event.type), eventId: event.eventId, markedAt: event.occurredAt }); }
export function getDirtyDerivedState() { return Array.from(dirtyNodes.entries()).map(([scope, state]) => ({ scope, ...state })); }
export function clearDerivedDirty(scope?: string) { if (scope) dirtyNodes.delete(scope); else dirtyNodes.clear(); }
