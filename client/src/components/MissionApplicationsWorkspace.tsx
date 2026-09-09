import { useMemo, useState, type CSSProperties } from "react";
import { Download, Layers, MapPinned, Play, Plus, ShieldAlert, Sparkles, Target, Trash2, Users, Waves } from "lucide-react";
import { toast } from "sonner";

type MissionMode = "border" | "disaster" | "urban" | "construction" | "archaeology" | "digital-twin" | "military";

type ModeConfig = {
  key: MissionMode;
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  outcome: string;
  metrics: Array<[string, string, string]>;
  layers: string[];
  actions: string[];
};

const modes: ModeConfig[] = [
  { key: "border", eyebrow: "01 · STRATEGIC MAPPING", title: "Border & strategic area mapping", description: "Plan repeatable corridor surveys, compare change between sorties, and keep sensitive coordinates inside a controlled mission workspace.", accent: "#173d3b", outcome: "Corridor intelligence", metrics: [["Coverage", "84.6", "%"], ["Change flags", "12", "areas"], ["Survey age", "06", "days"]], layers: ["Terrain + elevation", "Change detection", "Access corridors", "Restricted zones"], actions: ["Create corridor", "Compare survey", "Export brief"] },
  { key: "disaster", eyebrow: "02 · RESPONSE OPERATIONS", title: "Disaster damage assessment", description: "Turn drone evidence into a triage board for response teams: classify damage, assign confidence, and prioritize safe access before dispatch.", accent: "#8c3b24", outcome: "Response triage", metrics: [["Affected zones", "27", "areas"], ["High priority", "08", "zones"], ["Access routes", "19", "routes"]], layers: ["Damage severity", "Flood extent", "Safe access", "Shelter + resources"], actions: ["Run triage", "Assign team", "Export SITREP"] },
  { key: "urban", eyebrow: "03 · CITY INTELLIGENCE", title: "Urban planning & smart cities", description: "Combine aerial context, asset inventory, traffic and public-realm observations into a planning canvas that supports scenario decisions.", accent: "#28546b", outcome: "City scenario", metrics: [["Assets indexed", "4,286", "assets"], ["Planning zones", "18", "zones"], ["Data freshness", "92", "%"]], layers: ["Land use", "Road network", "Utilities", "Green cover"], actions: ["Build scenario", "Review gap", "Share briefing"] },
  { key: "construction", eyebrow: "04 · PROJECT CONTROL", title: "Construction progress monitoring", description: "Compare planned and observed site states, surface schedule drift, and create a traceable weekly progress package from captured evidence.", accent: "#6d4b1d", outcome: "Progress control", metrics: [["Site completion", "63", "%"], ["Open variances", "09", "items"], ["Last capture", "Today", "09:42"]], layers: ["Planned footprint", "As-built mesh", "Safety perimeter", "Material staging"], actions: ["Compare capture", "Log variance", "Create report"] },
  { key: "archaeology", eyebrow: "05 · HERITAGE RECORD", title: "Archaeological documentation", description: "Create non-invasive site records with orthophoto coverage, feature annotations, and repeatable provenance for conservation teams.", accent: "#694632", outcome: "Heritage record", metrics: [["Survey coverage", "71.2", "%"], ["Features tagged", "34", "features"], ["Provenance", "100", "%"]], layers: ["Orthophoto", "Historic footprint", "Surface features", "Protection buffer"], actions: ["Tag feature", "Compare epoch", "Export archive"] },
  { key: "digital-twin", eyebrow: "06 · SPATIAL COMPUTING", title: "Digital twin generation", description: "Assemble inspection evidence into a versioned spatial model with quality gates, asset relationships and a clear freshness score.", accent: "#3d326b", outcome: "Twin readiness", metrics: [["Model coverage", "78", "%"], ["Registered assets", "612", "assets"], ["Quality score", "88", "/100"]], layers: ["Point cloud", "Mesh + textures", "Asset graph", "Temporal snapshots"], actions: ["Build twin", "Inspect quality", "Publish version"] },
  { key: "military", eyebrow: "07 · RECONNAISSANCE PLANNING", title: "Reconnaissance & mission planning", description: "Prepare lawful, safety-first observation missions with route constraints, comms checks, crew roles and an auditable briefing package.", accent: "#303d31", outcome: "Mission brief", metrics: [["Route readiness", "86", "%"], ["No-fly conflicts", "02", "checks"], ["Crew assigned", "04", "people"]], layers: ["Route + waypoints", "No-fly constraints", "Comms coverage", "Recovery points"], actions: ["Plan route", "Run safety check", "Export brief"] },
];

const initialWaypoints = [
  { id: 1, name: "North gate", lat: "28.61710", lng: "77.21310", status: "ready" },
  { id: 2, name: "Sector B overlook", lat: "28.61902", lng: "77.21648", status: "review" },
  { id: 3, name: "Recovery point", lat: "28.61544", lng: "77.21970", status: "ready" },
];

function downloadBrief(mode: ModeConfig, waypoints: typeof initialWaypoints) {
  const payload = { product: "DRIFT", application: mode.title, generatedAt: new Date().toISOString(), outcome: mode.outcome, waypoints, controlNote: "Planning output requires authorised human review before field execution." };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `drift-${mode.key}-brief.json`;
  link.click();
  URL.revokeObjectURL(url);
  toast.success("Brief downloaded with the current mission state");
}

export default function MissionApplicationsWorkspace({ modeKey }: { modeKey: MissionMode }) {
  const [activeLayer, setActiveLayer] = useState(0);
  const [waypoints, setWaypoints] = useState(initialWaypoints);
  const [runState, setRunState] = useState<"ready" | "running" | "complete">("ready");
  const mode = modes.find(item => item.key === modeKey) ?? modes[0]!;
  const progress = useMemo(() => Math.min(100, 46 + waypoints.length * 9 + (runState === "complete" ? 17 : 0)), [runState, waypoints.length]);

  const runAnalysis = () => {
    setRunState("running");
    window.setTimeout(() => { setRunState("complete"); toast.success(`${mode.outcome} analysis complete`); }, 650);
  };

  const addWaypoint = () => {
    const id = Math.max(...waypoints.map(point => point.id), 0) + 1;
    setWaypoints(points => [...points, { id, name: `Waypoint ${id}`, lat: (28.614 + id * 0.0012).toFixed(5), lng: (77.211 + id * 0.0014).toFixed(5), status: "review" }]);
    toast.success("Waypoint added to the working plan");
  };

  return <section className="workspace-page mission-app-workspace" style={{ "--mission-accent": mode.accent } as CSSProperties}>
    <div className="workspace-header mission-app-header"><div><span className="eyebrow">{mode.eyebrow}</span><h2>{mode.title}</h2><p className="workspace-lede">{mode.description}</p></div><div className="mission-live-badge"><span className="mission-pulse" />{runState === "running" ? "ANALYSING" : runState === "complete" ? "UPDATED JUST NOW" : "WORKSPACE READY"}</div></div>
    <div className="mission-kpi-grid">{mode.metrics.map(([label, value, unit]) => <article className="mission-kpi" key={label}><span>{label}</span><strong>{value}</strong><small>{unit}</small></article>)}<article className="mission-kpi mission-kpi-accent"><span>Operational readiness</span><strong>{progress}</strong><small>/100 · {mode.outcome}</small></article></div>
    <div className="mission-app-grid">
      <article className="mission-map-card"><div className="mission-card-heading"><div><span className="eyebrow">SPATIAL WORKBENCH</span><h3>Live planning canvas</h3></div><button type="button" className="secondary-action" onClick={runAnalysis} disabled={runState === "running"}><Play />{runState === "running" ? "RUNNING" : "RUN ANALYSIS"}</button></div><div className="mission-map"><div className="mission-grid-lines" /><div className="mission-route route-one" /><div className="mission-route route-two" />{waypoints.map((point, index) => <button key={point.id} type="button" className={`mission-point ${point.status}`} style={{ left: `${21 + (index * 19) % 63}%`, top: `${29 + (index * 23) % 46}%` }} onClick={() => toast.info(`${point.name} · ${point.lat}, ${point.lng}`)} aria-label={`Open ${point.name}`}><span>{point.id}</span></button>)}<div className="mission-map-label label-top"><MapPinned />{mode.outcome.toUpperCase()}</div><div className="mission-map-label label-bottom">{activeLayer + 1} · {mode.layers[activeLayer]}</div></div><div className="mission-layer-row">{mode.layers.map((layer, index) => <button key={layer} type="button" className={activeLayer === index ? "active" : ""} onClick={() => setActiveLayer(index)}><Layers />{layer}</button>)}</div></article>
      <aside className="mission-control-card"><div className="mission-card-heading"><div><span className="eyebrow">MISSION CONTROL</span><h3>Field-ready checklist</h3></div><ShieldAlert /></div><div className="mission-checklist"><label><input type="checkbox" defaultChecked /> Evidence source linked</label><label><input type="checkbox" defaultChecked /> Coordinates quality-gated</label><label><input type="checkbox" /> Engineer briefing approved</label><label><input type="checkbox" /> Safety / access review complete</label></div><div className="mission-control-note"><Sparkles /><span><strong>DRIFT recommendation</strong> Start with {mode.actions[0].toLowerCase()}, then review the highest-risk item before exporting a field brief.</span></div><button type="button" className="primary-action mission-primary-action" onClick={() => downloadBrief(mode, waypoints)}><Download /> EXPORT WORKING BRIEF</button></aside>
    </div>
    <div className="mission-bottom-grid"><article className="mission-table-card"><div className="mission-card-heading"><div><span className="eyebrow">ROUTE / FEATURE REGISTER</span><h3>Working plan</h3></div><button type="button" className="secondary-action" onClick={addWaypoint}><Plus /> ADD POINT</button></div><div className="mission-register">{waypoints.map(point => <div className="mission-register-row" key={point.id}><span className="mission-index">{String(point.id).padStart(2, "0")}</span><div><strong>{point.name}</strong><small>{point.lat}, {point.lng}</small></div><span className={`mission-status ${point.status}`}>{point.status}</span><button type="button" aria-label={`Remove ${point.name}`} onClick={() => setWaypoints(points => points.filter(item => item.id !== point.id))}><Trash2 /></button></div>)}</div></article><article className="mission-insight-card"><div className="mission-card-heading"><div><span className="eyebrow">DELIVERY APPLICATION</span><h3>{mode.actions[0]}</h3></div><Target /></div><p>One continuous workflow from capture to decision: evidence, spatial context, confidence, human review and an exportable handoff package.</p><div className="mission-delivery-list"><span><Users /> Assigned crew / reviewer</span><span><Waves /> Freshness and confidence</span><span><ShieldAlert /> Safety boundary before action</span></div><button type="button" className="secondary-action" onClick={() => toast.info("The next action is ready in the working plan")}>{mode.actions[1].toUpperCase()} <Plus /></button></article></div>
  </section>;
}

export { modes };
export type { MissionMode };
