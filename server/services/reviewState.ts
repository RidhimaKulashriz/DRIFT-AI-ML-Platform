export type ReviewDecision = "approve" | "override" | "reject" | "needs_site_visit";
export type Severity = "low" | "medium" | "high" | "critical";

export function resolveReviewState(decision: ReviewDecision, currentSeverity: Severity, override?: Severity) {
  const severity = override ?? currentSeverity;
  if (decision === "approve") return { severity, reviewState: "approved" as const, status: "verified" as const };
  if (decision === "override") return { severity, reviewState: "overridden" as const, status: "verified" as const };
  if (decision === "reject") return { severity, reviewState: "rejected" as const, status: "dismissed" as const };
  return { severity, reviewState: "pending" as const, status: "under_review" as const };
}
