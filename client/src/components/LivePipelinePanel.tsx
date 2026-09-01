import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  connectedStatus: string;
  telemetryCount: number;
  defectCount: number;
  hasSelectedFinding: boolean;
  hasReport: boolean;
  canOperate: boolean;
  sending: boolean;
  deliveryConfirmed: boolean;
  onSend: () => void;
};

export function LivePipelinePanel({ connectedStatus, telemetryCount, defectCount, hasSelectedFinding, hasReport, canOperate, sending, deliveryConfirmed, onSend }: Props) {
  const steps = [
    ["01", "Phone / laptop bridge", connectedStatus === "connected"],
    ["02", "GPS + media ingest", telemetryCount > 0],
    ["03", "ML detection", defectCount > 0],
    ["04", "Map + evidence vault", hasSelectedFinding],
    ["05", "Report + contractor handoff", hasReport],
  ] as const;
  return <article className="live-pipeline-panel"><div className="panel-heading"><div><span className="eyebrow">LIVE PIPELINE · RECEIVE-ONLY</span><h2>Connected inspection chain</h2></div><span className={cn("hardware-status", connectedStatus)}>{connectedStatus}</span></div><div className="pipeline-steps">{steps.map(([number, label, complete]) => <span key={number} className={cn("pipeline-step", complete && "complete")}><b>{number}</b> {label}</span>)}</div><p className="access-note">The bridge is receive-only. Original images/video enter the authenticated backend, inference remains advisory, GPS is retained with the evidence, and contractor actions remain subject to engineer review. {deliveryConfirmed ? "The latest report was accepted by the configured delivery relay." : "Configure the backend delivery relay to enable Send Email to Contractor."}</p><button type="button" className="primary-action" onClick={onSend} disabled={!canOperate || !hasSelectedFinding || sending}>{sending ? "SENDING REPORT" : "SEND EMAIL TO CONTRACTOR"} <ChevronRight /></button></article>;
}
