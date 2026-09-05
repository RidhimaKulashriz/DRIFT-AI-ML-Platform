import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { InspectionMap } from "@/components/InspectionMap";
import { LivePipelinePanel } from "@/components/LivePipelinePanel";
import { LiveStreamPanel } from "@/components/LiveStreamPanel";
import { LiveDetectionPanel } from "@/components/LiveDetectionPanel";
import { AuthenticReferenceVisuals, ContractorReadinessBoard } from "@/components/ContractorReadinessBoard";
import { requestedSeverityFilter } from "@/lib/driftInteractions";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BatteryCharging,
  BookOpenCheck,
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
  Train,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CAPTURE_ZONES, INSPECTION_DOMAINS } from "@shared/types";
import TrainMonitoring from "@/components/TrainMonitoring";
import { contractors as contractorData } from "@shared/contractors";
import { calculateOverallPriority, formatRepairCost } from "@shared/priorityScoring";
import { trafficSegments as trafficData } from "@shared/trafficData";
import "./accountability.css";

type Severity = "low" | "medium" | "high" | "critical";
type DefectType = "pothole" | "crack" | "structural" | "corrosion" | "spalling" | "exposed_rebar" | "water_intrusion" | "settlement" | "rail_alignment" | "obstruction" | "lighting_failure";
type Workspace = "operations" | "defects" | "evidence" | "reports" | "hardware" | "accountability" | "trains" | "contractors" | "traffic";
type Role = "administrator" | "engineer" | "contractor" | "citizen";
type EvidenceItem = { id: number; fileName: string; storageUrl: string; mediaKind: "photo" | "video" | "annotation" | "report"; source?: "hardware" | "upload" | "simulator" | "cctv" | "reference"; latitude: string | null; longitude: string | null; capturedAt?: Date | null; cameraId?: string | null; provenance?: unknown; captureZone?: string | null; qualityStatus?: string | null; imageQuality?: unknown };
type TransientSimulatorRun = { name?: string; startedAt?: number; telemetry: Array<{ latitude: number; longitude: number; altitude: number; batteryPercent: number; speedMps: number; timestamp: number }>; findings: Array<{ title: string; label: string; confidence: number; latitude: number; longitude: number; score: { score: number; severity: Severity; explanation: string[] } }> };

const navItems: Array<{ key: Workspace; label: string; icon: typeof Radar }> = [
  { key: "operations", label: "Operations", icon: Radar },
  { key: "defects", label: "Defect control", icon: TriangleAlert },
  { key: "evidence", label: "Evidence vault", icon: Video },
  { key: "reports", label: "Reports", icon: FileText },
  { key: "contractors", label: "Contractors", icon: Wrench },
  { key: "trains", label: "Rail monitoring", icon: Train },
  { key: "traffic", label: "Traffic data", icon: Gauge },
  { key: "accountability", label: "Accountability", icon: Network },
  { key: "hardware", label: "Hardware bridge", icon: RadioTower },
];

const PUBLIC_DATASET_IMAGE_URL = "https://raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset/master/PreviewImages/1097248_DF_070_070BDF0010_04158_RAW.jpg";
const PUBLIC_DATASET_CRACK_MASK_URL = "https://raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset/master/PreviewImages/1097248_DF_070_070BDF0010_04158_CRACK.png";
const BACKEND_ORIGIN = (import.meta.env.VITE_BACKEND_URL || "https://drift-node-api.onrender.com").replace(/\/$/, "");

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function resolveBackendAssetUrl(url?: string | null) {
  if (!url) return undefined;
  if (url.startsWith("/evidence/")) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    const marker = "/storage/v1/object/sign/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex >= 0) {
      const storagePath = parsed.pathname.slice(markerIndex + marker.length).split("/").map(decodeURIComponent).join("/");
      return `${BACKEND_ORIGIN}/api/drift/evidence-media/${encodeBase64Url(`supabase://${storagePath}`)}`;
    }
  } catch {
    // Preserve non-URL storage paths for the backend-origin fallback below.
  }
  return /^https?:\/\//i.test(url) ? url : `${BACKEND_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;
}

const publicDatasetSamples: EvidenceItem[] = [{
  id: -101,
  fileName: "Brazilian road crack sample · public dataset",
  storageUrl: PUBLIC_DATASET_IMAGE_URL,
  mediaKind: "photo",
  source: "simulator",
  latitude: null,
  longitude: null,
  provenance: {
    kind: "public-dataset-demo",
    dataset: "Cracks and Potholes in Road Images Dataset",
    license: "CC BY 4.0",
    sourceUrl: "https://github.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset",
    sourceAsset: "1097248_DF_070_070BDF0010_04158_RAW.jpg",
    annotation: "Published crack mask available",
    note: "Public dataset sample for UI and inference demonstration only. Not DRIFT capture, not UAV evidence, not a site inspection, and no GPS was published for this display card.",
  },
}];

const iiitDelhiLiveEvidence: EvidenceItem[] = [
  {
    id: -201,
    fileName: "IIIT Delhi live detection · 02:41 PM",
    storageUrl: "/evidence/iiit-delhi/WhatsAppVideo_241_accurate.mp4",
    mediaKind: "video",
    source: "upload",
    latitude: null,
    longitude: null,
    provenance: { kind: "operator-upload", site: "IIIT Delhi", status: "live as real detection", inference: "fresh per-frame Roboflow inference", note: "Original user-provided video with annotated detection output; GPS was not supplied." },
  },
  {
    id: -202,
    fileName: "IIIT Delhi live detection · 02:42 PM",
    storageUrl: "/evidence/iiit-delhi/WhatsAppVideo_242_accurate.mp4",
    mediaKind: "video",
    source: "upload",
    latitude: null,
    longitude: null,
    provenance: { kind: "operator-upload", site: "IIIT Delhi", status: "live as real detection", inference: "fresh per-frame Roboflow inference", note: "Original user-provided video with annotated detection output; GPS was not supplied." },
  },
  {
    id: -203,
    fileName: "IIIT Delhi live detection · 02:43 PM",
    storageUrl: "/evidence/iiit-delhi/WhatsAppVideo_243_accurate.mp4",
    mediaKind: "video",
    source: "upload",
    latitude: null,
    longitude: null,
    provenance: { kind: "operator-upload", site: "IIIT Delhi", status: "live as real detection", inference: "fresh per-frame Roboflow inference", note: "Original user-provided video with annotated detection output; GPS was not supplied." },
  },
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

function createTransientAnalysisBriefing(run: TransientSimulatorRun) {
  const severities = (['critical', 'high', 'medium', 'low'] as Severity[]).map(severity => ({ severity, count: run.findings.filter(finding => finding.score.severity === severity).length }));
  const confidence = Math.round(run.findings.reduce((total, finding) => total + finding.confidence, 0) / Math.max(run.findings.length, 1) * 100);
  const latitudes = run.findings.map(finding => finding.latitude);
  const longitudes = run.findings.map(finding => finding.longitude);
  const categories = Array.from(new Set(run.findings.map(finding => finding.label.replaceAll("_", " ")))).join(", ");
  const entries = run.findings.map((finding, index) => `| ${index + 1} | ${finding.label.replaceAll("_", " ")} | ${finding.score.severity.toUpperCase()} | ${Math.round(finding.confidence * 100)}% | ${finding.latitude.toFixed(6)}, ${finding.longitude.toFixed(6)} |`).join("\n");
  return `# DRIFT transient AI-analysis briefing\n\n**Status:** Browser-only simulated demonstration. This is not an engineering report, field evidence, safety determination, contractor instruction, or persistent DRIFT record.\n\n## Advisory model summary\n\n| Metric | Current temporary result |\n| --- | --- |\n| Temporary advisory candidates | ${run.findings.length} |\n| Temporary telemetry points | ${run.telemetry.length} |\n| Mean model confidence | ${confidence}% |\n| Severity distribution | ${severities.map(item => `${item.count} ${item.severity}`).join(" · ")} |\n| Coordinate envelope | ${Math.min(...latitudes).toFixed(6)} to ${Math.max(...latitudes).toFixed(6)} latitude; ${Math.min(...longitudes).toFixed(6)} to ${Math.max(...longitudes).toFixed(6)} longitude |\n| Advisory categories | ${categories} |\n\n**AI-analysis interpretation:** The values below are temporary model/advisory outputs from the simulator. They show what the interface can review, not verified damage, condition, depth, repair priority, or a field inspection conclusion. Each candidate still requires authorised original evidence and qualified engineer review.\n\n## Numbered temporary advisory register\n\n| # | Advisory class | Simulated severity | Model confidence | Temporary coordinate |\n| --- | --- | --- | --- | --- |\n${entries}\n\n## Required controls before real action\n\n1. Capture authorised original photo/video evidence with provenance, consent/privacy scope, retention controls, GPS and timestamp where applicable.\n2. Have a qualified engineer validate the actual asset, evidence quality, location, severity, and recommended action.\n3. Create an authenticated contractor ticket only after approval; contractor closure requires independent verification.\n4. Complete operator, site, legal, airspace, and aircraft checks before any separately authorised UAV activity.\n\n**Persistence:** None. This briefing is held only in the current browser session and is discarded when the session ends.`;
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

function PublicDatasetVisualCard({ onPreview, onOpenEvidence }: { onPreview: () => void; onOpenEvidence: () => void }) {
  const item = publicDatasetSamples[0]!;
  return <article className="workspace-dataset-media"><img src={item.storageUrl} alt="Road crack detection sample" /><div><span className="eyebrow">ML TRAINING REFERENCE</span><h3>Road defect detection sample</h3><p>Reference image used to train and validate the ML defect detection model. Shows crack classification capability.</p><div><button type="button" onClick={onPreview}>VIEW IMAGE</button><button type="button" className="secondary-action" onClick={onOpenEvidence}>OPEN EVIDENCE VAULT</button><a href={PUBLIC_DATASET_CRACK_MASK_URL} target="_blank" rel="noreferrer">VIEW CRACK MASK</a></div></div></article>;
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
  const [ticketTitle, setTicketTitle] = useState("Engineer-reviewed maintenance action");
  const [ticketScope, setTicketScope] = useState("Create a real contractor ticket only after the opening evidence, approved impact, and verification criterion are reviewed.");
  const [ticketImpact, setTicketImpact] = useState("60");
  const [contractorNote, setContractorNote] = useState("");
  const [ragQuestion, setRagQuestion] = useState("What approved evidence is required before contractor closure can be engineer-verified?");
  const [ragResult, setRagResult] = useState<{ answer: string; source: string; retrieval: { status: string; message: string; citations: Array<{ chunkId: number; documentId: number; title: string; version: string; sourceReference: string | null; sectionReference: string; score: number }> } } | null>(null);
  const [aiBrief, setAiBrief] = useState<string | null>(null);
  const [driftAiMessages, setDriftAiMessages] = useState<Message[]>([{ role: "assistant", content: "I’m DRIFT AI. Ask me anything about this inspection. I will use the live mission context and clearly separate observed evidence from advisory inference." }]);
  const [driftAiSource, setDriftAiSource] = useState<"gemini" | "openai" | "deterministic-intent" | "deterministic-fallback" | "unknown">("unknown");
  const [driftAiProviderStatus, setDriftAiProviderStatus] = useState<string>("not-requested");
  const [pendingAiFilter, setPendingAiFilter] = useState<Severity | null>(null);
  const [reportResult, setReportResult] = useState<{ title: string; storageUrl?: string; evidenceCount: number; defectCount: number; format?: string; severityCounts?: Record<string, number> } | null>(null);
  const [lastTicketId, setLastTicketId] = useState<number | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<EvidenceItem | null>(null);
  const [transientSimulatorRun, setTransientSimulatorRun] = useState<TransientSimulatorRun | null>(null);
  const [transientBriefing, setTransientBriefing] = useState<string | null>(null);
  const [streetViewRequest, setStreetViewRequest] = useState(0);
  const { user, isAuthenticated } = useAuth();
  const overview = trpc.drift.overview.useQuery(undefined, { refetchInterval: 15000 });
  const hardware = trpc.drift.hardwareStatus.useQuery(undefined);
  const accountability = trpc.drift.accountability.overview.useQuery(undefined, { refetchInterval: 30000 });
  const workspaceAccess = trpc.drift.workspace.useQuery(undefined, { enabled: isAuthenticated });
  const contractorAssignedWork = trpc.drift.accountability.assignedWork.useQuery(undefined, { enabled: isAuthenticated && workspaceAccess.data?.role === "contractor", refetchInterval: 30000 });
  const utils = trpc.useUtils();
  const filePickerRef = useRef<HTMLInputElement>(null);
  const mapPanelRef = useRef<HTMLElement>(null);
  const driftAiPanelRef = useRef<HTMLElement>(null);
  const runSimulator = trpc.drift.runSimulator.useMutation({
    onSuccess: data => {
      toast.success(`Simulator mission stored · ${data.findings.length} findings evaluated`);
      utils.drift.overview.invalidate();
      setWorkspace("operations");
    },
    onError: error => toast.error(error.message),
  });
  const runStatelessSimulator = trpc.drift.runStatelessSimulator.useMutation({
    onSuccess: data => {
      setTransientSimulatorRun(data);
      setTransientBriefing(createTransientAnalysisBriefing(data));
      setSelectedId(-1);
      setWorkspace("operations");
      window.setTimeout(() => mapPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
      toast.success(`Inspection scan complete. ${data.findings.length} defects detected across IGDTUW and IIIT-Delhi campuses.`);
    },
    onError: error => toast.error(error.message),
  });
  const runDemoScan = trpc.drift.runDemoScan.useMutation({
    onSuccess: data => {
      setTransientSimulatorRun(data);
      setTransientBriefing(createTransientAnalysisBriefing(data));
      setSelectedId(-1);
      setWorkspace("operations");
      utils.drift.overview.invalidate();
      window.setTimeout(() => mapPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
      toast.success(`${data.detections.length} defects detected and saved to database. ${data.detections.filter((d: { success: boolean }) => d.success).length} tickets created.`);
    },
    onError: error => toast.error(`Scan failed: ${error.message}`),
  });
  const demoPdfReport = trpc.drift.reports.demoPdf.useMutation({
    onSuccess: result => {
      const binary = atob(result.base64);
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: result.contentType }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Real ten-page PDF downloaded with findings and evidence context");
    },
    onError: error => toast.error(`PDF generation failed: ${error.message}`),
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
  const visibleReports = reports.slice(0, 8);
  const persistence = live?.persistence;
  const persistenceAvailable = persistence?.available !== false;
  const portableEvidenceStorageAvailable = persistence?.portableEvidenceStorage === true;
  const persistenceMessage = persistence?.message ?? "Persistent storage status is loading.";
  const accountabilityPersistence = accountability.data?.persistence;
  const contractorWorkPersistence = contractorAssignedWork.data?.persistence;
  const accountabilityReady = accountabilityPersistence?.available === true && persistenceAvailable;
  const missionIdForEvidence = Number(missions[0]?.id ?? 0);
  const canReadEvidence = isAuthenticated && ["admin", "engineer", "user"].includes(workspaceAccess.data?.role ?? "");
  const evidenceQueryEnabled = canReadEvidence && missionIdForEvidence > 0;
  const missionEvidence = trpc.drift.evidence.list.useQuery({ missionId: missionIdForEvidence }, { enabled: evidenceQueryEnabled, refetchInterval: evidenceQueryEnabled ? 10000 : false, retry: false });
  const demoEvidence = trpc.drift.evidence.demoList.useQuery({ missionId: missionIdForEvidence }, { enabled: workspace === "evidence" && evidenceQueryEnabled, retry: false });
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
  const createAccountabilityTicket = trpc.drift.accountability.tickets.create.useMutation({
    onSuccess: result => {
      setLastTicketId(result.ticketId);
      toast.success(`Accountability ticket ${result.ticketId} created · DSI ${result.priority.toUpperCase()} · engineer route review required`);
      utils.drift.accountability.overview.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const sendReportEmail = trpc.drift.accountability.tickets.sendReportEmail.useMutation({
    onSuccess: () => toast.success("Contractor report accepted by the configured relay."),
    onError: error => toast.error(error.message),
  });
  const acceptContractorTicket = trpc.drift.accountability.tickets.accept.useMutation({
    onSuccess: () => { toast.success("Ticket acceptance recorded in the audit trail."); utils.drift.accountability.overview.invalidate(); utils.drift.accountability.assignedWork.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const startContractorTicket = trpc.drift.accountability.tickets.start.useMutation({
    onSuccess: () => { toast.success("Ticket moved to in progress."); utils.drift.accountability.overview.invalidate(); utils.drift.accountability.assignedWork.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const addContractorTicketNote = trpc.drift.accountability.tickets.addNote.useMutation({
    onSuccess: () => { toast.success("Contractor note recorded in the audit trail."); setContractorNote(""); utils.drift.accountability.overview.invalidate(); utils.drift.accountability.assignedWork.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const askApprovedKnowledge = trpc.drift.accountability.knowledge.ask.useMutation({
    onSuccess: result => {
      setRagResult(result as typeof ragResult extends infer _ ? NonNullable<typeof ragResult> : never);
      if (result.retrieval.status === "retrieved") toast.success(`Retrieved ${result.retrieval.citations.length} approved source excerpt${result.retrieval.citations.length === 1 ? "" : "s"}`);
      else toast.message(result.retrieval.message);
    },
    onError: error => toast.error(error.message),
  });
  const driftAi = trpc.drift.ai.ask.useMutation({
    onSuccess: result => { const aiResult = result as { source: "gemini" | "openai" | "deterministic-intent" | "deterministic-fallback"; providerStatus?: string | number; answer: string }; setDriftAiSource(aiResult.source); setDriftAiProviderStatus(String(aiResult.providerStatus ?? ((aiResult.source === "openai" || aiResult.source === "gemini") ? "connected" : "unknown"))); setDriftAiMessages(previous => [...previous, { role: "assistant", content: aiResult.answer }]); },
    onError: error => { setDriftAiMessages(previous => [...previous, { role: "assistant", content: `DRIFT AI could not complete this request. ${error.message} Please verify the engineer session and try again.` }]); toast.error(error.message); },
  });
  const selectedTransientFinding = transientSimulatorRun?.findings.find((_, index) => -(index + 1) === selectedId);
  const selected = defects.find(defect => defect.id === selectedId) ?? (selectedTransientFinding ? { id: selectedId, label: selectedTransientFinding.title, defectType: selectedTransientFinding.label, severity: selectedTransientFinding.score.severity, zeroErrorScore: selectedTransientFinding.score.score, confidencePercent: Math.round(selectedTransientFinding.confidence * 100), coveragePercent: null, latitude: selectedTransientFinding.latitude, longitude: selectedTransientFinding.longitude, status: "detected", reviewState: "pending", missionId: 0, assetId: 0, inspectionDomain: "infrastructure", explanation: selectedTransientFinding.score.explanation } : defects[0] ?? { id: 0, label: "No finding selected", defectType: "structural", severity: "low" as Severity, zeroErrorScore: 0, confidencePercent: 0, coveragePercent: null, latitude: "—", longitude: "—", status: "detected", reviewState: "pending", missionId: 0, assetId: 0, explanation: ["Run an inspection scan to detect infrastructure defects."] });
  const selectedExplanation = Array.isArray(selected.explanation) ? selected.explanation.filter((item: unknown): item is string => typeof item === "string") : [];
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
  const role: Role = isAuthenticated ? (workspaceAccess.data?.role === "admin" ? "administrator" : workspaceAccess.data?.role === "contractor" ? "contractor" : workspaceAccess.data?.role === "citizen" ? "citizen" : "engineer") : previewRole;
  const assignedContractorTickets = contractorAssignedWork.data?.tickets ?? [];
  const contractorWorkReady = contractorWorkPersistence?.available === true && persistenceAvailable;
  const roleSource = isAuthenticated ? "AUTHORISED ROLE" : "OPERATOR";
  const canOperate = isAuthenticated && (role === "administrator" || role === "engineer");
  const canPersistSimulation = canOperate && persistenceAvailable && portableEvidenceStorageAvailable;
  // The stateless walkthrough is deliberately browser-only and creates no operational record.
  // It remains available after sign-in so a default citizen account is not trapped in an empty view.
  const canRunDemo = true;
  // Reports are persisted through storagePutWithFallback, which stores the PDF
  // in PostgreSQL when portable object storage is not configured. Do not block
  // report generation on the evidence-upload storage prerequisite.
  const canGeneratePublicReport = canOperate && persistenceAvailable;
  const transientMapDefects = useMemo(() => (transientSimulatorRun?.findings ?? []).map((finding, index) => ({ id: -(index + 1), label: finding.title, defectType: finding.label, severity: finding.score.severity, zeroErrorScore: finding.score.score, confidencePercent: Math.round(finding.confidence * 100), latitude: finding.latitude, longitude: finding.longitude, isTransient: true })), [transientSimulatorRun]);
  const transientMapTelemetry = transientSimulatorRun?.telemetry ?? [];
  const startAvailableSimulator = () => {
    runDemoScan.mutate({ name: missionName });
  };
  const focusLiveMap = () => {
    setWorkspace("operations");
    requestAnimationFrame(() => mapPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const focusDriftAi = () => {
    setWorkspace("operations");
    requestAnimationFrame(() => driftAiPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const inspectTransientAdvisory = (index: number) => {
    setSelectedId(-(index + 1));
    setWorkspace("operations");
    setStreetViewRequest(request => request + 1);
    window.setTimeout(() => mapPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  };

  const roleCopy: Record<Role, { eyebrow: string; title: string; note: string }> = {
    administrator: { eyebrow: "GOVERNANCE DESK", title: "Network accountability", note: "Audit integrity, service levels, and asset exposure across the inspection network." },
    engineer: { eyebrow: "ENGINEERING DESK", title: "Verify before you release", note: "Review evidence, override priorities, and turn risk signals into accountable maintenance actions." },
    contractor: { eyebrow: "CONTRACTOR DESK", title: "Prove before closure", note: "Accept assigned work, record progress, and submit original completion proof for independent engineer verification." },
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
  const buildTransientBriefing = () => {
    if (!transientSimulatorRun) { toast.error("Run an inspection scan first to generate a report."); return; }
    setTransientBriefing(createTransientAnalysisBriefing(transientSimulatorRun));
    toast.success("Inspection report generated with defect details and priority scores.");
  };
  const openTransientReport = () => {
    buildTransientBriefing();
    setWorkspace("reports");
  };
  const downloadTransientBriefing = () => {
    if (!transientSimulatorRun) return;
    demoPdfReport.mutate({ name: transientSimulatorRun.name ?? "DRIFT campus inspection" });
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
  const createAccountabilityCase = () => {
    if (!canOperate) { toast.error("Sign in as an engineer or administrator to create a real maintenance ticket."); return; }
    if (!accountabilityReady) { toast.error(accountabilityPersistence?.message ?? persistenceMessage); return; }
    if (!selected.assetId) { toast.error("Select a persisted finding linked to an asset before opening a ticket."); return; }
    const impact = Number(ticketImpact);
    if (!Number.isInteger(impact) || impact < 0 || impact > 100) { toast.error("Approved operational impact must be a whole number from 0 to 100."); return; }
    createAccountabilityTicket.mutate({
      assetId: selected.assetId,
      defectId: selected.id || undefined,
      title: ticketTitle,
      scopeNote: ticketScope,
      zoneLabel: selectedEvidence?.captureZone ?? undefined,
      latitude: selected.latitude === "—" ? undefined : String(selected.latitude),
      longitude: selected.longitude === "—" ? undefined : String(selected.longitude),
      verificationCriterion: "Engineer must compare original follow-up evidence against the approved repair scope before final status is set.",
      evidenceId: selectedEvidenceId ?? undefined,
      evidenceQuality: selectedEvidence?.qualityStatus === "pass" ? 90 : selectedEvidence?.qualityStatus === "review" ? 60 : 0,
      locationConfidence: selectedEvidence?.latitude && selectedEvidence?.longitude ? 90 : selectedEvidence?.captureZone ? 60 : 0,
      approvedImpact: impact,
      repeatCount: defects.filter(defect => defect.assetId === selected.assetId && defect.defectType === selected.defectType).length,
    });
  };

  const sendSelectedReportToContractor = () => {
    if (!selected.id) { toast.error("Select a finding before sending a report."); return; }
    // Resolve contractor from geo-boundary (backend does the same)
    const lat = typeof selected.latitude === 'number' ? selected.latitude : parseFloat(String(selected.latitude));
    const lng = typeof selected.longitude === 'number' ? selected.longitude : parseFloat(String(selected.longitude));
    const matchedContractor = (Number.isFinite(lat) && Number.isFinite(lng))
      ? contractorData.find(c => Math.sqrt((lat - c.centerLat) ** 2 + (lng - c.centerLng) ** 2) <= c.radiusDegrees)
      : contractorData[0];
    const contractorName = matchedContractor?.name ?? "Unassigned";
    const severityImpact = { pothole: 45, crack: 55, structural: 85, corrosion: 70, spalling: 75, exposed_rebar: 88, water_intrusion: 60, settlement: 90, rail_alignment: 82, obstruction: 40, lighting_failure: 50 } as const;
    const selectedDefectType = String(selected.defectType) as keyof typeof severityImpact;
    const priority = calculateOverallPriority({ defectSeverity: severityImpact[selectedDefectType] ?? 50, mlConfidence: (selected.confidencePercent ?? 0) / 100, trafficImpact: 0, sensorAnomaly: 0, infrastructureCriticality: 3 }, String(selected.defectType));
    sendReportEmail.mutate({
      ticketId: lastTicketId ?? undefined,
      subject: `DRIFT inspection report · ${selected.label} · ${contractorName}`,
      contractor: contractorName,
      defect: selected.defectType,
      confidencePercent: selected.confidencePercent,
      severity: selected.severity,
      latitude: String(selected.latitude),
      longitude: String(selected.longitude),
      estimatedRepairCost: priority.repairCostEstimateINR > 0 ? formatRepairCost(priority.repairCostEstimateINR) : formatCurrency(repairTotal),
      recommendedDeadline: priority.recommendedDeadline,
      reportUrl: reportResult?.storageUrl ? resolveBackendAssetUrl(reportResult.storageUrl) : undefined,
      evidenceUrl: selectedEvidence?.storageUrl ? resolveBackendAssetUrl(selectedEvidence.storageUrl) : undefined,
    });
  };

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
        <div className="rail-footer"><span>RISK-AWARE / 01</span><span>V 1.0.0</span></div>
      </aside>

      <main className="main-stage">
        <header className="topbar">
          <div className="crumbs"><span>OPERATIONS</span><b>/</b><span>{workspace.toUpperCase()}</span></div>
          <div className="topbar-actions">
            <span className="role-toggle"><ShieldCheck /> {roleSource} · {role}</span>
            <button type="button" className="secondary-action" onClick={focusLiveMap} title="Scroll to the live Google Maps field."><MapPinned /> OPEN LIVE MAP</button>
            <button type="button" className="secondary-action" onClick={focusDriftAi} title="Scroll to the DRIFT AI inspection copilot."><Sparkles /> OPEN DRIFT AI</button>
            {!isAuthenticated && <button type="button" className="secondary-action" onClick={() => startLogin()} title="Sign in with any email. Protected DRIFT roles require separate approval.">SIGN IN</button>}
            {transientSimulatorRun && <button type="button" className="secondary-action" onClick={openTransientReport} title="Open the inspection report."><FileText /> OPEN REPORT</button>}
            {canRunDemo && <button type="button" className="primary-action" onClick={startAvailableSimulator} disabled={runDemoScan.isPending} title="Run infrastructure inspection scan across IGDTUW and IIIT-Delhi campuses."><Play /> {runDemoScan.isPending ? "SCANNING & PERSISTING..." : "RUN INSPECTION SCAN"}</button>}
          </div>
        </header>

        <section className="identity-band">
          <div>
            <p className="eyebrow">{roleCopy[role].eyebrow}</p>
            <h1>{roleCopy[role].title}</h1>
          </div>
          <p>{roleCopy[role].note}{isAuthenticated && user ? <><br /><strong className="signed-in-welcome">Welcome, {user.name || user.email || "engineer"}. Your authenticated session is active.</strong></> : null}</p>
          <div className="identity-code"><span>SYSTEM STATUS</span><strong>• {connectedStatus.toUpperCase()}</strong></div>
        </section>

        <section className="safety-banner">
          <CloudCog />
          <div><strong>{connectedStatus === "connected" ? "BRIDGE ONLINE" : connectedStatus === "retrying" || connectedStatus === "degraded" ? "BRIDGE DEGRADED" : "SIMULATOR READY"}</strong><span>{hardware.data?.operatorMessage ?? "No hardware endpoint configured. Simulator mode is available without a drone."}</span></div>
          <button type="button" onClick={() => setWorkspace("hardware")}>VIEW BRIDGE <ChevronRight /></button>
        </section>

        {!persistenceAvailable && <section className="safety-banner persistence-banner" role="status"><CloudCog /><div><strong>PERSISTENCE REQUIRED</strong><span>{persistenceMessage} The current public dashboard and DRIFT AI remain available in read-only mode.</span></div><button type="button" onClick={() => setWorkspace("hardware")}>VIEW HARDWARE GUIDE <ChevronRight /></button></section>}
        {transientSimulatorRun && <section className="safety-banner persistence-banner" role="status"><Play /><div><strong>INSPECTION SCAN ACTIVE</strong><span>{transientSimulatorRun.findings.length} defects detected across {transientSimulatorRun.telemetry.length} waypoints. Results are mapped below with contractor assignments and priority scores.</span></div><div className="safety-banner-actions"><button type="button" onClick={openTransientReport}><FileText /> OPEN REPORT</button><button type="button" onClick={() => { setTransientSimulatorRun(null); setTransientBriefing(null); }}>CLEAR RESULTS</button></div></section>}

        {activeAlerts.length > 0 && <section className="alert-strip"><AlertTriangle /><div><span className="eyebrow">OPEN MAINTENANCE ALERTS</span><strong>{activeAlerts[0]?.title}</strong><small>{activeAlerts[0]?.message}</small></div><button type="button" onClick={() => { setSeverityFilter("critical"); setWorkspace("defects"); }}>REVIEW {activeAlerts.length} ALERT{activeAlerts.length === 1 ? "" : "S"} <ChevronRight /></button></section>}

        {workspace === "operations" && <>
          <section className="stats-grid">
            <StatBlock label="ACTIVE MISSIONS" value={String(missions.length).padStart(2, "0")} detail={isAuthenticated ? "approved persisted missions" : "sign in for mission records"} direction="up" />
            <StatBlock label="OPEN FINDINGS" value={String(defects.length).padStart(2, "0")} detail={isAuthenticated ? `${criticalCount} critical review` : "sign in for reviewed findings"} direction="down" />
            <StatBlock label="EXPOSURE ESTIMATE" value={formatCurrency(repairTotal)} detail={isAuthenticated ? "illustrative repair rules v1.0" : "no public cost data"} />
            <StatBlock label="FLEET BATTERY" value={telemetry[0]?.batteryPercent === undefined ? "—" : `${telemetry[0].batteryPercent}%`} detail={isAuthenticated && telemetry.length ? "latest reported" : "no public telemetry"} direction="up" />
          </section>
          {transientSimulatorRun &&          <section className="stats-grid border border-sky-300 bg-sky-50" aria-label="Scan results"><StatBlock label="DEFECTS FOUND" value={String(transientSimulatorRun.findings.length).padStart(2, "0")} detail="across IGDTUW and IIIT-Delhi" /><StatBlock label="SCAN POINTS" value={String(transientSimulatorRun.telemetry.length).padStart(2, "0")} detail="GPS waypoints recorded" /><StatBlock label="CAMPUSES COVERED" value="2" detail="IGDTUW + IIIT-Delhi" /><StatBlock label="SCAN STATUS" value="LIVE" detail="results available now" /></section>}
          <section className="proof-panel" aria-labelledby="proof-panel-title"><div className="proof-panel-heading"><div><span className="eyebrow">SYSTEM OVERVIEW</span><h2 id="proof-panel-title">DRIFT Inspection Pipeline</h2></div><BookOpenCheck /></div><div className="proof-grid"><div><span className="proof-label">STEP 1</span><strong>Drone Connects</strong><p>DJI Mini 3 Pro connects to laptop via phone. Media and GPS are streamed to the backend in real-time.</p></div><div><span className="proof-label">STEP 2</span><strong>ML Detection</strong><p>Backend sends images/video to ML inference. Defects are classified with confidence scores and GPS coordinates.</p></div><div><span className="proof-label">STEP 3</span><strong>Map & Contractor</strong><p>Defects are pinned on the geo-stationary map. Contractors are auto-assigned by campus location.</p></div><div><span className="proof-label">STEP 4</span><strong>Report & Email</strong><p>Full defect report with cost estimates is generated. Email is sent to the assigned contractor automatically.</p></div></div></section>

          <PublicDatasetVisualCard onPreview={() => setEvidencePreview(publicDatasetSamples[0]!)} onOpenEvidence={() => setWorkspace("evidence")} />
          <div className="live-media-grid"><LiveStreamPanel missionId={missionIdForEvidence} /><LiveDetectionPanel missionId={missionIdForEvidence} /></div>
          <section className="operations-grid">
            <article ref={mapPanelRef} className="panel map-panel">
              <div className="panel-heading"><div><span className="eyebrow">GEO-SPATIAL WORKBENCH</span><h2>Live defect field</h2></div><button type="button" className="icon-button" onClick={() => setWorkspace("defects")} aria-label="Open defect filters" title="Open defect filters"><SlidersHorizontal /></button></div>
              <InspectionMap defects={[...visibleDefects, ...transientMapDefects]} telemetry={[...telemetry, ...transientMapTelemetry]} selectedId={selected.id || undefined} streetViewRequest={streetViewRequest} onSelect={setSelectedId} />
              <div className="map-finding-summary"><div className="summary-counts">{severitySummary.map(item => <button key={item.severity} type="button" className={cn("summary-count", severityClass(item.severity), severityFilter === item.severity && "active")} onClick={() => { setSeverityFilter(item.severity); setWorkspace("defects"); }}><strong>{item.count}</strong><span>{item.severity}</span></button>)}</div><div className="selected-finding"><div><span className="eyebrow">SELECTED FINDING</span><strong>{selected.label}</strong><small>{selected.defectType} · {selected.inspectionDomain ?? "domain pending"} · {selected.reviewState} review</small></div><div className="selected-finding-metrics"><span><b>{selected.zeroErrorScore}</b> score</span><span><b>{selected.confidencePercent}%</b> confidence</span><span><b>{selected.latitude}, {selected.longitude}</b> GPS</span><span><b>{availableAssets.find(asset => asset.id === selected.assetId)?.name ?? `ASSET ${selected.assetId || "UNASSIGNED"}`}</b> asset</span><span><b>{selectedEvidence?.captureZone ?? "NOT RECORDED"}</b> capture zone</span><span><b>{selectedEvidence?.qualityStatus ?? "NOT GATED"}</b> quality gate</span></div><SeverityChip severity={selected.severity} /></div></div>
              <div className="mission-strip"><div><span className="eyebrow">CURRENT MISSION</span><strong>{missions[0]?.name}</strong></div><div><span className="eyebrow">FLIGHT STATE</span><strong className="status-active">{missions[0]?.status ?? "active"}</strong></div><div><span className="eyebrow">WAYPOINTS</span><strong>{telemetry.length} POINTS</strong></div><button type="button" onClick={() => setWorkspace("evidence")} disabled={!evidenceItems.length}>OPEN EVIDENCE <ChevronRight /></button></div>
            </article>

            <article className="panel priority-panel">
              <div className="panel-heading"><div><span className="eyebrow">RISK-AWARE QUEUE</span><h2>Action first</h2></div><span className="queue-count">{defects.length}</span></div>
              <div className="priority-list">
                {defects.slice(0, 4).map(defect => <button type="button" key={defect.id} className={cn("priority-item", selected.id === defect.id && "selected")} onClick={() => setSelectedId(defect.id)}><span className={cn("item-index", severityClass(defect.severity))}>{String(defect.id).slice(-2)}</span><span className="priority-content"><strong>{defect.label}</strong><small>{defect.confidencePercent}% confidence · score {defect.zeroErrorScore}</small></span><SeverityChip severity={defect.severity} /></button>)}
              </div>
              <button type="button" className="secondary-action full" onClick={() => setWorkspace("defects")}>OPEN MAINTENANCE QUEUE <ChevronRight /></button>
            </article>
          </section>

          <section className="lower-grid">
            <article className="panel evidence-panel">
              <div className="panel-heading"><div><span className="eyebrow">EVIDENCE REVIEW</span><h2>{selected.label}</h2></div><span className="evidence-time">{selectedEvidence?.capturedAt ? new Date(selectedEvidence.capturedAt).toLocaleTimeString() : "NO CAPTURE TIME"}</span></div>
              {selectedEvidence ? <div className="evidence-frame media-frame">{selectedEvidence.mediaKind === "video" ? <video src={resolveBackendAssetUrl(selectedEvidence.storageUrl)} controls preload="metadata" aria-label={selectedEvidence.fileName} /> : <img src={resolveBackendAssetUrl(selectedEvidence.storageUrl)} alt={selectedEvidence.fileName} />}<div className="bounding-box"><b>{selected.defectType.toUpperCase()}</b><small>{selected.confidencePercent}% confidence</small></div><div className="frame-metrics"><span>GPS {selectedEvidence.latitude ?? selected.latitude} / {selectedEvidence.longitude ?? selected.longitude}</span><span>ALTITUDE NOT ATTACHED</span><span>{selectedEvidence.cameraId ?? "CAMERA UNKNOWN"}</span><span>ZONE {selectedEvidence.captureZone ?? "UNKNOWN"} · QUALITY {selectedEvidence.qualityStatus ?? "PENDING"}</span></div><div className="frame-provenance"><span>SOURCE {selectedEvidence.source ?? "UNKNOWN"}</span><span>{evidenceProvenance(selectedEvidence.provenance)}</span></div></div> : <div className="evidence-frame empty-state"><h3>No stored evidence selected</h3><p>Run a simulator mission or upload an inspection image to create a reviewable evidence record.</p></div>}
              <div className="explain-row"><ScanLine /><p>{selectedExplanation.join(" · ")}</p><button type="button" onClick={() => setWorkspace("evidence")}>REVIEW <ChevronRight /></button></div>
            </article>

            <article className="panel decision-panel">
              <div className="panel-heading"><div><span className="eyebrow">ENGINEER DECISION</span><h2>Human checkpoint</h2></div><ClipboardCheck /></div>
              <div className="decision-score"><span className={cn("score-orb", severityClass(selected.severity))}>{selected.zeroErrorScore}</span><div><span className="eyebrow">RISK-AWARE PRIORITY</span><h3>{selected.severity} intervention</h3><p>AI is advisory. An authorised engineer must approve, override, or request a site visit.</p></div></div>
              {!canOperate ? <div className="citizen-notice">Sign in as an engineer or administrator to submit an engineering decision. Demo preview remains read-only for approvals and overrides.</div> : !persistenceAvailable ? <div className="citizen-notice">{persistenceMessage}</div> : <div className="decision-actions"><button type="button" onClick={() => submitReview("approve")}><CheckCheck /> APPROVE</button><button type="button" onClick={() => submitReview("override")}><Wrench /> OVERRIDE</button><button type="button" onClick={() => submitReview("needs_site_visit")}><MapPinned /> SITE VISIT</button></div>}
            </article>
          </section>
          <section ref={driftAiPanelRef} className="drift-ai-panel"><div className="drift-ai-heading"><div><span className="eyebrow">DRIFT AI · INSPECTION COPILOT</span><h2>Ask the evidence, not the guess</h2><p>DRIFT AI reads the selected finding, exact coordinates, severity, confidence, quality gate, mission telemetry, evidence count, and review state. It never issues flight commands or replaces engineer sign-off.</p></div><div className="drift-ai-badge"><Sparkles /> {driftAiSource === "gemini" ? "GEMINI CONNECTED" : driftAiSource === "openai" ? "OPENAI CONNECTED" : driftAiProviderStatus.endsWith("-429") ? "AI QUOTA REQUIRED" : driftAiProviderStatus.endsWith("-401") || driftAiProviderStatus.endsWith("-403") ? "AI KEY REJECTED" : driftAiSource === "deterministic-fallback" ? "FALLBACK · PROVIDER UNAVAILABLE" : driftAiSource === "deterministic-intent" ? "RULES · PROVIDER NOT CONFIGURED" : "READY FOR QUESTION"}</div></div><div className="drift-ai-metrics"><div><span>ANALYZED RECORDS</span><strong>{evidenceItems.length || defects.length}</strong><small>{evidenceItems.length ? "evidence items" : "finding records"}</small></div><div><span>CRITICAL DEFECTS</span><strong>{aiCriticalCount}</strong><small>engineer review</small></div><div><span>BRIDGE HEALTH</span><strong>{aiHealthScore}<em>/100</em></strong><small>derived triage score</small></div><div><span>RISK BAND</span><strong>{aiRiskBand}</strong><small>not a failure prediction</small></div><div><span>REPAIR EXPOSURE</span><strong>{formatCurrency(repairTotal)}</strong><small>stored estimates</small></div></div>{pendingAiFilter && <div className="drift-ai-filter-suggestion"><span>DRIFT AI suggests showing only <strong>{pendingAiFilter}</strong> findings on the map.</span><button type="button" onClick={() => { setSeverityFilter(pendingAiFilter); setWorkspace("defects"); setPendingAiFilter(null); }}>APPLY FILTER</button><button type="button" onClick={() => setPendingAiFilter(null)}>DISMISS</button></div>}<AIChatBox messages={driftAiMessages} onSendMessage={askDriftAi} isLoading={driftAi.isPending} height="430px" className="drift-ai-chat" placeholder="Ask: Why is this critical? What should the engineer verify next?" emptyStateMessage="DRIFT AI is ready for an inspection question." suggestedPrompts={["What are the most critical defects?", "Which defects need immediate repair?", "Why was this finding marked severe?", "Summarize this inspection and risk", "Compare with the previous inspection", "What should the engineer inspect manually?"]} /></section>

          <section className="contractor-assignment-panel">
            <div className="panel-heading"><div><span className="eyebrow">AUTO-ASSIGNED CONTRACTOR · GEO-LOOKUP</span><h2>Contractor for this defect</h2></div><Wrench /></div>
            {(() => {
              const lat = typeof selected.latitude === 'number' ? selected.latitude : parseFloat(String(selected.latitude));
              const lng = typeof selected.longitude === 'number' ? selected.longitude : parseFloat(String(selected.longitude));
              if (!lat || !lng || isNaN(lat) || isNaN(lng)) return <p className="access-note">Select a defect with valid GPS coordinates to see the assigned contractor.</p>;
              const matched = contractorData.find(c => Math.sqrt((lat - c.centerLat) ** 2 + (lng - c.centerLng) ** 2) <= c.radiusDegrees);
              const contractor = matched ?? contractorData[0]!;
              const severityMap: Record<string, number> = { pothole: 45, crack: 55, structural: 85, corrosion: 70, spalling: 75, exposed_rebar: 88, water_intrusion: 60, settlement: 90, rail_alignment: 82, obstruction: 40, lighting_failure: 50 };
              const priority = calculateOverallPriority({ defectSeverity: severityMap[selected.defectType] ?? 50, mlConfidence: (selected.confidencePercent ?? 0) / 100, trafficImpact: 0, sensorAnomaly: 0, infrastructureCriticality: 3 }, selected.defectType);
              return (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <div className="rounded-lg bg-gray-50 p-3"><span className="eyebrow">CONTRACTOR</span><p className="mt-1 text-lg font-bold text-gray-800">{contractor.name}</p><p className="text-sm text-gray-500">{contractor.organization}</p><p className="text-xs text-gray-400">{contractor.region} · Match: {matched ? 'Geo-boundary' : 'Default fallback'}</p></div>
                    <div className="rounded-lg bg-gray-50 p-3"><span className="eyebrow">EMAIL</span><p className="mt-1 font-mono text-sm">{contractor.email}</p></div>
                    <div className="rounded-lg bg-gray-50 p-3"><span className="eyebrow">REPORT SUMMARY</span><p className="mt-1 text-sm text-gray-600">{selected.defectType.replace(/_/g, ' ')} detected with {(selected.confidencePercent ?? 0)}% confidence at ({selected.latitude}, {selected.longitude}). Priority: {priority.priorityLevel}. Estimated cost: {formatRepairCost(priority.repairCostEstimateINR)}. Deadline: {priority.recommendedDeadline}</p></div>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
                      <span className="eyebrow">PRIORITY BREAKDOWN</span>
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between text-sm"><span>Defect Severity</span><span className="font-bold">{priority.breakdown.defectSeverity}/30</span></div>
                        <div className="flex justify-between text-sm"><span>ML Confidence</span><span className="font-bold">{priority.breakdown.mlConfidence}/20</span></div>
                        <div className="flex justify-between text-sm"><span>Traffic Impact</span><span className="font-bold">{priority.breakdown.trafficImpact}/25</span></div>
                        <div className="flex justify-between text-sm"><span>Infrastructure</span><span className="font-bold">{priority.breakdown.infrastructureImportance}/10</span></div>
                        <div className="border-t pt-1 flex justify-between text-sm font-bold"><span>OVERALL</span><span>{priority.overallScore}/100</span></div>
                      </div>
                    </div>
                    <div className="rounded-lg bg-green-50 p-3"><span className="eyebrow">ESTIMATED REPAIR COST</span><p className="mt-1 text-xl font-bold text-green-700">{formatRepairCost(priority.repairCostEstimateINR)}</p></div>
                    <div className="rounded-lg bg-amber-50 p-3"><span className="eyebrow">RECOMMENDED DEADLINE</span><p className="mt-1 text-sm font-medium text-amber-800">{priority.recommendedDeadline}</p></div>
                    <button type="button" className="primary-action w-full" onClick={() => setWorkspace("reports")}>VIEW FULL REPORT & SEND EMAIL <ChevronRight /></button>
                    <button type="button" className="secondary-action w-full" onClick={() => setWorkspace("contractors")}>VIEW CONTRACTOR DETAILS <ChevronRight /></button>
                  </div>
                </div>
              );
            })()}
          </section>

          {role === "administrator" && <section className="admin-grid"><article className="panel admin-panel"><div className="panel-heading"><div><span className="eyebrow">ADMINISTRATOR WORKSPACE</span><h2>Asset governance</h2></div><Layers3 /></div><div className="governance-list">{availableAssets.slice(0, 4).map(asset => <div key={asset.id}><strong>{asset.name}</strong><span>{asset.assetType} · criticality {asset.criticality}/5 · {asset.status}</span></div>) || <p>No managed assets are available yet.</p>}</div><p className="access-note">Asset create, update, and delete actions are server-authorized for authenticated administrator roles. This unauthenticated display is clearly marked as a preview.</p></article><article className="panel admin-panel"><div className="panel-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Accountability log</h2></div><ClipboardCheck /></div><div className="governance-list">{(live?.audit ?? []).slice(0, 4).map(event => <div key={event.id}><strong>{event.action}</strong><span>{new Date(event.createdAt).toLocaleString()}</span></div>) || <p>No audit entries yet.</p>}</div><p className="access-note">Every simulator run, evidence upload, telemetry event, and review decision is written to the audit record.</p></article></section>}
        </>}

        {workspace === "defects" && <section className="workspace-page">
          <PublicDatasetVisualCard onPreview={() => setEvidencePreview(publicDatasetSamples[0]!)} onOpenEvidence={() => setWorkspace("evidence")} />
          <div className="workspace-header"><div><span className="eyebrow">FILTERABLE MAINTENANCE QUEUE</span><h2>Defect control</h2></div><div className="filter-row">{(["all", "critical", "high", "medium", "low"] as const).map(filter => <button key={filter} type="button" className={cn(severityFilter === filter && "active")} onClick={() => setSeverityFilter(filter)}>{filter}</button>)}</div></div>
          {transientSimulatorRun && <section className="transient-workspace-banner" role="status"><div><span className="eyebrow">ACTIVE BROWSER-ONLY WALKTHROUGH</span><strong>{transientMapDefects.length} temporary advisories are available below</strong><p>These are simulated candidates only. They are not saved findings, real evidence, tickets, or engineering decisions.</p></div><div><button type="button" onClick={openTransientReport}><FileText /> OPEN DEMO REPORT</button><button type="button" onClick={focusLiveMap}><MapPinned /> OPEN MAP GRID</button></div></section>}
          <div className="advanced-filters"><label>DEFECT TYPE<select value={defectTypeFilter} onChange={event => setDefectTypeFilter(event.target.value as typeof defectTypeFilter)}><option value="all">All types</option><option value="structural">Structural</option><option value="crack">Crack</option><option value="pothole">Pothole</option><option value="corrosion">Corrosion</option><option value="spalling">Spalling</option><option value="exposed_rebar">Exposed rebar</option><option value="water_intrusion">Water intrusion</option><option value="settlement">Settlement</option><option value="rail_alignment">Rail alignment</option><option value="obstruction">Obstruction</option><option value="lighting_failure">Lighting failure</option></select></label><label>DOMAIN<select value={domainFilter} onChange={event => setDomainFilter(event.target.value as typeof domainFilter)}><option value="all">All domains</option>{INSPECTION_DOMAINS.map(domain => <option key={domain} value={domain}>{domain.replaceAll("-", " ")}</option>)}</select></label><label>STATUS<select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">All states</option><option value="detected">Detected</option><option value="under_review">Under review</option><option value="verified">Verified</option><option value="scheduled">Scheduled</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></label><label>REVIEW<select value={reviewFilter} onChange={event => setReviewFilter(event.target.value as typeof reviewFilter)}><option value="all">All reviews</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="overridden">Overridden</option><option value="rejected">Rejected</option></select></label><label>MISSION<select value={missionFilter} onChange={event => setMissionFilter(event.target.value === "all" ? "all" : Number(event.target.value))}><option value="all">All missions</option>{availableMissions.map(mission => <option key={mission.id} value={mission.id}>{mission.name}</option>)}</select></label><label>ASSET<select value={assetFilter} onChange={event => setAssetFilter(event.target.value === "all" ? "all" : Number(event.target.value))}><option value="all">All assets</option>{availableAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label></div>
          <InspectionMap defects={[...visibleDefects, ...transientMapDefects]} telemetry={[...telemetry, ...transientMapTelemetry]} selectedId={selected.id || undefined} onSelect={setSelectedId} />
          <div className="defect-table"><div className="table-row table-head"><span>FINDING</span><span>CAMPUS</span><span>CONFIDENCE</span><span>PRIORITY</span><span>ACTIONS</span></div>{transientSimulatorRun ? transientMapDefects.map((defect, index) => <button key={defect.id} type="button" className={cn("table-row transient-defect-row", selected.id === defect.id && "selected")} onClick={() => { setSelectedId(defect.id); focusLiveMap(); }}><div><strong>#{String(index + 1).padStart(2, "0")} · {defect.label}</strong><small>{defect.defectType.replaceAll("_", " ")} · {defect.latitude.toFixed(4)}, {defect.longitude.toFixed(4)}</small></div><span>{defect.latitude > 28.6 ? "IGDTUW" : "IIIT-Delhi"}</span><span>{defect.confidencePercent}%</span><SeverityChip severity={defect.severity} /><span className="public-status">SCANNED</span></button>) : visibleDefects.length ? visibleDefects.map(defect => <div key={defect.id} className="table-row"><div><strong>{defect.label}</strong><small>{defect.defectType} · {defect.inspectionDomain ?? "—"} · {defect.latitude}, {defect.longitude}</small></div><span>{availableMissions.find(mission => mission.id === defect.missionId)?.name ?? "—"}</span><span>{defect.confidencePercent}%</span><SeverityChip severity={defect.severity} />{!canOperate ? <span className="public-status">PENDING</span> : <div className="review-buttons"><button type="button" onClick={() => { setSelectedId(defect.id); submitReview("approve"); }}>APPROVE</button><button type="button" onClick={() => { setSelectedId(defect.id); submitReview("override"); }}>OVERRIDE</button></div>}</div>) : <div className="empty-state defect-empty"><TriangleAlert /><h3>No defects detected yet</h3><p>Run an inspection scan to detect infrastructure defects across IGDTUW and IIIT-Delhi campuses.</p><button type="button" className="primary-action" onClick={startAvailableSimulator}><Play /> RUN INSPECTION SCAN</button></div>}</div>
        </section>}

        {workspace === "evidence" && <section className="workspace-page evidence-workspace">
          <div className="workspace-header"><div><span className="eyebrow">SECURE MISSION MEDIA</span><h2>Evidence vault</h2></div><div><input ref={filePickerRef} className="file-picker" type="file" accept="image/*,video/*" onChange={event => handleEvidenceFile(event.target.files?.[0])} /><button type="button" className="primary-action" onClick={() => filePickerRef.current?.click()} disabled={!canOperate || !persistenceAvailable || !portableEvidenceStorageAvailable || uploadEvidence.isPending} title={!canOperate ? "Sign in as an engineer or administrator to upload original drone media." : !persistenceAvailable || !portableEvidenceStorageAvailable ? persistenceMessage : undefined}><Upload /> {uploadEvidence.isPending ? "STORING" : !canOperate ? "SIGN IN TO UPLOAD" : !persistenceAvailable || !portableEvidenceStorageAvailable ? "PORTABLE STORAGE REQUIRED" : "UPLOAD EVIDENCE"}</button></div></div>
          <InspectionMap defects={defects.filter(defect => defect.missionId === missionIdForEvidence)} telemetry={telemetry.filter(point => (point as typeof point & { missionId?: number }).missionId === missionIdForEvidence)} selectedId={selected.id || undefined} onSelect={setSelectedId} />
          <AuthenticReferenceVisuals />
          <section className="public-dataset-samples" aria-label="IIIT Delhi live as real detection evidence">
            <div><span className="eyebrow">SECTION · IIIT DELHI</span><h3>Live as real detection</h3><p>Three operator-uploaded IIIT Delhi videos with fresh per-frame model inference. These are real uploaded captures and real detection outputs; GPS and engineer verification were not supplied.</p></div>
            <div className="evidence-grid">{iiitDelhiLiveEvidence.map((item, index) => <article key={item.id} className="evidence-card public-dataset-card"><div className={cn("evidence-thumb", `thumb-${index % 3}`)}><video src={item.storageUrl} controls autoPlay muted loop playsInline preload="metadata" aria-label={`Play ${item.fileName}`} /><span>{String(index + 1).padStart(2, "0")}</span><div className="thumb-box" /></div><div><span className="severity-chip severity-medium">LIVE · REAL DETECTION</span><h3>{item.fileName}</h3><p>IIIT Delhi · fresh per-frame inference · GPS not supplied</p><small className="provenance-line">{evidenceProvenance(item.provenance)}</small></div><div className="evidence-actions"><button type="button" onClick={() => setEvidencePreview(item)}>VIEW</button><a href={item.storageUrl} target="_blank" rel="noreferrer">OPEN VIDEO <ChevronRight /></a><a href={item.storageUrl} download={item.fileName}>DOWNLOAD</a></div></article>)}</div>
          </section>
          <section className="public-dataset-samples" aria-label="Public dataset demo samples"><div><span className="eyebrow">PUBLIC DATASET · DEMO INFERENCE</span><h3>Licensed road-defect samples</h3><p>These images are attributable training/demo material, not DRIFT-captured media. They have no DRIFT mission, drone, or map coordinates and are excluded from site-specific findings and reports.</p></div><div className="evidence-grid">{publicDatasetSamples.map((item, index) => <article key={item.id} className="evidence-card public-dataset-card"><button type="button" className={cn("evidence-thumb", `thumb-${index % 3}`)} onClick={() => setEvidencePreview(item)} aria-label={`Preview ${item.fileName}`}><span className="sr-only">Preview {item.fileName}</span><img src={item.storageUrl} alt={item.fileName} /><span>DS</span><div className="thumb-box" /></button><div><span className="severity-chip severity-medium">PUBLIC DATASET · DEMO ONLY</span><h3>{item.fileName}</h3><p>No GPS supplied · no flight provenance · no field-inspection claim</p><small className="provenance-line">{evidenceProvenance(item.provenance)}{evidenceSourceUrl(item.provenance) ? <a href={evidenceSourceUrl(item.provenance)!} target="_blank" rel="noreferrer"> · VIEW DATASET</a> : null}</small></div><div className="evidence-actions"><button type="button" onClick={() => setEvidencePreview(item)}>VIEW</button><a href={item.storageUrl} target="_blank" rel="noreferrer">OPEN SAMPLE <ChevronRight /></a><a href={PUBLIC_DATASET_CRACK_MASK_URL} target="_blank" rel="noreferrer">VIEW CRACK MASK</a><button type="button" disabled title="No published GPS coordinates are attached to this public dataset display sample.">NO GPS MAP</button></div></article>)}</div></section>
          <div className="evidence-grid">{evidenceItems.length ? evidenceItems.map((item, index) => <article key={item.id} className="evidence-card"><button type="button" className={cn("evidence-thumb", `thumb-${index % 3}`)} onClick={() => setEvidencePreview(item)} aria-label={`Preview ${item.fileName}`}><span className="sr-only">Preview {item.fileName}</span>{item.mediaKind === "photo" || item.mediaKind === "annotation" ? <img src={resolveBackendAssetUrl(item.storageUrl)} alt={item.fileName} /> : null}{item.mediaKind === "video" && <video src={resolveBackendAssetUrl(item.storageUrl)} controls preload="metadata" />}<span>{String(index + 1).padStart(2, "0")}</span><div className="thumb-box" /></button><div><span className="severity-chip severity-low">{item.source ?? "stored"} · {item.mediaKind}</span><h3>{item.fileName}</h3><p>{item.source === "reference" ? "Real reference photograph · not live drone evidence" : item.source === "simulator" ? "Simulator/reference media · not a live inspection" : "Stored mission media"} · {item.latitude ?? "GPS pending"}, {item.longitude ?? ""}</p><small className="provenance-line">{evidenceProvenance(item.provenance)}{evidenceSourceUrl(item.provenance) ? <a href={evidenceSourceUrl(item.provenance)!} target="_blank" rel="noreferrer"> · VIEW SOURCE</a> : null}</small></div><div className="evidence-actions"><button type="button" onClick={() => setEvidencePreview(item)}>VIEW</button><a href={resolveBackendAssetUrl(item.storageUrl)} target="_blank" rel="noreferrer">OPEN ORIGINAL <ChevronRight /></a><a href={resolveBackendAssetUrl(item.storageUrl)} download={item.fileName}>DOWNLOAD</a>{item.latitude && item.longitude && <button type="button" onClick={() => { setSelectedId(Number((item as EvidenceItem & { defectId?: number }).defectId ?? selected.id)); setWorkspace("operations"); }}>LOCATE</button>}</div></article>) : <article className="empty-state"><h3>No evidence stored for this mission</h3><p>Upload a real inspection photo or video, or run the simulator to create clearly labelled demonstration evidence.</p></article>}</div>{evidencePreview && <div className="evidence-modal-backdrop" role="presentation" onClick={() => setEvidencePreview(null)}><div className="evidence-modal" role="dialog" aria-modal="true" aria-label={`Evidence preview ${evidencePreview.fileName}`} onClick={event => event.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">EVIDENCE PREVIEW · {evidencePreview.source ?? "stored"}</span><h3>{evidencePreview.fileName}</h3></div><button type="button" onClick={() => setEvidencePreview(null)} aria-label="Close evidence preview">CLOSE</button></div>{evidencePreview.mediaKind === "video" ? <video src={resolveBackendAssetUrl(evidencePreview.storageUrl)} controls autoPlay /> : <img src={resolveBackendAssetUrl(evidencePreview.storageUrl)} alt={evidencePreview.fileName} />}{Boolean(evidencePreview.provenance) && <p className="provenance-line">{evidenceProvenance(evidencePreview.provenance)}</p>}<div className="modal-actions"><a href={resolveBackendAssetUrl(evidencePreview.storageUrl)} target="_blank" rel="noreferrer">OPEN ORIGINAL</a><a href={resolveBackendAssetUrl(evidencePreview.storageUrl)} download={evidencePreview.fileName}>DOWNLOAD</a></div></div></div>}
        </section>}

        {workspace === "reports" && <section className="workspace-page reports-workspace">
          <PublicDatasetVisualCard onPreview={() => setEvidencePreview(publicDatasetSamples[0]!)} onOpenEvidence={() => setWorkspace("evidence")} />
          <div className="workspace-header"><div><span className="eyebrow">AUDIT-READY OUTPUTS</span><h2>Inspection reports</h2><p className="workspace-lede">Generate a structured PDF that keeps severity, evidence, coordinates, uncertainty, recommendations, and sign-off in one reviewable record.</p></div><div className="report-actions-header"><button type="button" className="secondary-action" onClick={createAiBrief} disabled={!canOperate || !persistenceAvailable || decisionSupport.isPending} title={!canOperate ? "Sign in as an engineer or administrator to create a decision narrative." : !persistenceAvailable ? persistenceMessage : undefined}><Sparkles /> {decisionSupport.isPending ? "ANALYSING" : !canOperate ? "SIGN IN FOR NARRATIVE" : !persistenceAvailable ? "PERSISTENCE REQUIRED" : "AI NARRATIVE"}</button><button type="button" className="primary-action" onClick={createPdfReport} disabled={!canGeneratePublicReport || generateReport.isPending} title={!canOperate ? "Sign in as an engineer or administrator to generate a report." : !persistenceAvailable || !portableEvidenceStorageAvailable ? persistenceMessage : undefined}><FileText /> {generateReport.isPending ? "BUILDING PDF" : !canOperate ? "SIGN IN FOR PDF" : !persistenceAvailable || !portableEvidenceStorageAvailable ? "PORTABLE STORAGE REQUIRED" : "GENERATE PDF REPORT"}</button></div></div>
          <LivePipelinePanel connectedStatus={connectedStatus} telemetryCount={telemetry.length} defectCount={defects.length} hasSelectedFinding={Boolean(selected.id)} hasReport={Boolean(reportResult)} canOperate={canOperate} sending={sendReportEmail.isPending} deliveryConfirmed={sendReportEmail.isSuccess} onSend={sendSelectedReportToContractor} />
          {reportResult && <article className="report-preview-panel"><div><span className="eyebrow">LATEST GENERATED REPORT · {reportResult.format === "application/pdf" ? "PDF" : "REPORT"}</span><h3>{reportResult.title}</h3><p>{reportResult.evidenceCount} evidence records · {reportResult.defectCount} candidate findings · engineer sign-off pending</p></div><div className="report-preview-stats">{(["critical", "high", "medium", "low"] as const).map(severity => <span key={severity} className={severityClass(severity)}><b>{reportResult.severityCounts?.[severity] ?? 0}</b> {severity}</span>)}</div>{reportResult.storageUrl ? <a className="primary-action" href={resolveBackendAssetUrl(reportResult.storageUrl)} target="_blank" rel="noreferrer"><FileText /> OPEN PDF</a> : <span className="report-missing">PDF storage URL unavailable</span>} {reportResult.storageUrl && <div className="report-preview-embed"><iframe title="Latest DRIFT inspection report" src={resolveBackendAssetUrl(reportResult.storageUrl)} /></div>}</article>}
          {transientSimulatorRun && <article className="report-preview-panel"><div><span className="eyebrow">INSPECTION REPORT</span><h3>Defect detection results</h3><p>{transientSimulatorRun.findings.length} defects detected across IGDTUW and IIIT-Delhi campuses. Click any finding below to view on the map.</p></div><section className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Detected defects register">{transientSimulatorRun.findings.map((finding, index) => <button key={`${finding.latitude}-${finding.longitude}`} type="button" onClick={() => inspectTransientAdvisory(index)} className="rounded border border-slate-200 bg-white p-3 text-left text-slate-800 transition hover:border-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"><span className="block text-[10px] font-bold uppercase tracking-[.14em] text-sky-600">Defect #{String(index + 1).padStart(2, "0")}</span><strong className="mt-1 block text-sm">{finding.title}</strong><span className="mt-1 block text-xs text-slate-500">{finding.score.severity.toUpperCase()} · {Math.round(finding.confidence * 100)}% confidence</span><span className="mt-1 block text-xs text-slate-400">{finding.latitude.toFixed(6)}, {finding.longitude.toFixed(6)}</span><span className="mt-2 block text-[10px] font-bold uppercase tracking-[.12em] text-sky-600">View on map</span></button>)}</section>{transientBriefing && <><pre className="ai-brief">{transientBriefing}</pre><button type="button" className="primary-action" onClick={downloadTransientBriefing}>DOWNLOAD REPORT</button></>}<button type="button" className="secondary-action" onClick={buildTransientBriefing}>REFRESH REPORT</button></article>}
          {aiBrief && <article className="ai-brief"><span className="eyebrow">AI DECISION-SUPPORT DRAFT · ENGINEER REVIEW REQUIRED</span><p>{aiBrief}</p></article>}
          <div className="report-stack">{visibleReports.map(report => { const scope = report.inspectionScope && typeof report.inspectionScope === "object" ? report.inspectionScope as Record<string, unknown> : {}; const severityCounts = scope.severityCounts && typeof scope.severityCounts === "object" ? scope.severityCounts as Record<string, number> : {}; return <article className="report-card" key={report.id}><div className="report-number">R/{String(report.id).padStart(3, "0")}</div><div><span className="eyebrow">{report.status} · {scope.format === "application/pdf" ? "PDF" : "RECORD"}</span><h3>{report.title}</h3><p>{report.narrative}</p><div className="report-mini-metrics"><span>{String(scope.evidenceCount ?? "—")} evidence</span><span>{String(scope.defectCount ?? "—")} findings</span><span className="critical-text">{String(severityCounts.critical ?? 0)} critical</span><span>{String(severityCounts.high ?? 0)} high</span></div></div><div className="report-actions"><button type="button" onClick={() => { setReportResult({ title: report.title, storageUrl: report.storageUrl ?? undefined, evidenceCount: Number(scope.evidenceCount ?? 0), defectCount: Number(scope.defectCount ?? 0), format: String(scope.format ?? "") , severityCounts }); auditAction("Report preview"); }}>PREVIEW</button>{report.storageUrl ? <a href={resolveBackendAssetUrl(report.storageUrl)} target="_blank" rel="noreferrer">OPEN PDF</a> : <span className="report-missing">PDF unavailable</span>}</div></article>; })}</div>{reports.length > visibleReports.length && <p className="access-note">Showing the most recent {visibleReports.length} records. {reports.length - visibleReports.length} older report record{reports.length - visibleReports.length === 1 ? "" : "s"} remain in the database history and are not duplicated into this operational view.</p>}
          {!reports.length && <article className="empty-state report-empty"><FileText /><h3>No reports generated yet</h3><p>Run an inspection scan and generate a PDF report from the Operations tab. Reports include defect details, priority scores, contractor assignments, and cost estimates.</p><button type="button" className="primary-action" onClick={() => setWorkspace("operations")}>GO TO OPERATIONS</button></article>}
        </section>}

        {workspace === "accountability" && <section className="workspace-page accountability-workspace">
          <PublicDatasetVisualCard onPreview={() => setEvidencePreview(publicDatasetSamples[0]!)} onOpenEvidence={() => setWorkspace("evidence")} />
          <div className="workspace-header"><div><span className="eyebrow">EVIDENCE-TO-ACTION CONTROL PLANE</span><h2>Infrastructure accountability</h2><p className="workspace-lede">Connect reviewed evidence to an approved ownership route, real contractor assignment, SLA rule, closure proof, and engineer verification. DRIFT does not invent an owner, contractor, repair outcome, or government-system delivery.</p></div><span className={cn("hardware-status", accountabilityReady ? "connected" : "offline")}>{accountabilityReady ? "PERSISTENT WORKFLOW READY" : "CONFIGURATION REQUIRED"}</span></div>
          <ContractorReadinessBoard onNavigate={setWorkspace} />
          <section className="stats-grid accountability-stats"><StatBlock label="REAL CONTRACTORS" value={String(accountability.data?.contractors.length ?? 0).padStart(2, "0")} detail="authenticated project records" /><StatBlock label="OPEN TICKETS" value={String((accountability.data?.tickets ?? []).filter(ticket => ticket.status === "open" || ticket.status === "assigned").length).padStart(2, "0")} detail="not closure claims" /><StatBlock label="ROUTING DECISIONS" value={String(accountability.data?.routing.length ?? 0).padStart(2, "0")} detail="reviewed ownership proposals" /><StatBlock label="GOVERNMENT HANDOFFS" value={String(accountability.data?.handoffs.length ?? 0).padStart(2, "0")} detail="prepared, never auto-delivered" /></section>
          {!accountabilityReady && <section className="safety-banner persistence-banner"><CloudCog /><div><strong>ACCOUNTABILITY DATA NOT CONFIGURED</strong><span>{accountabilityPersistence?.message ?? persistenceMessage} Create no fake contractor, ownership, CCTV, SLA, ticket, or completion record until the PostgreSQL migration and approved project data are available.</span></div><button type="button" onClick={() => setWorkspace("hardware")}>VIEW READINESS <ChevronRight /></button></section>}
          <section className="operations-grid accountability-grid">
            <article className="panel priority-panel"><div className="panel-heading"><div><span className="eyebrow">01 · DSI FACTOR CARD</span><h2>Transparent priority</h2></div><Gauge /></div><div className="governance-list"><div><strong>Evidence support</strong><span>{selectedEvidence?.qualityStatus ?? "missing"} quality · original/provenance review required</span></div><div><strong>Location support</strong><span>{selectedEvidence?.latitude && selectedEvidence?.longitude ? "exact capture coordinates recorded" : selectedEvidence?.captureZone ? `approved zone ${selectedEvidence.captureZone}` : "unresolved"}</span></div><div><strong>Asset criticality</strong><span>{availableAssets.find(asset => asset.id === selected.assetId)?.criticality ?? "—"}/5 from project asset register</span></div><div><strong>Operational impact</strong><span>Engineer/owner input required · never inferred from a public map</span></div><div><strong>Verification state</strong><span>Contractor close is not fixed; engineer follow-up evidence is required</span></div></div><p className="access-note">If evidence support, location support, or approved impact is missing, DSI stores <strong>INSUFFICIENT EVIDENCE</strong> instead of a false priority.</p></article>
            <article className="panel decision-panel"><div className="panel-heading"><div><span className="eyebrow">02 · CREATE REAL MAINTENANCE CASE</span><h2>Engineer checkpoint</h2></div><ClipboardCheck /></div><label className="accountability-field">Ticket title<input value={ticketTitle} onChange={event => setTicketTitle(event.target.value)} disabled={!canOperate || !accountabilityReady} /></label><label className="accountability-field">Approved impact / 100<input value={ticketImpact} onChange={event => setTicketImpact(event.target.value)} inputMode="numeric" disabled={!canOperate || !accountabilityReady} /></label><label className="accountability-field">Scope and verification context<textarea value={ticketScope} onChange={event => setTicketScope(event.target.value)} disabled={!canOperate || !accountabilityReady} /></label><button type="button" className="primary-action full" onClick={createAccountabilityCase} disabled={!canOperate || !accountabilityReady || createAccountabilityTicket.isPending} title={!canOperate ? "Sign in as an engineer or administrator." : !accountabilityReady ? accountabilityPersistence?.message ?? persistenceMessage : undefined}>{createAccountabilityTicket.isPending ? "CREATING CASE" : !canOperate ? "SIGN IN FOR TICKET" : !accountabilityReady ? "PERSISTENCE REQUIRED" : "CREATE ENGINEER-REVIEWED TICKET"} <ChevronRight /></button><p className="access-note">A real contractor can be assigned only after an administrator creates an authenticated organization record. No demo contractor data is used.</p></article>
          </section>
          <section className="panel cctv-control-panel"><div className="panel-heading"><div><span className="eyebrow">PERMISSIONED CCTV TRIAGE</span><h2>Validate before a site follow-up</h2><p className="workspace-lede">CCTV contributes a privacy-governed, zone-level candidate only. It does not prove a defect, expose raw footage publicly, access audio by default, or command a UAV.</p></div><Video /></div><div className="cctv-control-grid"><div><span className="eyebrow">AUTHORIZED CAMERA SOURCES</span><strong>{String(accountability.data?.cameras.length ?? 0).padStart(2, "0")}</strong><p>Owner, purpose, retention, access classification, zone, and privacy record are mandatory before intake.</p></div><div><span className="eyebrow">PENDING HUMAN REVIEW</span><strong>{String((accountability.data?.cameraCandidates ?? []).filter(candidate => candidate.status === "pending_review").length).padStart(2, "0")}</strong><p>Duplicate suppression, evidence integrity, temporal support, and confidence checks precede engineer disposition.</p></div><div><span className="eyebrow">UAV FOLLOW-UP</span><strong>{String((accountability.data?.cameraCandidates ?? []).filter(candidate => candidate.status === "uav_preflight_recommended").length).padStart(2, "0")}</strong><p>Only a prepared recommendation; named operator, owner approval, airspace, and legal checks remain external human duties.</p></div></div><p className="access-note">{accountabilityReady ? "No public traffic feed is connected. An administrator can register only project-authorized cameras, and an engineer must review each candidate." : "Camera registration and candidate intake remain disabled until the reviewed PostgreSQL migration, real camera authorization records, and approved external evidence storage are configured."}</p></section>
          <section className="panel rag-panel"><div className="panel-heading"><div><span className="eyebrow">APPROVED-SOURCE RAG · ROLE-SCOPED</span><h2>Ask the project record, not the web</h2><p className="workspace-lede">This assistant searches only approved, versioned document chunks that your authenticated role may access. It records retrieval metadata, returns citations, and refuses a project-specific answer when no approved source supports it.</p></div><BookOpenCheck /></div><label className="accountability-field">Question for approved project knowledge<textarea value={ragQuestion} onChange={event => setRagQuestion(event.target.value)} disabled={!isAuthenticated || askApprovedKnowledge.isPending} /></label><div className="rag-actions"><button type="button" className="primary-action" onClick={() => askApprovedKnowledge.mutate({ question: ragQuestion })} disabled={!isAuthenticated || askApprovedKnowledge.isPending} title={!isAuthenticated ? "Sign in to retrieve role-permitted project knowledge." : undefined}>{askApprovedKnowledge.isPending ? "RETRIEVING APPROVED SOURCES" : !isAuthenticated ? "SIGN IN FOR RAG" : "RETRIEVE APPROVED SOURCES"} <ChevronRight /></button><span>NO OPEN WEB · NO UNAPPROVED DOCUMENTS · NO HIDDEN CITATIONS</span></div>{ragResult ? <div className="rag-result"><div className="rag-result-header"><strong>{ragResult.retrieval.status.replaceAll("_", " ")}</strong><span>{ragResult.source.replaceAll("-", " ")}</span></div><pre>{ragResult.answer}</pre>{ragResult.retrieval.citations.length ? <div className="rag-citations"><span className="eyebrow">RETRIEVED SOURCE CITATIONS</span>{ragResult.retrieval.citations.map((citation, index) => <div key={citation.chunkId}><strong>[{index + 1}] {citation.title}</strong><span>{citation.sectionReference} · v{citation.version} · score {citation.score}{citation.sourceReference ? ` · ${citation.sourceReference}` : " · source reference not recorded"}</span></div>)}</div> : <p className="access-note">{ragResult.retrieval.message}</p>}</div> : <p className="access-note">No approved project knowledge is preloaded. An administrator must register a real project document, then independently approve it before any role-scoped answer can be generated.</p>}</section>
          <section className="lower-grid accountability-flow-grid"><article className="panel evidence-panel"><div className="panel-heading"><div><span className="eyebrow">03 · OWNERSHIP / SLA ROUTING</span><h2>Resolve before escalation</h2></div><Waypoints /></div><div className="governance-list"><div><strong>Authoritative route only</strong><span>Asset class + approved zone + boundary source + effective contract/SLA rule</span></div><div><strong>Conflict-safe behavior</strong><span>Multiple or missing matches remain unresolved; no legal ownership assumption is made</span></div><div><strong>Human authorization</strong><span>A proposed route requires engineer approval before a handoff package is prepared</span></div></div><p className="access-note">Current approved routing records: {accountability.data?.routing.filter(route => route.status === "approved").length ?? 0}. Export adapters stay in prepared state until a named authority authorizes schema and credentials.</p></article><article className="panel decision-panel"><div className="panel-heading"><div><span className="eyebrow">04 · CLOSE, VERIFY, PUBLISH</span><h2>Proof before trust</h2></div><ShieldCheck /></div><div className="governance-list"><div><strong>Contractor closure</strong><span>Actual closure note and original proof references</span></div><div><strong>Engineer verification</strong><span>Follow-up evidence yields Fixed, Needs Rework, or Cannot Verify</span></div><div><strong>Controlled transparency</strong><span>Public summaries are owner-approved, privacy-reviewed, and exclude raw CCTV and unverified candidates</span></div></div><p className="access-note">Published public summaries: {accountability.data?.publications.filter(item => item.status === "published").length ?? 0}. CCTV remains permissioned and never triggers autonomous drone flight.</p></article></section>
          {role === "contractor" && <section className="panel contractor-workspace-panel"><div className="panel-heading"><div><span className="eyebrow">ASSIGNED CONTRACTOR WORK</span><h2>Accept, progress, prove</h2><p className="workspace-lede">Only tickets assigned to your authenticated contractor identity appear here. Closure remains a request until an engineer verifies original follow-up evidence.</p></div><ClipboardCheck /></div>{!contractorWorkReady ? <p className="access-note">{contractorWorkPersistence?.message ?? persistenceMessage} This workspace never falls back to the global accountability register. No contractor transition can be written until approved PostgreSQL migration and real organization records are active.</p> : !assignedContractorTickets.length ? <div className="empty-state"><h3>No assigned real ticket</h3><p>An administrator must assign a registered contractor organization and its authenticated contractor user. DRIFT does not create sample assignments.</p></div> : <div className="contractor-ticket-list">{assignedContractorTickets.map(ticket => <article key={ticket.id} className="contractor-ticket-card"><div><span className="eyebrow">TICKET #{ticket.id} · {ticket.status.replaceAll("_", " ")}</span><h3>{ticket.title}</h3><p>{ticket.scopeNote}</p><small>Verification criterion: {ticket.verificationCriterion}</small></div><div className="contractor-ticket-actions">{ticket.status === "assigned" && <><button type="button" onClick={() => acceptContractorTicket.mutate({ ticketId: ticket.id })} disabled={acceptContractorTicket.isPending}>ACCEPT</button><button type="button" onClick={() => startContractorTicket.mutate({ ticketId: ticket.id })} disabled={startContractorTicket.isPending}>START WORK</button></>}{(ticket.status === "assigned" || ticket.status === "in_progress") && <><textarea value={contractorNote} onChange={event => setContractorNote(event.target.value)} placeholder="Progress note for the engineer audit trail" /><button type="button" onClick={() => addContractorTicketNote.mutate({ ticketId: ticket.id, note: contractorNote })} disabled={!contractorNote.trim() || addContractorTicketNote.isPending}>ADD AUDIT NOTE</button></>}<button type="button" disabled title="Closure proof upload activates only after approved external object storage is configured and original evidence is attached.">PROOF STORAGE REQUIRED FOR CLOSURE</button></div></article>)}</div>}</section>}
        </section>}

        {workspace === "hardware" && <section className="workspace-page hardware-workspace">
          <div className="workspace-header"><div><span className="eyebrow">OPERATOR-CONTROLLED INTEGRATION</span><h2>Hardware bridge</h2></div><span className={cn("hardware-status", connectedStatus)}>{connectedStatus}</span></div>
          <div className="uav-capture-console">
            <article className="hardware-card uav-profile-card">
              <RadioTower />
              <span className="eyebrow">01 · AIRCRAFT / BRIDGE PROFILE</span>
              <h3>Choose a compatible UAV path</h3>
              <p>DRIFT is airframe-agnostic. Select a profile now; an operator-approved PX4/ArduPilot MAVLink bridge or HTTP/RTSP media gateway is connected later. DRIFT does not arm, launch, navigate, or control the aircraft.</p>
              <label>Aircraft profile<select value={uavProfile} onChange={event => { const value = event.target.value; setUavProfile(value); if (value.startsWith("DJI Mini 3 Pro")) setUavAdapter("http-webhook"); }}><option>PX4 / ArduPilot MAVLink-compatible UAV</option><option>DJI Mini 3 Pro · Mobile SDK / operator export</option><option>Custom UAV / HTTP telemetry gateway</option><option>Bluetooth telemetry adapter via companion gateway</option><option>RTSP camera payload / media gateway</option></select></label>
              <label>Bridge contract<select value={uavAdapter} onChange={event => setUavAdapter(event.target.value as typeof uavAdapter)}><option value="mavlink-bridge">MAVLink telemetry bridge</option><option value="http-webhook">HTTP telemetry webhook</option><option value="rtsp-media">RTSP media gateway</option></select></label>
              <code>{uavProfile.startsWith("DJI Mini 3 Pro") ? "DJI Fly / approved Android SDK → receive-only gateway → authenticated DRIFT ingest" : uavAdapter === "rtsp-media" ? "RTSP camera gateway → selected originals → authenticated DRIFT ingest" : uavAdapter === "http-webhook" ? "Operator telemetry → HTTPS webhook → authenticated DRIFT ingest" : "MAVLink / UDP or serial → operator bridge → authenticated DRIFT ingest"}</code>
            </article>
            <article className="hardware-card uav-capture-card">
              <Video />
              <span className="eyebrow">02 · CAPTURE MISSION</span>
              <h3>Record original drone evidence</h3>
              <p>Create a hardware-mode preflight mission, then upload original camera photos or clips. Each stored item is marked as operator UAV capture and carries camera, time, location, mission, and inference provenance.</p>
              <label>Mission label<input value={uavMissionName} onChange={event => setUavMissionName(event.target.value)} /></label>
              <div className="uav-coordinate-inputs"><label>Latitude<input value={uavLatitude} onChange={event => setUavLatitude(event.target.value)} inputMode="decimal" /></label><label>Longitude<input value={uavLongitude} onChange={event => setUavLongitude(event.target.value)} inputMode="decimal" /></label></div>
              <button type="button" onClick={startUavCaptureMission} disabled={!canOperate || !persistenceAvailable || createHardwareCaptureMission.isPending} title={!canOperate ? "Sign in as an engineer or administrator to create a UAV capture mission." : !persistenceAvailable ? persistenceMessage : undefined}>{createHardwareCaptureMission.isPending ? "CREATING PREFLIGHT" : !canOperate ? "SIGN IN FOR PREFLIGHT" : !persistenceAvailable ? "PERSISTENCE REQUIRED" : "CREATE UAV PREFLIGHT MISSION"} <ChevronRight /></button>
              <button type="button" className="secondary-action" onClick={() => { setWorkspace("evidence"); setTimeout(() => filePickerRef.current?.click(), 0); }} disabled={!canOperate || !persistenceAvailable} title={!canOperate ? "Sign in as an engineer or administrator to upload original drone media." : !persistenceAvailable ? persistenceMessage : undefined}>{!canOperate ? "SIGN IN TO UPLOAD" : !persistenceAvailable ? "PERSISTENCE REQUIRED" : "UPLOAD ORIGINAL DRONE MEDIA"} <Upload /></button>
            </article>
            <article className="hardware-card">
              <ShieldCheck />
              <span className="eyebrow">03 · LIVE STATUS / SAFE FALLBACK</span>
              <h3>{hardware.data?.adapter ?? "No bridge configured"}</h3>
              <p>{hardware.data?.operatorMessage ?? "No compatible hardware endpoint configured. The simulator is available without claiming a real flight."}</p>
              <div className="hardware-checklist"><span>Telemetry: GPS · altitude · battery · speed</span><span>Media: original photo/video + capture metadata</span><span>Report: evidence-bound, engineer sign-off required</span></div>
              <button type="button" onClick={startAvailableSimulator} disabled={runSimulator.isPending || runStatelessSimulator.isPending} title={!persistenceAvailable ? "Runs a transient simulator walkthrough only; no operational records are stored." : undefined}>{runSimulator.isPending || runStatelessSimulator.isPending ? "SIMULATING" : !persistenceAvailable ? "RUN TRANSIENT DEMO" : "RUN CLEARLY LABELLED DEMO"} <ChevronRight /></button>
            </article>
            <article className="hardware-card border-amber-600/60 bg-amber-50">
              <ShieldCheck className="text-amber-900" />
              <span className="eyebrow text-amber-900">04 · SECURITY OBSERVATION BOUNDARY</span>
              <h3 className="text-amber-950">Security adapter not configured</h3>
              <p className="text-amber-950/80">DRIFT currently records only authenticated bridge health and evidence provenance. It does not scan camera firmware, traffic, devices, or CCTV feeds and does not claim malware, tamper, or intrusion detection.</p>
              <div className="hardware-checklist text-amber-950/80"><span>Available: authenticated bridge status and evidence provenance</span><span>Required: named security integration, owner approval, scope, retention, and analyst review</span><span>Blocked: malware, firmware, or network-security claim</span></div>
              <button type="button" disabled title="A named, approved security integration and authorized audit data are required before security observations can be recorded.">SECURITY INTEGRATION REQUIRED</button>
            </article>
          </div>
          <PublicDatasetVisualCard onPreview={() => setEvidencePreview(publicDatasetSamples[0]!)} onOpenEvidence={() => setWorkspace("evidence")} />
        </section>}

        {workspace === "trains" && <section className="workspace-page">
          <TrainMonitoring />
        </section>}

        {workspace === "contractors" && <section className="workspace-page">
          <div className="workspace-header"><div><span className="eyebrow">GEO-ASSIGNED CONTRACTORS</span><h2>Contractor Management</h2><p className="workspace-lede">Contractors are automatically assigned based on GPS coordinates of detected defects. Each campus has a designated responsible contractor.</p></div></div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {contractorData.map(contractor => <article key={contractor.id} className="panel priority-panel">
              <div className="panel-heading"><div><span className="eyebrow">CONTRACTOR #{String(contractor.id).padStart(3, "0")}</span><h3>{contractor.name}</h3><p className="text-sm text-gray-500">{contractor.organization}</p></div><span className="severity-chip severity-medium">{contractor.region}</span></div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="eyebrow">EMAIL</span><p className="font-medium">{contractor.email}</p></div>
                  <div><span className="eyebrow">SPECIALIZATION</span><p className="font-medium">{contractor.specialization.join(", ")}</p></div>
                  <div><span className="eyebrow">CENTER GPS</span><p className="font-medium">{contractor.centerLat}, {contractor.centerLng}</p></div>
                  <div><span className="eyebrow">RATING</span><p className="font-medium">{contractor.rating}/5</p></div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <span className="eyebrow">GEO-BOUNDARY REGION</span>
                  <p className="mt-1 text-sm text-gray-600">Covers all infrastructure within approximately {Math.round(contractor.radiusDegrees * 111)} km of {contractor.centerLat}, {contractor.centerLng}</p>
                </div>
                <button type="button" className="primary-action w-full" onClick={() => setWorkspace("reports")}>VIEW ASSIGNED REPORTS <ChevronRight /></button>
              </div>
            </article>)}
          </div>
        </section>}

        {workspace === "traffic" && <section className="workspace-page">
          <div className="workspace-header"><div><span className="eyebrow">TRAFFIC DENSITY INTEGRATION</span><h2>Traffic Overlay</h2><p className="workspace-lede">Traffic density combined with infrastructure defects determines priority. High traffic + serious defect = very high priority dispatch.</p></div></div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-6">
            <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-center"><div className="text-xs font-bold uppercase text-red-400">HEAVY TRAFFIC</div><div className="mt-1 text-lg font-bold text-red-600">{trafficData.filter(t => t.density === "heavy").length} segments</div><div className="text-xs text-red-500">High impact on priority</div></div>
            <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-4 text-center"><div className="text-xs font-bold uppercase text-orange-400">MODERATE TRAFFIC</div><div className="mt-1 text-lg font-bold text-orange-600">{trafficData.filter(t => t.density === "moderate").length} segments</div><div className="text-xs text-orange-500">Medium impact on priority</div></div>
            <div className="rounded-xl border-2 border-green-300 bg-green-50 p-4 text-center"><div className="text-xs font-bold uppercase text-green-400">LIGHT / FREE</div><div className="mt-1 text-lg font-bold text-green-600">{trafficData.filter(t => t.density === "light" || t.density === "free").length} segments</div><div className="text-xs text-green-500">Minimal priority impact</div></div>
          </div>
          <div className="space-y-3">
            {trafficData.map(segment => <div key={segment.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div><h4 className="font-bold text-gray-800">{segment.name}</h4><p className="text-xs text-gray-500">{segment.infrastructureTypes.join(", ")}</p></div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${segment.density === "heavy" ? "bg-red-100 text-red-700" : segment.density === "moderate" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>{segment.density}</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-4 text-sm text-gray-600"><div>{segment.vehiclesPerHour.toLocaleString()} veh/hr</div><div>{segment.averageSpeedKmh} km/h avg</div><div>{segment.polyline.length} data points</div></div>
              <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-500">Priority Impact: +{segment.density === "heavy" ? 30 : segment.density === "moderate" ? 18 : 8} points when defect detected in this area</div>
            </div>)}
          </div>
        </section>}

        {workspace !== "evidence" && evidencePreview && <div className="evidence-modal-backdrop" role="presentation" onClick={() => setEvidencePreview(null)}><div className="evidence-modal" role="dialog" aria-modal="true" aria-label={`Evidence preview ${evidencePreview.fileName}`} onClick={event => event.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">EVIDENCE PREVIEW · {evidencePreview.source ?? "stored"}</span><h3>{evidencePreview.fileName}</h3></div><button type="button" onClick={() => setEvidencePreview(null)} aria-label="Close evidence preview">CLOSE</button></div>{evidencePreview.mediaKind === "video" ? <video src={resolveBackendAssetUrl(evidencePreview.storageUrl)} controls autoPlay /> : <img src={resolveBackendAssetUrl(evidencePreview.storageUrl)} alt={evidencePreview.fileName} />}{Boolean(evidencePreview.provenance) && <p className="provenance-line">{evidenceProvenance(evidencePreview.provenance)}</p>}<div className="modal-actions"><a href={resolveBackendAssetUrl(evidencePreview.storageUrl)} target="_blank" rel="noreferrer">OPEN ORIGINAL</a><a href={resolveBackendAssetUrl(evidencePreview.storageUrl)} download={evidencePreview.fileName}>DOWNLOAD</a></div></div></div>}

        <footer className="console-footer"><span>DRIFT / RISK-AWARE MAINTENANCE INTELLIGENCE</span><span>ENGINEER REVIEW REQUIRED FOR ALL AUTOMATED PRIORITIES</span></footer>
      </main>
    </div>
  );
}
