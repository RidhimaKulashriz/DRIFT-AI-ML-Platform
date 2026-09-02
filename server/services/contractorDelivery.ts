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

const CONTRACTOR_ROUTES = [
  { name: "Manu", email: "ridhimakulashri07042025@gmail.com", latitude: 28.6876, longitude: 77.2100, radius: 0.02, matchedBy: "geo-boundary" },
  { name: "Ridhima Kulashriz", email: "ridhimakulashriz@gmail.com", latitude: 28.5440, longitude: 77.2740, radius: 0.02, matchedBy: "geo-boundary" },
] as const;

function resolveContractorRoute(latitude: string, longitude: string) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const match = CONTRACTOR_ROUTES.find(route => Number.isFinite(lat) && Number.isFinite(lon) && Math.hypot(lat - route.latitude, lon - route.longitude) <= route.radius);
  return match ?? { name: "Unresolved contractor route", email: undefined, matchedBy: "no-approved-boundary-match" };
}

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

  const route = resolveContractorRoute(payload.latitude, payload.longitude);
  if (!route.email) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No approved contractor geo-boundary matched this location. No email was sent." });
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      recipientAlias: route.name,
      recipientAddress: route.email,
      matchedBy: route.matchedBy,
      subject: payload.subject,
      report: payload,
      generatedAt: new Date().toISOString(),
      disclaimer: "DRIFT AI findings are advisory and require authorised engineer review.",
    }),
  }).catch(() => null);

  if (!response || !response.ok) {
    throw new TRPCError({ code: "BAD_GATEWAY", message: "The contractor email relay rejected or could not receive the report. No delivery was confirmed." });
  }

  return { sent: true as const, recipient: route.name, matchedBy: route.matchedBy, delivery: "confirmed-by-relay" as const };
}
