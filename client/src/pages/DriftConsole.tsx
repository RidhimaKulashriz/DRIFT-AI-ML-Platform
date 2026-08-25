import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { DriftMap } from "@/components/DriftMap";
import { requestedSeverityFilter } from "@/lib/driftInteractions";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BatteryCharging,
  CheckCheck,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  CloudCog,
  Crosshair,
  FileText,
  Gauge,
  Layers3,
  MapPinned,
  Network,
  Play,
  Radar,
  RadioTower,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Upload,
  Video,
  Waypoints,
  Wrench,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CAPTURE_ZONES, INSPECTION_DOMAINS } from "@shared/types";

type Severity = "low" | "medium" | "high" | "critical";
type DefectType = "pothole" | "crack" | "structural" | "corrosion" | "spalling" | "exposed_rebar" | "water_intrusion" | "settlement" | "rail_alignment" | "obstruction" | "lighting_failure";
type Workspace = "operations" | "defects" | "evidence" | "reports" | "hardware";
type Role = "administrator" | "engineer" | "citizen";
type EvidenceItem = { id: number; fileName: string; storageUrl: string; mediaKind: "photo" | "video" | "annotation" | "report"; source?: "hardware" | "upload" | "simulator" | "reference"; latitude: string | null; longitude: string | null; capturedAt?: Date | null; cameraId?: string | null; provenance?: unknown; captureZone?: string | null; qualityStatus?: string | null; imageQuality?: unknown };

const navItems: Array<{ key: Workspace; label: string; icon: typeof Radar }> = [
  { key: "operations", label: "Operations", icon: Radar },
  { key: "defects", label: "Defect control", icon: TriangleAlert },
  { key: "evidence", label: "Evidence vault", icon: Video },
  { key: "reports", label: "Reports", icon: FileText },
  { key: "hardware", label: "Hardware bridge", icon: RadioTower },
];

function severityClass(severity: Severity) {
  return severity === "critical" ? "severity-critical" : severity === "high" ? "severity-high" : severity === "medium" ? "severity-medium" : "severity-low";
}

function formatCurrency(cents = 0) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(cents / 100);
}

function evidenceProvenance(provenance: unknown) {
  if (!provenance || typeof provenance !== "object") return "Provenance not recorded";
  const value = provenance as Record<string, unknown>;
  const kind = typeof value.kind === "string" ? value.kind : "unclassified";
  const author = typeof value.author === "string" ? ` · author ${value.author}` : "";
  const license = typeof value.license === "string" ? ` · ${value.license}` : "";
  return `${kind}${author}${license}`;
}

function evidenceSourceUrl(provenance: unknown) {
  if (!provenance || typeof provenance !== "object") return null;
  const sourceUrl = (provenance as Record<string, unknown>).sourceUrl;
  return typeof sourceUrl === "string" && sourceUrl.startsWith("https://") ? sourceUrl : null;
}

function SeverityChip({ severity }: { severity: Severity }) {
  return <span className={cn("severity-chip", severityClass(severity))}>{severity}</span>;
}

function StatBlock({ label, value, detail, direction = "neutral" }: { label: string; value: string; detail: string; direction?: "up" | "down" | "neutral" }) {
  return (
    <section className="stat-block">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <span className={cn("stat-detail", direction === "up" && "detail-up", direction === "down" && "detail-down")}>
        {direction === "up" ? <ArrowUpRight /> : direction === "down" ? <ArrowDownRight /> : <CircleDot />} {detail}
      </span>
    </section>
  );
}

export default function DriftConsole() {
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    const requested = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("workspace");
    return navItems.some(item => item.key === requested) ? requested as Workspace : "operations";
  });
  const [previewRole, setPreviewRole] = useState<Role>("engineer");
  const [selectedId, setSelectedId] = useState(101);
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [defectTypeFilter, setDefectTypeFilter] = useState<"all" | DefectType>("all");
  const [domainFilter, setDomainFilter] = useState<"all" | (typeof INSPECTION_DOMAINS)[number]>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "detected" | "under_review" | "verified" | "scheduled" | "resolved" | "dismissed">("all");
  const [reviewFilter, setReviewFilter] = useState<"all" | "pending" | "approved" | "overridden" | "rejected">("all");
  const [missionFilter, setMissionFilter] = useState<number | "all">("all");
  const [assetFilter, setAssetFilter] = useState<number | "all">("all");
  const [missionName, setMissionName] = useState("Demo corridor patrol");
  const [uavMissionName, setUavMissionName] = useState("Operator UAV capture mission");
  const [uavProfile, setUavProfile] = useState("PX4 / ArduPilot MAVLink-compatible UAV");
  const [uavAdapter, setUavAdapter] = useState<"mavlink-bridge" | "http-webhook" | "rtsp-media">("mavlink-bridge");
  const [uavLatitude, setUavLatitude] = useState("28.6139");
  const [uavLongitude, setUavLongitude] = useState("77.2090");
  const [aiBrief, setAiBrief] = useState<string | null>(null);
  const [driftAiMessages, setDriftAiMessages] = useState<Message[]>([{ role: "assistant", content: "I’m DRIFT AI. Ask me anything about this inspection. I will use the live mission context and clearly separate observed evidence from advisory inference." }]);
  const [driftAiSource, setDriftAiSource] = useState<"gemini" | "openai" | "deterministic-intent" | "deterministic-fallback" | "unknown">("unknown");
  const [driftAiProviderStatus, setDriftAiProviderStatus] = useState<string>("not-requested");
  const [pendingAiFilter, setPendingAiFilter] = useState<Severity | null>(null);
  const [reportResult, setReportResult] = useState<{ title: string; storageUrl?: string; evidenceCount: number; defectCount: number; format?: string; severityCounts?: Record<string, number> } | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<EvidenceItem | null>(null);
  const { user, isAuthenticated } = useAuth();
  const overview = trpc.drift.overview.useQuery(undefined, { refetchInterval: 15000 });
  const hardware = trpc.drift.hardwareStatus.useQuery(undefined);
  const workspaceAccess = trpc.drift.workspace.useQuery(undefined, { enabled: isAuthenticated });
  const utils = trpc.useUtils();
  const filePickerRef = useRef<HTMLInputElement>(null);
  const runSimulator = trpc.drift.runSimulator.useMutation({
    onSuccess: data => {
      toast.success(`Simulator mission stored · ${data.findings.length} findings evaluated`);
      utils.drift.overview.invalidate();
      setWorkspace("operations");
    },
    onError: error => toast.error(error.message),
  });
  const createHardwareCaptureMission = trpc.drift.createHardwareCaptureMission.useMutation({
    onSuccess: data => {
      toast.success(`UAV capture mission ${data.missionId} is in preflight. Upload original camera media next.`);
      utils.drift.overview.invalidate();
      setWorkspace("evidence");
    },
    onError: error => toast.error(error.message),
  });

  const live = overview.data;
  const defects = live?.defects ?? [];
  const missions = live?.missions ?? [];
  const telemetry = (live?.telemetry ?? []).slice(0, 240);
  const latestTelemetry = telemetry[0];
  const reports = live?.reports ?? [];
  const missionIdForEvidence = Number(missions[0]?.id ?? 0);
  const missionEvidence = trpc.drift.evidence.list.useQuery({ missionId: missionIdForEvidence }, { enabled: workspace === "evidence" && missionIdForEvidence > 0 });
  const demoEvidence = trpc.drift.evidence.demoList.useQuery({ missionId: missionIdForEvidence }, { enabled: workspace === "evidence" && missionIdForEvidence > 0 });
  const evidenceItems: EvidenceItem[] = (missionEvidence.data?.length ? missionEvidence.data : demoEvidence.data ?? []).filter(item => {
    const provenance = item.provenance;
    return !(provenance && typeof provenance === "object" && (provenance as Record<string, unknown>).kind === "reference-image");
  });
  const uploadEvidence = trpc.drift.evidence.upload.useMutation({
    onSuccess: () => {
      toast.success("Evidence stored securely with mission metadata");
      missionEvidence.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const reviewMutation = trpc.drift.review.useMutation({
    onSuccess: () => {
      toast.success("Engineer decision persisted to audit history");
      utils.drift.overview.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const decisionSupport = trpc.drift.decisionSupport.useMutation({
    onSuccess: result => {
      setAiBrief(result.engineeringNarrative);
      toast.success("ZeroError engineering narrative generated for manual review");
    },
    onError: error => toast.error(error.message),
  });
  const generateReport = trpc.drift.reports.generate.useMutation({
    onSuccess: result => {
      setReportResult(result);
      toast.success("Engineer-ready PDF report generated");
      utils.drift.overview.invalidate();
    },
    onError: error => toast.error(`Report generation failed: ${error.message}`),
  });
  const driftAi = trpc.drift.ai.ask.useMutation({
    onSuccess: result => { const aiResult = result as { source: "gemini" | "openai" | "deterministic-intent" | "deterministic-fallback"; providerStatus?: string | number; answer: string }; setDriftAiSource(aiResult.source); setDriftAiProviderStatus(String(aiResult.providerStatus ?? ((aiResult.source === "openai" || aiResult.source === "gemini") ? "connected" : "unknown"))); setDriftAiMessages(previous => [...previous, { role: "assistant", content: aiResult.answer }]); },
    onError: error => { setDriftAiMessages(previous => [...previous, { role: "assistant", content: `DRIFT AI could not complete this request. ${error.message} Please verify the engineer session and try again.` }]); toast.error(error.message); },
  });
  const selected = defects.find(defect => defect.id === selectedId) ?? defects[0] ?? { id: 0, label: "No finding selected", defectType: "structural", severity: "low" as Severity, zeroErrorScore: 0, confidencePercent: 0, latitude: "—", longitude: "—", status: "detected", reviewState: "pending", missionId: 0, assetId: 0, explanation: ["Run a simulator mission or connect an approved hardware bridge to create a finding."] };
  const selectedExplanation = Array.isArray(selected.explanation) ? selected.explanation.filter((item): item is string => typeof item === "string") : [];
  const selectedEvidenceId = (selected as typeof selected & { evidenceId?: number | null }).evidenceId;
  const selectedEvidence = selectedEvidenceId ? evidenceItems.find(item => item.id === selectedEvidenceId && item.source !== "reference") : undefined;
  const visibleDefects = useMemo(() => defects.filter(defect =>
    (severityFilter === "all" || defect.severity === severityFilter) &&
    (defectTypeFilter === "all" || defect.defectType === defectTypeFilter) &&
    (domainFilter === "all" || defect.inspectionDomain === domainFilter) &&
    (statusFilter === "all" || defect.status === statusFilter) &&
    (reviewFilter === "all" || defect.reviewState === reviewFilter) &&
    (missionFilter === "all" || defect.missionId === missionFilter) &&
    (assetFilter === "all" || defect.assetId === assetFilter),
  ), [defects, severityFilter, defectTypeFilter, domainFilter, statusFilter, reviewFilter, missionFilter, assetFilter]);
  const repairTotal = (live?.estimates ?? []).reduce((sum, item) => sum + item.estimateCents, 0);
  const criticalCount = defects.filter(defect => defect.severity === "critical").length;
  const severitySummary = (["critical", "high", "medium", "low"] as Severity[]).map(severity => ({ severity, count: defects.filter(defect => defect.severity === severity).length }));
  const connectedStatus = hardware.data?.status ?? "offline";
  const activeAlerts = (live?.alerts ?? []).filter(alert => alert.status === "open");
  const availableAssets = live?.assets ?? [];
  const availableMissions = live?.missions ?? [];
  const role: Role = isAuthenticated ? (workspaceAccess.data?.role === "admin" ? "administrator" : workspaceAccess.data?.role === "citizen" ? "citizen" : "engineer") : previewRole;
  const roleSource = isAuthenticated ? "AUTHORISED ROLE" : "DEMO PREVIEW";
  const canOperate = isAuthenticated && role !== "citizen";
  const canRunDemo = !isAuthenticated || role !== "citizen";

  const roleCopy: Record<Role, { eyebrow: string; title: string; note: string }> = {
    administrator: { eyebrow: "GOVERNANCE DESK", title: "Network accountability", note: "Audit integrity, service levels, and asset exposure across the inspection network." },
    engineer: { eyebrow: "ENGINEERING DESK", title: "Verify before you release", note: "Review evidence, override priorities, and turn risk signals into accountable maintenance actions." },
    citizen: { eyebrow: "PUBLIC STATUS DESK", title: "Safer infrastructure, visible progress", note: "View current asset status and resolved safety actions without access to operational controls." },
  };

  const auditAction = (action: string) => toast.success(`${action} recorded in this review session`);
  const submitReview = (decision: "approve" | "override" | "needs_site_visit") => {
    reviewMutation.mutate({
      defectId: selected.id,
      decision,
      priorityOverride: decision === "override" ? "high" : undefined,
      note: decision === "approve" ? "Evidence reviewed and priority accepted." : decision === "override" ? "Priority adjusted after engineer review." : "Field verification requested before work-order release.",
    });
  };
  const handleEvidenceFile = (file?: File) => {
    if (!file) return;
    if (!missionIdForEvidence) {
      toast.error("Run a simulator mission or select a persisted mission before uploading evidence.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => uploadEvidence.mutate({
      missionId: missionIdForEvidence,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      base64: String(reader.result),
      mediaKind: file.type.startsWith("video/") ? "video" : "photo",
      latitude: String(selected.latitude),
      longitude: String(selected.longitude),
      playbackSeconds: 0,
      assetId: selected.assetId || undefined,
      assetCriticality: availableAssets.find(asset => asset.id === selected.assetId)?.criticality ?? 3,
      priorOpenDefects: defects.filter(defect => defect.assetId === selected.assetId && defect.status !== "resolved" && defect.status !== "dismissed").length,
      runInference: file.type.startsWith("image/"),
      capturedAt: Date.now(),
      captureZone: "oblique",
      qualityStatus: "review",
      inspectionDomain: "bridges",
      cameraId: `${uavProfile} · operator camera`,
      captureSource: "hardware",
      aircraftProfile: uavProfile,
      imageQuality: { source: "operator-uav-upload", requiresEngineerReview: true, originalMediaRequired: true },
      correlationKey: `${missionIdForEvidence}:${selected.assetId || "asset"}`,
    });
    reader.onerror = () => toast.error("The selected evidence file could not be read.");
    reader.readAsDataURL(file);
  };
  const createPdfReport = () => {
    const missionId = Number(missions[0]?.id ?? 0);
    if (!missionId) { toast.error("Run a simulator mission before generating a report."); return; }
    generateReport.mutate({ missionId });
  };
  const startUavCaptureMission = () => {
    if (!isAuthenticated) { toast.error("Sign in as an engineer or administrator to create a persisted UAV capture mission."); return; }
    const latitude = Number(uavLatitude);
    const longitude = Number(uavLongitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) { toast.error("Enter valid latitude and longitude before starting preflight."); return; }
    createHardwareCaptureMission.mutate({ name: uavMissionName, aircraftProfile: uavProfile, adapter: uavAdapter, latitude, longitude, operatorNote: "Operator-created capture mission. DRIFT receives telemetry and original media only; it cannot fly the UAV." });
  };
  const askDriftAi = (question: string) => {
    const normalizedQuestion = question.toLowerCase();
    const requestedSeverity = requestedSeverityFilter(question);
    if (requestedSeverity && /\b(show|filter|only|within|near|map)\b/.test(normalizedQuestion)) setPendingAiFilter(requestedSeverity);
    setDriftAiMessages(previous => [...previous, { role: "user", content: question }]);
    driftAi.mutate({ question, conversation: driftAiMessages.filter((message): message is Message & { role: "user" | "assistant" } => message.role !== "system").slice(-8).map(message => ({ role: message.role, content: message.content })), context: { missionName: missions[0]?.name ?? null, missionStatus: missions[0]?.status ?? null, telemetryPoints: telemetry.length, latestBatteryPercent: latestTelemetry?.batteryPercent ?? null, evidenceCount: evidenceItems.length, history: missions.slice(0, 20).map(mission => ({ name: mission.name, status: mission.status, findingsCount: defects.filter(defect => defect.missionId === mission.id).length })), selectedFinding: { id: selected.id, label: selected.label, defectType: selected.defectType, inspectionDomain: selected.inspectionDomain ?? null, severity: selected.severity, status: selected.status ?? null, reviewState: selected.reviewState ?? null, zeroErrorScore: selected.zeroErrorScore ?? null, confidencePercent: selected.confidencePercent ?? null, coveragePercent: selected.coveragePercent ?? null, latitude: selected.latitude ?? null, longitude: selected.longitude ?? null, assetId: selected.assetId ?? null, missionId: selected.missionId ?? null, evidenceId: (selected as typeof selected & { evidenceId?: number | null }).evidenceId ?? null, qualityGate: selectedEvidence?.qualityStatus ?? null, captureZone: selectedEvidence?.captureZone ?? null, repairEstimateCents: (selected as typeof selected & { repairEstimateCents?: number | null }).repairEstimateCents ?? null, urgency: (selected as typeof selected & { urgency?: string | null }).urgency ?? null, explanation: (selected as typeof selected & { explanation?: string[] | null }).explanation ?? null, annotationNote: (selected as typeof selected & { annotationNote?: string | null }).annotationNote ?? null }, findings: defects.slice(0, 50).map(defect => ({ id: defect.id, label: defect.label, defectType: defect.defectType, inspectionDomain: defect.inspectionDomain ?? null, severity: defect.severity, status: defect.status ?? null, reviewState: defect.reviewState ?? null, zeroErrorScore: defect.zeroErrorScore ?? null, confidencePercent: defect.confidencePercent ?? null, coveragePercent: defect.coveragePercent ?? null, latitude: defect.latitude ?? null, longitude: defect.longitude ?? null, assetId: defect.assetId ?? null, missionId: defect.missionId ?? null, evidenceId: defect.evidenceId ?? null, qualityGate: null, captureZone: null, repairEstimateCents: (defect as typeof defect & { repairEstimateCents?: number | null }).repairEstimateCents ?? null, urgency: (defect as typeof defect & { urgency?: string | null }).urgency ?? null, explanation: (defect as typeof defect & { explanation?: string[] | null }).explanation ?? null, annotationNote: (defect as typeof defect & { annotationNote?: string | null }).annotationNote ?? null })) } });
  };
  const createAiBrief = () => decisionSupport.mutate({
    defectType: selected.defectType,
    location: `${selected.latitude}, ${selected.longitude}`,
    missionName: missions[0]?.name ?? "DRIFT mission",
    score: {
      score: selected.zeroErrorScore,
      severity: selected.severity,
      urgency: selected.severity === "critical" ? "Isolate and dispatch within 4 hours" : selected.severity === "high" ? "Engineer review within 24 hours" : "Plan repair in the next maintenance cycle",
      explanation: selectedExplanation,
      repairEstimateCents: repairTotal,
    },
  });

  const aiCriticalCount = defects.filter(defect => defect.severity === "critical").length;
  const aiHealthScore = Math.max(0, Math.min(100, 100 - aiCriticalCount * 16 - defects.filter(defect => defect.severity === "high").length * 9 - defects.filter(defect => defect.severity === "medium").length * 4));
  const aiRiskBand = aiHealthScore < 45 ? "HIGH" : aiHealthScore < 70 ? "MEDIUM–HIGH" : aiHealthScore < 85 ? "MEDIUM" : "LOW";

  return (
    <div className="drift-shell">
      <aside className="command-rail">
        <div className="brand-mark"><span className="brand-square" /><span>DRIFT</span></div>
        <p className="rail-subtitle">DRONE BASED RECONNAISSANCE<br />&amp; FAULT TRACKING</p>
        <nav aria-label="DRIFT workspace navigation">
          {navItems.map(item => {
            const Icon = item.icon;
            return <button key={item.key} type="button" className={cn("nav-item", workspace === item.key && "active")} onClick={() => setWorkspace(item.key)}><Icon /><span>{item.label}</span><ChevronRight /></button>;
          })}
        </nav>
        <div className="rail-status">
          <span className={cn("connection-lamp", connectedStatus === "connected" && "connected", connectedStatus === "degraded" && "degraded")} />
          <div><span className="eyebrow">ADAPTER</span><strong>{connectedStatus}</strong></div>
        </div>
        <div className="rail-footer"><span>ZEROERROR / 01</span><span>V 1.0.0</span></div>
      </aside>

      <main className="main-stage">
        <header className="topbar">
          <div className="crumbs"><span>OPERATIONS</span><b>/</b><span>{workspace.toUpperCase()}</span></div>
          <div className="topbar-actions">
            <button type="button" className="role-toggle" disabled={isAuthenticated} onClick={() => setPreviewRole(role === "administrator" ? "engineer" : role === "engineer" ? "citizen" : "administrator")}><ShieldCheck /> {roleSource} · {role}</button>
            {canRunDemo && <button type="button" className="primary-action" onClick={() => runSimulator.mutate({ name: missionName })} disabled={runSimulator.isPending}><Play /> {runSimulator.isPending ? "SIMULATING" : "RUN DEMO"}</button>}
          </div>
        </header>

        <section className="identity-band">
          <div>
            <p className="eyebrow">{roleCopy[role].eyebrow}</p>
            <h1>{roleCopy[role].title}</h1>
          </div>
          <p>{roleCopy[role].note}</p>
          <div className="identity-code"><span>SYSTEM STATUS</span><strong>• {connectedStatus.toUpperCase()}</strong></div>
        </section>

        <section className="safety-banner">
          <CloudCog />
          <div><strong>{connectedStatus === "connected" ? "BRIDGE ONLINE" : connectedStatus === "retrying" || connectedStatus === "degraded" ? "BRIDGE DEGRADED" : "SIMULATOR READY"}</strong><span>{hardware.data?.operatorMessage ?? "No hardware endpoint configured. Simulator mode is available without a drone."}</span></div>
          <button type="button" onClick={() => setWorkspace("hardware")}>VIEW BRIDGE <ChevronRight /></button>
        </section>

        {activeAlerts.length > 0 && <section className="alert-strip"><AlertTriangle /><div><span className="eyebrow">OPEN MAINTENANCE ALERTS</span><strong>{activeAlerts[0]?.title}</strong><small>{activeAlerts[0]?.message}</small></div><button type="button" onClick={() => { setSeverityFilter("critical"); setWorkspace("defects"); }}>REVIEW {activeAlerts.length} ALERT{activeAlerts.length === 1 ? "" : "S"} <ChevronRight /></button></section>}

        {workspace === "operations" && <>
          <section className="stats-grid">
            <StatBlock label="ACTIVE MISSIONS" value={String(missions.length).padStart(2, "0")} detail="persisted missions" direction="up" />
            <StatBlock label="OPEN FINDINGS" value={String(defects.length).padStart(2, "0")} detail={`${criticalCount} critical review`} direction="down" />
            <StatBlock label="EXPOSURE ESTIMATE" value={formatCurrency(repairTotal)} detail="repair rules v1.0" />
            <StatBlock label="FLEET BATTERY" value={telemetry[0]?.batteryPercent === undefined ? "—" : `${telemetry[0].batteryPercent}%`} detail={telemetry.length ? "latest reported" : "no telemetry"} direction="up" />
          </section>

          <section className="operations-grid">
            <article className="panel map-panel">
              <div className="panel-heading"><div><span className="eyebrow">GEO-SPATIAL WORKBENCH</span><h2>Live defect field</h2></div><button type="button" className="icon-button" onClick={() => setWorkspace("defects")} aria-label="Open defect filters" title="Open defect filters"><SlidersHorizontal /></button></div>
              <DriftMap defects={defects} telemetry={telemetry} selectedId={selected.id || undefined} onSelect={setSelectedId} />
              <div className="map-finding-summary"><div className="summary-counts">{severitySummary.map(item => <button key={item.severity} type="button" className={cn("summary-count", severityClass(item.severity), severityFilter === item.severity && "active")} onClick={() => { setSeverityFilter(item.severity); setWorkspace("defects"); }}><strong>{item.count}</strong><span>{item.severity}</span></button>)}</div><div className="selected-finding"><div><span className="eyebrow">SELECTED FINDING</span><strong>{selected.label}</strong><small>{selected.defectType} · {selected.inspectionDomain ?? "domain pending"} · {selected.reviewState} review</small></div><div className="selected-finding-metrics"><span><b>{selected.zeroErrorScore}</b> score</span><span><b>{selected.confidencePercent}%</b> confidence</span><span><b>{selected.latitude}, {selected.longitude}</b> GPS</span><span><b>{availableAssets.find(asset => asset.id === selected.assetId)?.name ?? `ASSET ${selected.assetId || "UNASSIGNED"}`}</b> asset</span><span><b>{selectedEvidence?.captureZone ?? "NOT RECORDED"}</b> capture zone</span><span><b>{selectedEvidence?.qualityStatus ?? "NOT GATED"}</b> quality gate</span></div><SeverityChip severity={selected.severity} /></div></div>
              <div className="mission-strip"><div><span className="eyebrow">CURRENT MISSION</span><strong>{missions[0]?.name}</strong></div><div><span className="eyebrow">FLIGHT STATE</span><strong className="status-active">{missions[0]?.status ?? "active"}</strong></div><div><span className="eyebrow">WAYPOINTS</span><strong>{telemetry.length} POINTS</strong></div><button type="button" onClick={() => setWorkspace("evidence")} disabled={!evidenceItems.length}>OPEN EVIDENCE <ChevronRight /></button></div>
            </article>

            <article className="panel priority-panel">
              <div className="panel-heading"><div><span className="eyebrow">ZEROERROR QUEUE</span><h2>Action first</h2></div><span className="queue-count">{defects.length}</span></div>
              <div className="priority-list">
                {defects.slice(0, 4).map(defect => <button type="button" key={defect.id} className={cn("priority-item", selected.id === defect.id && "selected")} onClick={() => setSelectedId(defect.id)}><span className={cn("item-index", severityClass(defect.severity))}>{String(defect.id).slice(-2)}</span><span className="priority-content"><strong>{defect.label}</strong><small>{defect.confidencePercent}% confidence · score {defect.zeroErrorScore}</small></span><SeverityChip severity={defect.severity} /></button>)}
              </div>
              <button type="button" className="secondary-action full" onClick={() => setWorkspace("defects")}>OPEN MAINTENANCE QUEUE <ChevronRight /></button>
            </article>
          </section>

          <section className="lower-grid">
            <article className="panel evidence-panel">
              <div className="panel-heading"><div><span className="eyebrow">EVIDENCE REVIEW</span><h2>{selected.label}</h2></div><span className="evidence-time">{selectedEvidence?.capturedAt ? new Date(selectedEvidence.capturedAt).toLocaleTimeString() : "NO CAPTURE TIME"}</span></div>
              {selectedEvidence ? <div className="evidence-frame media-frame">{selectedEvidence.mediaKind === "video" ? <video src={selectedEvidence.storageUrl} controls preload="metadata" aria-label={selectedEvidence.fileName} /> : <img src={selectedEvidence.storageUrl} alt={selectedEvidence.fileName} />}<div className="bounding-box"><b>{selected.defectType.toUpperCase()}</b><small>{selected.confidencePercent}% confidence</small></div><div className="frame-metrics"><span>GPS {selectedEvidence.latitude ?? selected.latitude} / {selectedEvidence.longitude ?? selected.longitude}</span><span>ALTITUDE NOT ATTACHED</span><span>{selectedEvidence.cameraId ?? "CAMERA UNKNOWN"}</span><span>ZONE {selectedEvidence.captureZone ?? "UNKNOWN"} · QUALITY {selectedEvidence.qualityStatus ?? "PENDING"}</span></div><div className="frame-provenance"><span>SOURCE {selectedEvidence.source ?? "UNKNOWN"}</span><span>{evidenceProvenance(selectedEvidence.provenance)}</span></div></div> : <div className="evidence-frame empty-state"><h3>No stored evidence selected</h3><p>Run a simulator mission or upload an inspection image to create a reviewable evidence record.</p></div>}
              <div className="explain-row"><ScanLine /><p>{selectedExplanation.join(" · ")}</p><button type="button" onClick={() => setWorkspace("evidence")}>REVIEW <ChevronRight /></button></div>
            </article>

            <article className="panel decision-panel">
              <div className="panel-heading"><div><span className="eyebrow">ENGINEER DECISION</span><h2>Human checkpoint</h2></div><ClipboardCheck /></div>
              <div className="decision-score"><span className={cn("score-orb", severityClass(selected.severity))}>{selected.zeroErrorScore}</span><div><span className="eyebrow">ZEROERROR PRIORITY</span><h3>{selected.severity} intervention</h3><p>AI is advisory. An authorised engineer must approve, override, or request a site visit.</p></div></div>
              {!canOperate ? <div className="citizen-notice">Sign in as an engineer or administrator to submit an engineering decision. Demo preview remains read-only for approvals and overrides.</div> : <div className="decision-actions"><button type="button" onClick={() => submitReview("approve")}><CheckCheck /> APPROVE</button><button type="button" onClick={() => submitReview("override")}><Wrench /> OVERRIDE</button><button type="button" onClick={() => submitReview("needs_site_visit")}><MapPinned /> SITE VISIT</button></div>}
            </article>
          </section>
          <section className="drift-ai-panel"><div className="drift-ai-heading"><div><span className="eyebrow">DRIFT AI · INSPECTION COPILOT</span><h2>Ask the evidence, not the guess</h2><p>DRIFT AI reads the selected finding, exact coordinates, severity, confidence, quality gate, mission telemetry, evidence count, and review state. It never issues flight commands or replaces engineer sign-off.</p></div><div className="drift-ai-badge"><Sparkles /> {driftAiSource === "gemini" ? "GEMINI CONNECTED" : driftAiSource === "openai" ? "OPENAI CONNECTED" : driftAiProviderStatus.endsWith("-429") ? "AI QUOTA REQUIRED" : driftAiProviderStatus.endsWith("-401") || driftAiProviderStatus.endsWith("-403") ? "AI KEY REJECTED" : driftAiSource === "deterministic-fallback" ? "FALLBACK · PROVIDER UNAVAILABLE" : driftAiSource === "deterministic-intent" ? "RULES · PROVIDER NOT CONFIGURED" : "READY FOR QUESTION"}</div></div><div className="drift-ai-metrics"><div><span>ANALYZED RECORDS</span><strong>{evidenceItems.length || defects.length}</strong><small>{evidenceItems.length ? "evidence items" : "finding records"}</small></div><div><span>CRITICAL DEFECTS</span><strong>{aiCriticalCount}</strong><small>engineer review</small></div><div><span>BRIDGE HEALTH</span><strong>{aiHealthScore}<em>/100</em></strong><small>derived triage score</small></div><div><span>RISK BAND</span><strong>{aiRiskBand}</strong><small>not a failure prediction</small></div><div><span>REPAIR EXPOSURE</span><strong>{formatCurrency(repairTotal)}</strong><small>stored estimates</small></div></div>{pendingAiFilter && <div className="drift-ai-filter-suggestion"><span>DRIFT AI suggests showing only <strong>{pendingAiFilter}</strong> findings on the map.</span><button type="button" onClick={() => { setSeverityFilter(pendingAiFilter); setWorkspace("defects"); setPendingAiFilter(null); }}>APPLY FILTER</button><button type="button" onClick={() => setPendingAiFilter(null)}>DISMISS</button></div>}<AIChatBox messages={driftAiMessages} onSendMessage={askDriftAi} isLoading={driftAi.isPending} height="430px" className="drift-ai-chat" placeholder="Ask: Why is this critical? What should the engineer verify next?" emptyStateMessage="DRIFT AI is ready for an inspection question." suggestedPrompts={["What are the most critical defects?", "Which defects need immediate repair?", "Why was this finding marked severe?", "Summarize this inspection and risk", "Compare with the previous inspection", "What should the engineer inspect manually?"]} /></section>
          {role === "administrator" && <section className="admin-grid"><article className="panel admin-panel"><div className="panel-heading"><div><span className="eyebrow">ADMINISTRATOR WORKSPACE</span><h2>Asset governance</h2></div><Layers3 /></div><div className="governance-list">{availableAssets.slice(0, 4).map(asset => <div key={asset.id}><strong>{asset.name}</strong><span>{asset.assetType} · criticality {asset.criticality}/5 · {asset.status}</span></div>) || <p>No managed assets are available yet.</p>}</div><p className="access-note">Asset create, update, and delete actions are server-authorized for authenticated administrator roles. This unauthenticated display is clearly marked as a preview.</p></article><article className="panel admin-panel"><div className="panel-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Accountability log</h2></div><ClipboardCheck /></div><div className="governance-list">{(live?.audit ?? []).slice(0, 4).map(event => <div key={event.id}><strong>{event.action}</strong><span>{new Date(event.createdAt).toLocaleString()}</span></div>) || <p>No audit entries yet.</p>}</div><p className="access-note">Every simulator run, evidence upload, telemetry event, and review decision is written to the audit record.</p></article></section>}
        </>}

        {workspace === "defects" && <section className="workspace-page">
          <div className="workspace-header"><div><span className="eyebrow">FILTERABLE MAINTENANCE QUEUE</span><h2>Defect control</h2></div><div className="filter-row">{(["all", "critical", "high", "medium", "low"] as const).map(filter => <button key={filter} type="button" className={cn(severityFilter === filter && "active")} onClick={() => setSeverityFilter(filter)}>{filter}</button>)}</div></div>
          <div className="advanced-filters"><label>DEFECT TYPE<select value={defectTypeFilter} onChange={event => setDefectTypeFilter(event.target.value as typeof defectTypeFilter)}><option value="all">All types</option><option value="structural">Structural</option><option value="crack">Crack</option><option value="pothole">Pothole</option><option value="corrosion">Corrosion</option><option value="spalling">Spalling</option><option value="exposed_rebar">Exposed rebar</option><option value="water_intrusion">Water intrusion</option><option value="settlement">Settlement</option><option value="rail_alignment">Rail alignment</option><option value="obstruction">Obstruction</option><option value="lighting_failure">Lighting failure</option></select></label><label>DOMAIN<select value={domainFilter} onChange={event => setDomainFilter(event.target.value as typeof domainFilter)}><option value="all">All domains</option>{INSPECTION_DOMAINS.map(domain => <option key={domain} value={domain}>{domain.replaceAll("-", " ")}</option>)}</select></label><label>STATUS<select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">All states</option><option value="detected">Detected</option><option value="under_review">Under review</option><option value="verified">Verified</option><option value="scheduled">Scheduled</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></label><label>REVIEW<select value={reviewFilter} onChange={event => setReviewFilter(event.target.value as typeof reviewFilter)}><option value="all">All reviews</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="overridden">Overridden</option><option value="rejected">Rejected</option></select></label><label>MISSION<select value={missionFilter} onChange={event => setMissionFilter(event.target.value === "all" ? "all" : Number(event.target.value))}><option value="all">All missions</option>{availableMissions.map(mission => <option key={mission.id} value={mission.id}>{mission.name}</option>)}</select></label><label>ASSET<select value={assetFilter} onChange={event => setAssetFilter(event.target.value === "all" ? "all" : Number(event.target.value))}><option value="all">All assets</option>{availableAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label></div>
          <div className="defect-table"><div className="table-row table-head"><span>FINDING</span><span>MISSION</span><span>CONFIDENCE</span><span>PRIORITY</span><span>REVIEW</span></div>{visibleDefects.map(defect => <div key={defect.id} className="table-row"><div><strong>{defect.label}</strong><small>{defect.defectType} · {defect.inspectionDomain ?? "domain pending"} · {defect.latitude}, {defect.longitude}</small></div><span>{availableMissions.find(mission => mission.id === defect.missionId)?.name ?? "MISSION UNASSIGNED"}</span><span>{defect.confidencePercent}%</span><SeverityChip severity={defect.severity} />{!canOperate ? <span className="public-status">PUBLIC STATUS</span> : <div className="review-buttons"><button type="button" onClick={() => { setSelectedId(defect.id); submitReview("approve"); }}>APPROVE</button><button type="button" onClick={() => { setSelectedId(defect.id); submitReview("override"); }}>OVERRIDE</button></div>}</div>)}</div>
        </section>}

        {workspace === "evidence" && <section className="workspace-page evidence-workspace">
          <div className="workspace-header"><div><span className="eyebrow">SECURE MISSION MEDIA</span><h2>Evidence vault</h2></div><div><input ref={filePickerRef} className="file-picker" type="file" accept="image/*,video/*" onChange={event => handleEvidenceFile(event.target.files?.[0])} /><button type="button" className="primary-action" onClick={() => filePickerRef.current?.click()} disabled={!canOperate || uploadEvidence.isPending} title={!canOperate ? "Sign in as an engineer or administrator to upload original drone media." : undefined}><Upload /> {uploadEvidence.isPending ? "STORING" : !canOperate ? "SIGN IN TO UPLOAD" : "UPLOAD EVIDENCE"}</button></div></div>
          <DriftMap defects={defects.filter(defect => defect.missionId === missionIdForEvidence)} telemetry={telemetry.filter(point => (point as typeof point & { missionId?: number }).missionId === missionIdForEvidence)} selectedId={selected.id || undefined} onSelect={setSelectedId} className="mb-6" />
          <div className="evidence-grid">{evidenceItems.length ? evidenceItems.map((item, index) => <article key={item.id} className="evidence-card"><button type="button" className={cn("evidence-thumb", `thumb-${index % 3}`)} onClick={() => setEvidencePreview(item)} aria-label={`Preview ${item.fileName}`}><span className="sr-only">Preview {item.fileName}</span>{item.mediaKind === "photo" || item.mediaKind === "annotation" ? <img src={item.storageUrl} alt={item.fileName} /> : null}{item.mediaKind === "video" && <video src={item.storageUrl} controls preload="metadata" />}<span>{String(index + 1).padStart(2, "0")}</span><div className="thumb-box" /></button><div><span className="severity-chip severity-low">{item.source ?? "stored"} · {item.mediaKind}</span><h3>{item.fileName}</h3><p>{item.source === "reference" ? "Real reference photograph · not live drone evidence" : item.source === "simulator" ? "Simulator/reference media · not a live inspection" : "Stored mission media"} · {item.latitude ?? "GPS pending"}, {item.longitude ?? ""}</p><small className="provenance-line">{evidenceProvenance(item.provenance)}{evidenceSourceUrl(item.provenance) ? <a href={evidenceSourceUrl(item.provenance)!} target="_blank" rel="noreferrer"> · VIEW SOURCE</a> : null}</small></div><div className="evidence-actions"><button type="button" onClick={() => setEvidencePreview(item)}>VIEW</button><a href={item.storageUrl} target="_blank" rel="noreferrer">OPEN ORIGINAL <ChevronRight /></a><a href={item.storageUrl} download={item.fileName}>DOWNLOAD</a>{item.latitude && item.longitude && <button type="button" onClick={() => { setSelectedId(Number((item as EvidenceItem & { defectId?: number }).defectId ?? selected.id)); setWorkspace("operations"); }}>LOCATE</button>}</div></article>) : <article className="empty-state"><h3>No evidence stored for this mission</h3><p>Upload a real inspection photo or video, or run the simulator to create clearly labelled demonstration evidence.</p></article>}</div>{evidencePreview && <div className="evidence-modal-backdrop" role="presentation" onClick={() => setEvidencePreview(null)}><div className="evidence-modal" role="dialog" aria-modal="true" aria-label={`Evidence preview ${evidencePreview.fileName}`} onClick={event => event.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">EVIDENCE PREVIEW · {evidencePreview.source ?? "stored"}</span><h3>{evidencePreview.fileName}</h3></div><button type="button" onClick={() => setEvidencePreview(null)} aria-label="Close evidence preview">CLOSE</button></div>{evidencePreview.mediaKind === "video" ? <video src={evidencePreview.storageUrl} controls autoPlay /> : <img src={evidencePreview.storageUrl} alt={evidencePreview.fileName} />}{Boolean(evidencePreview.provenance) && <p className="provenance-line">{evidenceProvenance(evidencePreview.provenance)}</p>}<div className="modal-actions"><a href={evidencePreview.storageUrl} target="_blank" rel="noreferrer">OPEN ORIGINAL</a><a href={evidencePreview.storageUrl} download={evidencePreview.fileName}>DOWNLOAD</a></div></div></div>}
        </section>}

        {workspace === "reports" && <section className="workspace-page reports-workspace">
          <div className="workspace-header"><div><span className="eyebrow">AUDIT-READY OUTPUTS</span><h2>Inspection reports</h2><p className="workspace-lede">Generate a structured PDF that keeps severity, evidence, coordinates, uncertainty, recommendations, and sign-off in one reviewable record.</p></div><div className="report-actions-header"><button type="button" className="secondary-action" onClick={createAiBrief} disabled={!canOperate || decisionSupport.isPending} title={!canOperate ? "Sign in as an engineer or administrator to create a decision narrative." : undefined}><Sparkles /> {decisionSupport.isPending ? "ANALYSING" : !canOperate ? "SIGN IN FOR NARRATIVE" : "AI NARRATIVE"}</button><button type="button" className="primary-action" onClick={createPdfReport} disabled={!canOperate || generateReport.isPending} title={!canOperate ? "Sign in as an engineer or administrator to generate a report." : undefined}><FileText /> {generateReport.isPending ? "BUILDING PDF" : !canOperate ? "SIGN IN FOR PDF" : "GENERATE PDF REPORT"}</button></div></div>
          {reportResult && <article className="report-preview-panel"><div><span className="eyebrow">LATEST GENERATED REPORT · {reportResult.format === "application/pdf" ? "PDF" : "REPORT"}</span><h3>{reportResult.title}</h3><p>{reportResult.evidenceCount} evidence records · {reportResult.defectCount} candidate findings · engineer sign-off pending</p></div><div className="report-preview-stats">{(["critical", "high", "medium", "low"] as const).map(severity => <span key={severity} className={severityClass(severity)}><b>{reportResult.severityCounts?.[severity] ?? 0}</b> {severity}</span>)}</div>{reportResult.storageUrl ? <a className="primary-action" href={reportResult.storageUrl} target="_blank" rel="noreferrer"><FileText /> OPEN PDF</a> : <span className="report-missing">PDF storage URL unavailable</span>} {reportResult.storageUrl && <div className="report-preview-embed"><iframe title="Latest DRIFT inspection report" src={reportResult.storageUrl} /></div>}</article>}
          {aiBrief && <article className="ai-brief"><span className="eyebrow">AI DECISION-SUPPORT DRAFT · ENGINEER REVIEW REQUIRED</span><p>{aiBrief}</p></article>}
          <div className="report-stack">{reports.map(report => { const scope = report.inspectionScope && typeof report.inspectionScope === "object" ? report.inspectionScope as Record<string, unknown> : {}; const severityCounts = scope.severityCounts && typeof scope.severityCounts === "object" ? scope.severityCounts as Record<string, number> : {}; return <article className="report-card" key={report.id}><div className="report-number">R/{String(report.id).padStart(3, "0")}</div><div><span className="eyebrow">{report.status} · {scope.format === "application/pdf" ? "PDF" : "RECORD"}</span><h3>{report.title}</h3><p>{report.narrative}</p><div className="report-mini-metrics"><span>{String(scope.evidenceCount ?? "—")} evidence</span><span>{String(scope.defectCount ?? "—")} findings</span><span className="critical-text">{String(severityCounts.critical ?? 0)} critical</span><span>{String(severityCounts.high ?? 0)} high</span></div></div><div className="report-actions"><button type="button" onClick={() => { setReportResult({ title: report.title, storageUrl: report.storageUrl ?? undefined, evidenceCount: Number(scope.evidenceCount ?? 0), defectCount: Number(scope.defectCount ?? 0), format: String(scope.format ?? "") , severityCounts }); auditAction("Report preview"); }}>PREVIEW</button>{report.storageUrl ? <a href={report.storageUrl} target="_blank" rel="noreferrer">OPEN PDF</a> : <span className="report-missing">PDF unavailable</span>}</div></article>; })}</div>
          {!reports.length && <article className="empty-state report-empty"><FileText /><h3>No report records yet</h3><p>Run a simulator mission, then generate the PDF report. Reports remain explicitly pending until an authorised engineer signs off.</p></article>}
        </section>}

        {workspace === "hardware" && <section className="workspace-page hardware-workspace">
          <div className="workspace-header"><div><span className="eyebrow">OPERATOR-CONTROLLED INTEGRATION</span><h2>Hardware bridge</h2></div><span className={cn("hardware-status", connectedStatus)}>{connectedStatus}</span></div>
          <div className="uav-capture-console">
            <article className="hardware-card uav-profile-card">
              <RadioTower />
              <span className="eyebrow">01 · AIRCRAFT / BRIDGE PROFILE</span>
              <h3>Choose a compatible UAV path</h3>
              <p>DRIFT is airframe-agnostic. Select a profile now; an operator-approved PX4/ArduPilot MAVLink bridge or HTTP/RTSP media gateway is connected later. DRIFT does not arm, launch, navigate, or control the aircraft.</p>
              <label>Aircraft profile<select value={uavProfile} onChange={event => setUavProfile(event.target.value)}><option>PX4 / ArduPilot MAVLink-compatible UAV</option><option>DJI-compatible media export / operator bridge</option><option>Custom UAV / HTTP telemetry gateway</option><option>RTSP camera payload / media gateway</option></select></label>
              <label>Bridge contract<select value={uavAdapter} onChange={event => setUavAdapter(event.target.value as typeof uavAdapter)}><option value="mavlink-bridge">MAVLink telemetry bridge</option><option value="http-webhook">HTTP telemetry webhook</option><option value="rtsp-media">RTSP media gateway</option></select></label>
              <code>MAVLink / UDP or serial → operator bridge → authenticated DRIFT ingest</code>
            </article>
            <article className="hardware-card uav-capture-card">
              <Video />
              <span className="eyebrow">02 · CAPTURE MISSION</span>
              <h3>Record original drone evidence</h3>
              <p>Create a hardware-mode preflight mission, then upload original camera photos or clips. Each stored item is marked as operator UAV capture and carries camera, time, location, mission, and inference provenance.</p>
              <label>Mission label<input value={uavMissionName} onChange={event => setUavMissionName(event.target.value)} /></label>
              <div className="uav-coordinate-inputs"><label>Latitude<input value={uavLatitude} onChange={event => setUavLatitude(event.target.value)} inputMode="decimal" /></label><label>Longitude<input value={uavLongitude} onChange={event => setUavLongitude(event.target.value)} inputMode="decimal" /></label></div>
              <button type="button" onClick={startUavCaptureMission} disabled={!canOperate || createHardwareCaptureMission.isPending} title={!canOperate ? "Sign in as an engineer or administrator to create a UAV capture mission." : undefined}>{createHardwareCaptureMission.isPending ? "CREATING PREFLIGHT" : !canOperate ? "SIGN IN FOR PREFLIGHT" : "CREATE UAV PREFLIGHT MISSION"} <ChevronRight /></button>
              <button type="button" className="secondary-action" onClick={() => { setWorkspace("evidence"); setTimeout(() => filePickerRef.current?.click(), 0); }} disabled={!canOperate} title={!canOperate ? "Sign in as an engineer or administrator to upload original drone media." : undefined}>{!canOperate ? "SIGN IN TO UPLOAD" : "UPLOAD ORIGINAL DRONE MEDIA"} <Upload /></button>
            </article>
            <article className="hardware-card">
              <ShieldCheck />
              <span className="eyebrow">03 · LIVE STATUS / SAFE FALLBACK</span>
              <h3>{hardware.data?.adapter ?? "No bridge configured"}</h3>
              <p>{hardware.data?.operatorMessage ?? "No compatible hardware endpoint configured. The simulator is available without claiming a real flight."}</p>
              <div className="hardware-checklist"><span>Telemetry: GPS · altitude · battery · speed</span><span>Media: original photo/video + capture metadata</span><span>Report: evidence-bound, engineer sign-off required</span></div>
              <button type="button" onClick={() => runSimulator.mutate({ name: missionName })} disabled={runSimulator.isPending}>{runSimulator.isPending ? "SIMULATING" : "RUN CLEARLY LABELLED DEMO"} <ChevronRight /></button>
            </article>
          </div>
        </section>}

        <footer className="console-footer"><span>DRIFT / ZEROERROR MAINTENANCE INTELLIGENCE</span><span>ENGINEER REVIEW REQUIRED FOR ALL AUTOMATED PRIORITIES</span></footer>
      </main>
    </div>
  );
}
