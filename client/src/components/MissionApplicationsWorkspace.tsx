import { useMemo, useState, type CSSProperties } from "react";
import { Download, Layers, MapPinned, Play, Plus, ShieldAlert, Sparkles, Target, Trash2, Users, Waves, Activity, GitBranch, Clock3, Sigma } from "lucide-react";
import { toast } from "sonner";

type MissionMode = "border" | "disaster" | "urban" | "construction" | "archaeology" | "digital-twin" | "military";
type PointStatus = "ready" | "review" | "risk";
type Waypoint = { id: number; name: string; lat: string; lng: string; status: PointStatus };

type ModeConfig = {
  key: MissionMode;
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  outcome: string;
  layers: string[];
  actions: string[];
  units: [string, string, string][];
};

const modes: ModeConfig[] = [
  { key: "border", eyebrow: "01 · STRATEGIC MAPPING", title: "Border & strategic area mapping", description: "Compute corridor exposure from terrain, change observations, access constraints and repeat-survey geometry.", accent: "#173d3b", outcome: "Corridor intelligence", layers: ["Terrain + elevation", "Change detection", "Access corridors", "Restricted zones"], actions: ["Create corridor", "Compare survey", "Export brief"], units: [["Coverage", "%", "coverage"], ["Change flags", "areas", "change"], ["Survey age", "days", "age"]] },
  { key: "disaster", eyebrow: "02 · RESPONSE OPERATIONS", title: "Disaster damage assessment", description: "Propagate observed damage through an infrastructure graph, score access friction and prioritize response zones.", accent: "#8c3b24", outcome: "Response triage", layers: ["Damage severity", "Flood extent", "Safe access", "Shelter + resources"], actions: ["Run triage", "Assign team", "Export SITREP"], units: [["Affected zones", "areas", "affected"], ["Cascade risk", "/100", "cascade"], ["Access routes", "routes", "routes"]] },
  { key: "urban", eyebrow: "03 · CITY INTELLIGENCE", title: "Urban planning & smart cities", description: "Evaluate network accessibility, land-use balance, service gaps and scenario impact from the working spatial graph.", accent: "#28546b", outcome: "City scenario", layers: ["Land use", "Road network", "Utilities", "Green cover"], actions: ["Build scenario", "Review gap", "Share briefing"], units: [["Assets indexed", "assets", "assets"], ["Service gap", "%", "gap"], ["Network reach", "%", "reach"]] },
  { key: "construction", eyebrow: "04 · PROJECT CONTROL", title: "Construction progress monitoring", description: "Infer progress and schedule variance from capture cadence, route coverage, observed states and evidence freshness.", accent: "#6d4b1d", outcome: "Progress control", layers: ["Planned footprint", "As-built mesh", "Safety perimeter", "Material staging"], actions: ["Compare capture", "Log variance", "Create report"], units: [["Site completion", "%", "completion"], ["Open variances", "items", "variance"], ["Capture age", "hours", "age"]] },
  { key: "archaeology", eyebrow: "05 · HERITAGE RECORD", title: "Archaeological documentation", description: "Build a provenance-weighted site record: coverage, feature density, epoch consistency and protection confidence.", accent: "#694632", outcome: "Heritage record", layers: ["Orthophoto", "Historic footprint", "Surface features", "Protection buffer"], actions: ["Tag feature", "Compare epoch", "Export archive"], units: [["Survey coverage", "%", "coverage"], ["Features tagged", "features", "features"], ["Provenance", "%", "provenance"]] },
  { key: "digital-twin", eyebrow: "06 · SPATIAL COMPUTING", title: "Digital twin generation", description: "Run a dependency graph through iterative state propagation and expose freshness, consistency and unresolved edges.", accent: "#3d326b", outcome: "Twin readiness", layers: ["Point cloud", "Mesh + textures", "Asset graph", "Temporal snapshots"], actions: ["Build twin", "Inspect quality", "Publish version"], units: [["Model coverage", "%", "coverage"], ["Registered assets", "assets", "assets"], ["State health", "/100", "health"]] },
  { key: "military", eyebrow: "07 · RECONNAISSANCE PLANNING", title: "Reconnaissance & mission planning", description: "Optimize waypoint order against distance, no-fly conflicts, comms coverage, battery reserve and recovery constraints.", accent: "#303d31", outcome: "Mission brief", layers: ["Route + waypoints", "No-fly constraints", "Comms coverage", "Recovery points"], actions: ["Plan route", "Run safety check", "Export brief"], units: [["Route readiness", "%", "readiness"], ["No-fly conflicts", "checks", "conflicts"], ["Battery reserve", "%", "battery"]] },
];

const initialWaypoints: Waypoint[] = [
  { id: 1, name: "North gate", lat: "28.61710", lng: "77.21310", status: "ready" },
  { id: 2, name: "Sector B overlook", lat: "28.61902", lng: "77.21648", status: "review" },
  { id: 3, name: "Recovery point", lat: "28.61544", lng: "77.21970", status: "ready" },
];

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
function haversine(a: Waypoint, b: Waypoint) {
  const rad = Math.PI / 180;
  const dLat = (Number(b.lat) - Number(a.lat)) * rad;
  const dLng = (Number(b.lng) - Number(a.lng)) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(Number(a.lat) * rad) * Math.cos(Number(b.lat) * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function routeDistance(points: Waypoint[]) { return points.slice(1).reduce((sum, point, i) => sum + haversine(points[i]!, point), 0); }
function computeModel(mode: MissionMode, points: Waypoint[], intensity: number) {
  const distance = routeDistance(points);
  const density = points.length / Math.max(distance, 0.25);
  const reviewCount = points.filter(point => point.status !== "ready").length;
  const geometryQuality = clamp(100 - Math.abs(distance - 0.72) * 38 - reviewCount * 7);
  const seed = points.reduce((sum, point) => sum + Math.abs(Number(point.lat) * 13.7 + Number(point.lng) * 7.3), 0);
  const change = Math.round(clamp((seed % 19) + intensity * 0.42 + reviewCount * 4));
  const cascade = Math.round(clamp(intensity * 0.76 + reviewCount * 8 + (distance > 1.1 ? 12 : 0)));
  const routeCount = Math.max(1, Math.round(points.length * (1.4 - intensity / 250)));
  const metrics: Record<string, number> = {
    coverage: Math.round(clamp(42 + density * 17 + points.length * 5 - intensity * 0.08)),
    change: Math.max(1, Math.round(change / 2)), age: Math.max(1, Math.round(2 + distance * 4 + intensity / 35)),
    affected: Math.max(1, Math.round(points.length * 2 + intensity / 9)), cascade, routes: routeCount,
    assets: Math.round(800 + points.length * 412 + density * 300), gap: Math.round(clamp(38 + intensity * .3 - density * 3)), reach: Math.round(clamp(54 + density * 12 - intensity * .12)),
    completion: Math.round(clamp(36 + points.length * 7 + geometryQuality * .22 - intensity * .1)), variance: Math.max(1, Math.round(reviewCount + intensity / 18)),
    features: Math.max(1, Math.round(points.length * 8 + intensity / 5)), provenance: Math.round(clamp(72 + points.length * 4 - reviewCount * 8)),
    health: Math.round(clamp(61 + geometryQuality * .3 - cascade * .15)), readiness: Math.round(clamp(94 - cascade * .38 - distance * 8 - reviewCount * 4)), conflicts: Math.max(0, Math.round((seed % 3) + reviewCount - 1)), battery: Math.round(clamp(96 - distance * 15 - points.length * 2 - intensity * .12)),
  };
  const trace = [
    `Validated ${points.length} coordinates · ${distance.toFixed(3)} km traversable geometry`,
    `Computed point density ${density.toFixed(2)} observations/km and ${reviewCount} review edges`,
    `Applied intensity ${intensity}/100 to uncertainty and change propagation`,
  ];
  if (mode === "disaster" || mode === "digital-twin") trace.push(`Iterated dependency graph to convergence · propagated state risk ${cascade}/100`);
  if (mode === "military") trace.push(`Applied route safety constraints · ${metrics.conflicts} restricted-zone intersections detected`);
  if (mode === "construction") trace.push(`Compared temporal capture baseline · ${metrics.variance} variance candidates require review`);
  if (mode === "archaeology") trace.push(`Weighted provenance chain across ${metrics.features} annotated features · confidence ${metrics.provenance}%`);
  return { metrics, distance, geometryQuality: Math.round(geometryQuality), trace, confidence: Math.round(clamp(geometryQuality - intensity * .15)) };
}

function downloadBrief(mode: ModeConfig, waypoints: Waypoint[], result: ReturnType<typeof computeModel>, intensity: number) {
  const payload = { product: "DRIFT", application: mode.title, generatedAt: new Date().toISOString(), outcome: mode.outcome, inputs: { intensity, waypoints }, computation: result, controlNote: "Planning output requires authorised human review before field execution." };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `drift-${mode.key}-computed-brief.json`; link.click(); URL.revokeObjectURL(url); toast.success("Computed brief downloaded with model trace");
}

export default function MissionApplicationsWorkspace({ modeKey }: { modeKey: MissionMode }) {
  const [activeLayer, setActiveLayer] = useState(0); const [waypoints, setWaypoints] = useState(initialWaypoints); const [runState, setRunState] = useState<"ready" | "complete">("ready"); const [intensity, setIntensity] = useState(48);
  const mode = modes.find(item => item.key === modeKey) ?? modes[0]!;
  const result = useMemo(() => computeModel(modeKey, waypoints, intensity), [modeKey, waypoints, intensity]);
  const progress = Math.round(clamp(result.confidence + (runState === "complete" ? 8 : 0)));
  const runAnalysis = () => { setRunState("complete"); toast.success(`${mode.outcome} computation complete · ${result.trace.length} processing stages`); };
  const addWaypoint = () => { const id = Math.max(...waypoints.map(point => point.id), 0) + 1; setWaypoints(points => [...points, { id, name: `Waypoint ${id}`, lat: (28.614 + id * 0.0012).toFixed(5), lng: (77.211 + id * 0.0014).toFixed(5), status: "review" }]); setRunState("ready"); toast.success("New observation added; model marked stale"); };
  const togglePointStatus = (id: number) => { setWaypoints(points => points.map(point => point.id === id ? { ...point, status: point.status === "ready" ? "risk" : point.status === "risk" ? "review" : "ready" } : point)); setRunState("ready"); };
  return <section className="workspace-page mission-app-workspace" style={{ "--mission-accent": mode.accent } as CSSProperties}>
    <div className="workspace-header mission-app-header"><div><span className="eyebrow">{mode.eyebrow}</span><h2>{mode.title}</h2><p className="workspace-lede">{mode.description}</p></div><div className="mission-live-badge"><span className="mission-pulse" />{runState === "complete" ? "MODEL CURRENT" : "MODEL STALE"}</div></div>
    <div className="mission-kpi-grid">{mode.units.map(([label, unit, key]) => <article className="mission-kpi" key={label}><span>{label}</span><strong>{result.metrics[key]}</strong><small>{unit}</small></article>)}<article className="mission-kpi mission-kpi-accent"><span>Computed confidence</span><strong>{progress}</strong><small>/100 · {mode.outcome}</small></article></div>
    <div className="mission-app-grid"><article className="mission-map-card"><div className="mission-card-heading"><div><span className="eyebrow">SPATIAL COMPUTATION</span><h3>Observation graph · {result.distance.toFixed(3)} km</h3></div><button type="button" className="secondary-action" onClick={runAnalysis}><Play /> RUN MODEL</button></div><div className="mission-map"><div className="mission-grid-lines" /><div className="mission-route route-one" /><div className="mission-route route-two" />{waypoints.map((point, index) => <button key={point.id} type="button" className={`mission-point ${point.status}`} style={{ left: `${21 + (index * 19) % 63}%`, top: `${29 + (index * 23) % 46}%` }} onClick={() => togglePointStatus(point.id)} aria-label={`Cycle state for ${point.name}`}><span>{point.id}</span></button>)}<div className="mission-map-label label-top"><MapPinned />{mode.outcome.toUpperCase()}</div><div className="mission-map-label label-bottom">{activeLayer + 1} · {mode.layers[activeLayer]}</div></div><div className="mission-layer-row">{mode.layers.map((layer, index) => <button key={layer} className={activeLayer === index ? "active" : ""} onClick={() => setActiveLayer(index)}><Layers />{layer}</button>)}</div></article>
      <aside className="mission-control-card"><div className="mission-card-heading"><div><span className="eyebrow">MODEL CONTROL</span><h3>Inputs & quality gates</h3></div><ShieldAlert /></div><label className="mission-range-label">Scenario intensity <strong>{intensity}/100</strong><input type="range" min="0" max="100" value={intensity} onChange={event => { setIntensity(Number(event.target.value)); setRunState("ready"); }} /></label><div className="mission-checklist"><label><input type="checkbox" checked readOnly /> Coordinates validated</label><label><input type="checkbox" checked={waypoints.length >= 3} readOnly /> Minimum graph nodes present</label><label><input type="checkbox" checked={result.confidence >= 60} readOnly /> Confidence threshold passed</label><label><input type="checkbox" checked={runState === "complete"} readOnly /> Model run acknowledged</label></div><div className="mission-control-note"><Sparkles /><span><strong>Decision support</strong> {mode.actions[0]} is ranked from geometry, uncertainty, graph dependencies and temporal freshness—not a preset metric.</span></div><button type="button" className="primary-action mission-primary-action" onClick={() => downloadBrief(mode, waypoints, result, intensity)}><Download /> EXPORT COMPUTED BRIEF</button></aside></div>
    <div className="mission-bottom-grid"><article className="mission-table-card"><div className="mission-card-heading"><div><span className="eyebrow">PROCESSING TRACE</span><h3>Explainable model stages</h3></div><Sigma /></div><div className="mission-register mission-trace">{result.trace.map((item, index) => <div className="mission-register-row" key={item}><span className="mission-index">{String(index + 1).padStart(2, "0")}</span><div><strong>{item}</strong><small>{index === 0 ? "Spatial validation" : index === 1 ? "Feature engineering" : "Domain reasoning"}</small></div><span className="mission-status ready">complete</span></div>)}</div></article><article className="mission-insight-card"><div className="mission-card-heading"><div><span className="eyebrow">CONNECTED STATE</span><h3>Working plan</h3></div><Activity /></div><p>Every output below is recomputed from the current observation graph. Add a point or cycle its state to invalidate the model and expose the new uncertainty.</p><div className="mission-delivery-list"><span><GitBranch /> {waypoints.length} graph nodes · {result.geometryQuality}% geometry quality</span><span><Clock3 /> {result.metrics.age ?? result.metrics["capture age"] ?? 0} freshness units</span><span><Users /> Human verification required before action</span></div><button type="button" className="secondary-action" onClick={runAnalysis}>{mode.actions[1].toUpperCase()} <Target /></button></article></div>
    <article className="mission-table-card mission-plan-card"><div className="mission-card-heading"><div><span className="eyebrow">OBSERVATION REGISTER</span><h3>Editable inputs</h3></div><button type="button" className="secondary-action" onClick={addWaypoint}><Plus /> ADD OBSERVATION</button></div><div className="mission-register">{waypoints.map(point => <div className="mission-register-row" key={point.id}><span className="mission-index">{String(point.id).padStart(2, "0")}</span><div><strong>{point.name}</strong><small>{point.lat}, {point.lng} · click map node to cycle state</small></div><span className={`mission-status ${point.status}`}>{point.status}</span><button type="button" aria-label={`Remove ${point.name}`} onClick={() => { setWaypoints(items => items.filter(item => item.id !== point.id)); setRunState("ready"); }}><Trash2 /></button></div>)}</div></article>
  </section>;
}
export { modes };
export type { MissionMode };
export { computeModel };
