import { TRPCError } from "@trpc/server";
import { findContractorByLocation, getDefaultContractor, contractors as contractorData } from "../../shared/contractors";

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
 * Resolve the actual contractor email from geo-boundary lookup.
 * Uses the shared contractor database with IGDTUW and IIIT-Delhi boundaries.
 * Make webhook needs the To: field to route emails correctly.
 */
function resolveContractorEmail(payload: ContractorReportDelivery): { email: string; name: string; matchedBy: string } {
  const lat = parseFloat(payload.latitude);
  const lng = parseFloat(payload.longitude);

  // 1. Try geo-boundary match from shared contractor database
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const geoMatch = findContractorByLocation(lat, lng);
    if (geoMatch) return { email: geoMatch.email, name: geoMatch.name, matchedBy: "geo-boundary" };
  }

  // 2. Try name match against contractor database
  const nameMatch = contractorData.find(c =>
    payload.contractor.toLowerCase().includes(c.name.toLowerCase()) ||
    c.name.toLowerCase().includes(payload.contractor.toLowerCase())
  );
  if (nameMatch) return { email: nameMatch.email, name: nameMatch.name, matchedBy: "name-match" };

  // 3. Fallback to default contractor
  const fallback = getDefaultContractor(payload.defect);
  return { email: fallback.email, name: fallback.name, matchedBy: "default-fallback" };
}

/**
 * Delivers a report to the configured contractor channel.
 * The webhook payload includes the actual contractor email for Make/Gmail routing.
 */
export async function deliverContractorReport(payload: ContractorReportDelivery) {
  const endpoint = process.env.DRIFT_EMAIL_WEBHOOK_URL?.trim();
  if (!endpoint) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Contractor email delivery is not configured. Set DRIFT_EMAIL_WEBHOOK_URL on Render; no email was sent.",
    });
  }

  const route = resolveContractorEmail(payload);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      // Make webhook uses 'to' field to route to the correct Gmail recipient
      to: route.email,
      recipientName: route.name,
      matchedBy: route.matchedBy,
      subject: payload.subject,
      // Full report data for Make/Gmail module
      report: {
        ticketId: payload.ticketId ? `DRIFT-${payload.ticketId}` : null,
        contractorName: route.name,
        contractorEmail: route.email,
        defectType: payload.defect,
        confidencePercent: payload.confidencePercent,
        severity: payload.severity,
        latitude: payload.latitude,
        longitude: payload.longitude,
        estimatedRepairCost: payload.estimatedRepairCost,
        recommendedDeadline: payload.recommendedDeadline,
        reportUrl: payload.reportUrl ?? null,
        evidenceUrl: payload.evidenceUrl ?? null,
      },
      generatedAt: new Date().toISOString(),
      disclaimer: "DRIFT AI findings are advisory and require engineer review before action.",
    }),
  }).catch(() => null);

  if (!response || !response.ok) {
    throw new TRPCError({ code: "BAD_GATEWAY", message: `The email relay rejected the report for ${route.email}. No delivery was confirmed.` });
  }

  return { sent: true as const, recipient: route.email, matchedBy: route.matchedBy, delivery: "confirmed-by-relay" as const };
}
