export const REPORT_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type ReportSeverity = (typeof REPORT_SEVERITIES)[number];

export function summarizeSeverity<T extends { severity: string | null | undefined }>(rows: T[]) {
  return REPORT_SEVERITIES.reduce<Record<ReportSeverity, number>>((summary, severity) => {
    summary[severity] = rows.filter(row => row.severity === severity).length;
    return summary;
  }, { critical: 0, high: 0, medium: 0, low: 0 });
}

export function toMapMarker<T extends {
  id: number;
  missionId: number;
  assetId: number;
  defectType: string;
  label: string;
  inspectionDomain: string | null;
  severity: string;
  status: string;
  reviewState: string;
  zeroErrorScore: number;
  confidencePercent: number | null;
  coveragePercent: number | null;
  evidenceId: number | null;
  correlationKey: string | null;
  explanation: unknown;
  latitude: string | number | null;
  longitude: string | number | null;
}>(defect: T) {
  return {
    id: defect.id,
    missionId: defect.missionId,
    assetId: defect.assetId,
    defectType: defect.defectType,
    label: defect.label,
    inspectionDomain: defect.inspectionDomain,
    severity: defect.severity,
    status: defect.status,
    reviewState: defect.reviewState,
    zeroErrorScore: defect.zeroErrorScore,
    confidencePercent: defect.confidencePercent,
    coveragePercent: defect.coveragePercent,
    evidenceId: defect.evidenceId,
    correlationKey: defect.correlationKey,
    explanation: defect.explanation,
    latitude: Number(defect.latitude),
    longitude: Number(defect.longitude),
  };
}
