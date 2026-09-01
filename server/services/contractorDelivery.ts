import { TRPCError } from "@trpc/server";

export type ContractorReportDelivery = {
  ticketId?: number;
  subject: string;
  contractor: string;
  defect: string;
  confidencePercent: number;
  severity: string;
  latitude: string;
  longitude: string;
  estimatedRepairCost: string;
  recommendedDeadline: string;
  reportUrl?: string;
  evidenceUrl?: string;
};

/**
 * Delivers a report to the configured contractor channel without exposing a
 * recipient address to the browser. The webhook can be backed by an approved
 * mail provider, an internal relay, or an automation service.
 */
export async function deliverContractorReport(payload: ContractorReportDelivery) {
  const endpoint = process.env.DRIFT_EMAIL_WEBHOOK_URL?.trim();
  if (!endpoint) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Contractor email delivery is not configured. Set DRIFT_EMAIL_WEBHOOK_URL on the backend; no email was sent.",
    });
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      recipientAlias: "assigned-contractor",
      recipientAddress: "server-configured",
      subject: payload.subject,
      report: payload,
      generatedAt: new Date().toISOString(),
      disclaimer: "DRIFT AI findings are advisory and require authorised engineer review.",
    }),
  }).catch(() => null);

  if (!response || !response.ok) {
    throw new TRPCError({ code: "BAD_GATEWAY", message: "The contractor email relay rejected or could not receive the report. No delivery was confirmed." });
  }

  return { sent: true as const, recipient: "assigned-contractor" as const, delivery: "confirmed-by-relay" as const };
}
