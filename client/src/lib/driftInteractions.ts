export type Severity = "critical" | "high" | "medium" | "low";

export function requestedSeverityFilter(question: string): Severity | null {
  const normalized = question.toLowerCase();
  if (!/\b(show|filter|only|within|near|map)\b/.test(normalized)) return null;
  return (["critical", "high", "medium", "low"] as Severity[]).find(severity => normalized.includes(severity)) ?? null;
}

export function markerAccessibilityLabel(label: string, severity: Severity, latitude: string | number, longitude: string | number) {
  return `Locate ${severity} finding ${label} at ${latitude}, ${longitude}`;
}
