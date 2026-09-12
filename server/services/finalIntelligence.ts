import type { IntelligenceSnapshot, SnapshotInput } from "./intelligenceEngine";
import { compareState, detectChangePoint, type DomainEvent } from "./domainEvents";

type DefectLike = SnapshotInput["defects"][number];
type EvidenceLike = SnapshotInput["evidence"][number];
type AssetLike = SnapshotInput["assets"][number];

export type QualityGate = "BLOCKED" | "DEGRADED" | "LOW_CONFIDENCE" | "FULLY_VALID";
export function evaluateQualityGate(input: SnapshotInput, snapshot: IntelligenceSnapshot): { gate: QualityGate; score: number; blockers: string[]; degradation: string[] } {
  const blockers = [...snapshot.dataQuality.issues.filter(issue => /invalid_coordinates|orphan|missing_evidence_link/.test(issue))];
  const degradation = [...snapshot.dataQuality.issues.filter(issue => !blockers.includes(issue)), ...snapshot.uncertainty.drivers];
  const gate: QualityGate = blockers.length >= 3 || snapshot.dataQuality.score < 35 ? "BLOCKED" : snapshot.dataQuality.score < 60 ? "DEGRADED" : snapshot.uncertainty.derivedConfidence < 60 ? "LOW_CONFIDENCE" : "FULLY_VALID";
  return { gate, score: snapshot.uncertainty.derivedConfidence, blockers, degradation };
}

export type Belief = { probability: number; confidence: number; classification: "OBSERVED" | "CALCULATED" | "INFERRED" | "PREDICTED" | "SIMULATED" | "VERIFIED"; sourceIds: number[]; uncertaintyDrivers: string[] };
export function reviseBelief(previous: Belief | null, evidence: Array<{ probability: number; confidence: number; sourceId: number; reliability: number; contradicts?: boolean }>): Belief {
  if (!evidence.length) return previous ?? { probability: .5, confidence: 0, classification: "INFERRED", sourceIds: [], uncertaintyDrivers: ["no supporting evidence"] };
  const weighted = evidence.reduce((sum, item) => sum + (item.contradicts ? 1 - item.probability : item.probability) * item.confidence * item.reliability, 0);
  const weight = evidence.reduce((sum, item) => sum + item.confidence * item.reliability, 0) || 1;
  const probability = Math.max(0.02, Math.min(.98, weighted / weight));
  const spread = Math.sqrt(evidence.reduce((sum, item) => sum + (item.probability - probability) ** 2, 0) / evidence.length);
  const confidence = Math.round(Math.max(0, Math.min(100, (1 - spread) * Math.min(1, weight / evidence.length) * 100)));
  return { probability, confidence, classification: evidence.some(item => item.contradicts) ? "INFERRED" : previous?.classification === "VERIFIED" ? "VERIFIED" : "CALCULATED", sourceIds: evidence.map(item => item.sourceId), uncertaintyDrivers: [...(spread > .2 ? ["source disagreement"] : []), ...(confidence < 60 ? ["low evidence confidence"] : [])] };
}

export function resolveDefectIdentity(candidate: DefectLike, historical: DefectLike[]) {
  const candidates = historical.map(item => {
    const distance = Math.hypot((Number(candidate.latitude) - Number(item.latitude)) * 111, (Number(candidate.longitude) - Number(item.longitude)) * 98);
    const days = Math.abs(candidate.createdAt.getTime() - item.createdAt.getTime()) / 86_400_000;
    const classScore = candidate.defectType === item.defectType ? 1 : 0;
    const assetScore = candidate.assetId === item.assetId ? 1 : 0;
    const score = assetScore * .35 + classScore * .25 + Math.max(0, 1 - distance / .25) * .25 + Math.max(0, 1 - days / 180) * .15;
    return { defectId: item.id, score, distanceKm: distance, daysApart: days };
  }).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return !best ? { classification: "NEW" as const, confidence: 100, matches: [] } : { classification: best.score >= .78 ? "SAME" as const : best.score >= .52 ? "POSSIBLE_SAME" as const : best.score < .25 ? "NEW" as const : "UNCERTAIN" as const, confidence: Math.round(best.score * 100), matches: candidates.slice(0, 5) };
}

export function analyzeDefectEvolution(defect: DefectLike, observations: DefectLike[]) {
  const history = [defect, ...observations.filter(item => item.id !== defect.id && item.assetId === defect.assetId && item.defectType === defect.defectType)].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const severityRank: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  const severityValues = history.map(item => ({ timestamp: item.createdAt, value: severityRank[item.severity] ?? 1 }));
  const change = detectChangePoint(severityValues);
  return { firstObserved: history[0]?.createdAt ?? null, lastObserved: history.at(-1)?.createdAt ?? null, observationCount: history.length, lifecycle: history.length === 1 ? "NEW" : severityRank[history.at(-1)!.severity] > severityRank[history[0]!.severity] ? "ESCALATING" : severityRank[history.at(-1)!.severity] < severityRank[history[0]!.severity] ? "DEESCALATING" : "PERSISTENT", severityHistory: history.map(item => ({ id: item.id, severity: item.severity, confidence: item.confidencePercent, observedAt: item.createdAt })), changePoint: change };
}

export function analyzeModelDisagreement(defect: DefectLike, evidence: EvidenceLike[]) {
  const cv = defect.confidencePercent / 100; const quality = evidence.find(item => item.id === defect.evidenceId)?.qualityStatus; const operator = defect.reviewState === "approved" ? 1 : defect.reviewState === "rejected" || defect.reviewState === "overridden" ? 0 : null; const signals = [{ source: "computer_vision", probability: cv }, ...(operator === null ? [] : [{ source: "operator_review", probability: operator }]), ...(quality === "fail" ? [{ source: "evidence_quality", probability: .2 }] : quality === "pass" ? [{ source: "evidence_quality", probability: .8 }] : [])];
  const values = signals.map(item => item.probability); const spread = values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
  return { status: spread > .35 ? "DISAGREEMENT" as const : "AGREEMENT" as const, signals, spread: Math.round(spread * 100), reviewPriority: Math.round(Math.min(100, spread * 100 + (100 - defect.confidencePercent) * .4)) };
}

export function detectNovelty(values: number[], value: number) {
  if (values.length < 5) return { supported: false, score: 0, baseline: null, reason: "Insufficient reference population." };
  const mean = values.reduce((sum, item) => sum + item, 0) / values.length; const sigma = Math.sqrt(values.reduce((sum, item) => sum + (item - mean) ** 2, 0) / values.length) || 1; const z = Math.abs(value - mean) / sigma;
  return { supported: true, score: Math.min(100, Math.round(z / 3 * 100)), baseline: { mean, sigma, count: values.length }, reason: z >= 3 ? "Outside the historical three-sigma envelope." : z >= 2 ? "Unusual relative to the historical baseline." : "Within historical variation." };
}

export function buildCausalHypotheses(input: SnapshotInput) {
  return input.defects.map(defect => { const nearby = input.defects.filter(other => other.id !== defect.id && other.assetId === defect.assetId && Math.abs(other.createdAt.getTime() - defect.createdAt.getTime()) < 14 * 86_400_000); const temporal = nearby.length > 0; const evidence = defect.evidenceId ? 0.25 : 0; return { cause: `defect:${defect.id}`, effect: `asset:${defect.assetId}`, classification: defect.reviewState === "approved" ? "OBSERVED_RELATIONSHIP" as const : temporal ? "CORRELATION" as const : "UNSUPPORTED" as const, confidence: Math.round((defect.confidencePercent / 100 + evidence + (temporal ? .15 : 0)) / 1.4 * 100), supportingEvidenceIds: defect.evidenceId ? [defect.evidenceId] : [], reason: temporal ? "Same-asset observations co-occur within a 14-day window; causal direction remains unverified." : "A defect-to-asset dependency is represented, but no temporal intervention evidence is available." }; });
}

function dominates(a: { riskReduction: number; informationGain: number; coverage: number; distance: number }, b: { riskReduction: number; informationGain: number; coverage: number; distance: number }) { return a.riskReduction >= b.riskReduction && a.informationGain >= b.informationGain && a.coverage >= b.coverage && a.distance <= b.distance && (a.riskReduction > b.riskReduction || a.informationGain > b.informationGain || a.coverage > b.coverage || a.distance < b.distance); }
export function optimizeMissionPlans(snapshot: IntelligenceSnapshot, budget = 150) {
  const targets = snapshot.inspectionTargets.slice(0, 12); const plans = [
    { name: "risk-reduction", targets: targets.slice().sort((a, b) => b.riskReduction - a.riskReduction).slice(0, 4) },
    { name: "information-gain", targets: targets.slice().sort((a, b) => b.informationGain - a.informationGain).slice(0, 4) },
    { name: "balanced", targets: targets.slice().sort((a, b) => (b.priority + b.informationGain) - (a.priority + a.informationGain)).slice(0, 4) },
  ].map(plan => { const selected = plan.targets; const cost = selected.reduce((sum, item) => sum + item.estimatedCost, 0); return { name: plan.name, assetIds: selected.map(item => item.assetId), riskReduction: selected.reduce((sum, item) => sum + item.riskReduction, 0), informationGain: selected.reduce((sum, item) => sum + item.informationGain, 0), coverage: selected.length, distance: cost * .08, cost, feasible: cost <= budget }; });
  return { budget, candidates: plans, paretoFront: plans.filter(candidate => !plans.some(other => other !== candidate && dominates(other, candidate))), assumptions: ["Estimated cost is derived from spatial distance and asset priority.", "Plans are advisory and do not issue flight or maintenance commands."] };
}

export function replayEvents(events: DomainEvent[], until?: Date) { const accepted = events.filter(event => !until || new Date(event.occurredAt) <= until).sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()); const state = new Map<string, Record<string, unknown>>(); for (const event of accepted) { const key = `${event.assetId ?? "global"}:${event.defectId ?? event.evidenceId ?? event.missionId ?? event.type}`; state.set(key, { ...state.get(key), lastEvent: event.type, occurredAt: event.occurredAt, ...event.payload }); } return { algorithm: "drift-replay-v1", eventCount: accepted.length, state: Array.from(state.entries()).map(([key, value]) => ({ key, ...value })) }; }

export function compareCollections<T extends Record<string, unknown>>(before: T[], after: T[], key: keyof T) { return compareState(before, after, key); }
