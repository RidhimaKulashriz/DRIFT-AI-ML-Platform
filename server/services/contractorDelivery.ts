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
  reportBase64?: string;
  reportFileName?: string;
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
  const route = resolveContractorEmail(payload);

  const report = {
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
  };
  const text = `DRIFT inspection report\n\nTicket: ${report.ticketId ?? "not assigned"}\nDefect: ${report.defectType}\nSeverity: ${report.severity}\nConfidence: ${report.confidencePercent}%\nLocation: ${report.latitude}, ${report.longitude}\nEstimated repair cost: ${report.estimatedRepairCost}\nRecommended deadline: ${report.recommendedDeadline}\nReport: ${report.reportUrl ?? "not available"}\n\nDRIFT AI findings are advisory and require engineer review before action.`;

  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ to: route.email, recipientName: route.name, matchedBy: route.matchedBy, subject: payload.subject, report, attachment: payload.reportBase64 ? { fileName: payload.reportFileName ?? `DRIFT-${payload.ticketId ?? "report"}.pdf`, contentType: "application/pdf", base64: payload.reportBase64 } : null, generatedAt: new Date().toISOString(), disclaimer: "DRIFT AI findings are advisory and require engineer review before action." }),
    }).catch(() => null);
    if (response?.ok) return { sent: true as const, recipient: route.email, matchedBy: route.matchedBy, delivery: "confirmed-by-relay" as const };
  }

  // SMTP is useful when a webhook relay is unavailable or not configured.
  const smtpUser = (process.env.EMAIL_USER ?? process.env.DRIFT_SMTP_USER)?.trim();
  const smtpPass = (process.env.EMAIL_PASS ?? process.env.DRIFT_SMTP_PASS)?.trim();
  if (smtpUser && smtpPass) {
    try {
      const nodemailer = await import("nodemailer");
      const smtpHost = process.env.DRIFT_SMTP_HOST?.trim() || "smtp.gmail.com";
      const smtpPort = Number(process.env.DRIFT_SMTP_PORT ?? 465);
      const transporter = nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: process.env.DRIFT_SMTP_SECURE !== "false", auth: { user: smtpUser, pass: smtpPass } });
      await transporter.sendMail({ from: smtpUser, to: route.email, subject: payload.subject, text, html: `<h2>DRIFT Infrastructure Inspection Report</h2><p>${text.replaceAll("\n", "<br>")}</p>`, attachments: payload.reportBase64 ? [{ filename: payload.reportFileName ?? `DRIFT-${payload.ticketId ?? "report"}.pdf`, content: Buffer.from(payload.reportBase64, "base64"), contentType: "application/pdf" }] : undefined });
      return { sent: true as const, recipient: route.email, matchedBy: route.matchedBy, delivery: "confirmed-by-smtp" as const };
    } catch (error) {
      console.error("[DRIFT EMAIL] SMTP delivery failed:", error instanceof Error ? error.message : error);
    }
  }

  throw new TRPCError({ code: endpoint ? "BAD_GATEWAY" : "PRECONDITION_FAILED", message: endpoint ? `The email relay rejected the report for ${route.email}; SMTP fallback also failed.` : "Contractor email delivery is not configured. Set DRIFT_EMAIL_WEBHOOK_URL or EMAIL_USER/EMAIL_PASS on Render; no email was sent." });
}
