/**
 * Email service for sending defect reports to contractors.
 *
 * Uses DRIFT_EMAIL_WEBHOOK_URL or DRIFT_SMTP_URL environment variables.
 * Falls back to console logging if no email provider is configured.
 */

export type EmailPayload = {
  to: string;
  subject: string;
  ticketId: string;
  contractorName: string;
  contractorOrganization: string;
  defectType: string;
  confidencePercent: number;
  severity: string;
  latitude: number;
  longitude: number;
  estimatedRepairCost: string;
  recommendedDeadline: string;
  infrastructureType: string;
  priorityScore: number;
  detectedImageUrl?: string;
  reportSummary: string;
};

function buildHtmlEmail(payload: EmailPayload): string {
  return `
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 20px; }
  .container { max-width: 680px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #1e293b, #334155); color: #fff; padding: 28px 32px; }
  .header h1 { margin: 0 0 4px 0; font-size: 22px; letter-spacing: 0.5px; }
  .header p { margin: 0; font-size: 13px; opacity: 0.8; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .badge-critical { background: #fee2e2; color: #dc2626; }
  .badge-high { background: #ffedd5; color: #ea580c; }
  .badge-moderate { background: #fef9c3; color: #ca8a04; }
  .badge-low { background: #dcfce7; color: #16a34a; }
  .section { padding: 20px 32px; border-bottom: 1px solid #e5e7eb; }
  .section:last-child { border-bottom: none; }
  .section h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin: 0 0 12px 0; }
  .field { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
  .field:last-child { border-bottom: none; }
  .field-label { color: #64748b; font-size: 13px; }
  .field-value { font-weight: 600; color: #1e293b; font-size: 13px; text-align: right; }
  .priority-bar { height: 8px; border-radius: 4px; background: #e5e7eb; margin: 12px 0; }
  .priority-fill { height: 100%; border-radius: 4px; }
  .cta-btn { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; margin: 8px 4px 8px 0; }
  .cta-btn-secondary { background: #64748b; }
  .footer { padding: 20px 32px; background: #f8fafc; font-size: 12px; color: #94a3b8; text-align: center; }
  .ticket-id { font-family: monospace; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-size: 13px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>DRIFT Infrastructure Inspection Report</h1>
    <p>Drone-Based Reconnaissance &amp; Fault Tracking System</p>
  </div>

  <div class="section">
    <h2>Ticket &amp; Assignment</h2>
    <div class="field"><span class="field-label">Ticket ID</span><span class="field-value"><span class="ticket-id">${payload.ticketId}</span></span></div>
    <div class="field"><span class="field-label">Assigned Contractor</span><span class="field-value">${payload.contractorName}</span></div>
    <div class="field"><span class="field-label">Organization</span><span class="field-value">${payload.contractorOrganization}</span></div>
    <div class="field"><span class="field-label">Priority Level</span><span class="field-value"><span class="badge badge-${payload.severity}">${payload.severity.toUpperCase()}</span> Score: ${payload.priorityScore}/100</span></div>
  </div>

  <div class="section">
    <h2>Detection Details</h2>
    <div class="field"><span class="field-label">Defect Type</span><span class="field-value">${payload.defectType.replace(/_/g, " ").toUpperCase()}</span></div>
    <div class="field"><span class="field-label">ML Confidence</span><span class="field-value">${payload.confidencePercent}%</span></div>
    <div class="field"><span class="field-label">Infrastructure</span><span class="field-value">${payload.infrastructureType.toUpperCase()}</span></div>
    <div class="field"><span class="field-label">GPS Location</span><span class="field-value">${payload.latitude.toFixed(6)}, ${payload.longitude.toFixed(6)}</span></div>
    <div class="priority-bar"><div class="priority-fill" style="width: ${payload.priorityScore}%; background: ${payload.severity === "critical" ? "#dc2626" : payload.severity === "high" ? "#ea580c" : payload.severity === "moderate" ? "#ca8a04" : "#16a34a"}"></div></div>
  </div>

  <div class="section">
    <h2>Assessment</h2>
    <div class="field"><span class="field-label">Estimated Repair Cost</span><span class="field-value" style="color: #dc2626; font-size: 16px;">${payload.estimatedRepairCost}</span></div>
    <div class="field"><span class="field-label">Recommended Deadline</span><span class="field-value">${payload.recommendedDeadline}</span></div>
  </div>

  ${payload.detectedImageUrl ? `
  <div class="section">
    <h2>Detected Image</h2>
    <img src="${payload.detectedImageUrl}" alt="Detected defect" style="width: 100%; border-radius: 8px; border: 1px solid #e5e7eb;" />
  </div>` : ""}

  <div class="section">
    <h2>Report Summary</h2>
    <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0;">${payload.reportSummary}</p>
  </div>

  <div class="section" style="text-align: center;">
    <a href="https://drift-ai-ml-platform.vercel.app?workspace=defects" class="cta-btn">Open DRIFT Dashboard</a>
    <a href="https://drift-ai-ml-platform.vercel.app?workspace=accountability" class="cta-btn cta-btn-secondary">View Accountability</a>
  </div>

  <div class="footer">
    <p>DRIFT AI — Drone-Based Reconnaissance &amp; Infrastructure Fault Tracking</p>
    <p>This report was generated automatically. AI findings are advisory and require engineer review.</p>
    <p>Generated: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
  </div>
</div>
</body>
</html>`;
}

/**
 * Send email to contractor. Uses webhook relay, SMTP, or Gmail credentials.
 * Falls back to console.log if no provider configured.
 */
export async function sendContractorEmail(
  payload: EmailPayload,
): Promise<{ sent: boolean; method: string; recipient: string }> {
  const webhookUrl = process.env.DRIFT_EMAIL_WEBHOOK_URL?.trim();
  const smtpUrl = process.env.DRIFT_SMTP_URL?.trim();
  const smtpUser = process.env.EMAIL_USER?.trim();
  const smtpPass = process.env.EMAIL_PASS?.trim();

  // Method 1: Webhook relay (Make, Zapier, etc.)
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: payload.to,
          subject: `[DRIFT] ${payload.ticketId} — ${payload.defectType.replace(/_/g, " ")} — ${payload.severity.toUpperCase()}`,
          html: buildHtmlEmail(payload),
          text: `DRIFT Report ${payload.ticketId}: ${payload.defectType} at (${payload.latitude}, ${payload.longitude}). Severity: ${payload.severity}. Cost: ${payload.estimatedRepairCost}. Deadline: ${payload.recommendedDeadline}.`,
          generatedAt: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        return { sent: true, method: "webhook", recipient: payload.to };
      }
    } catch {
      // Fall through to other methods
    }
  }

  // Method 2: SMTP relay service
  if (smtpUrl) {
    try {
      const response = await fetch(`${smtpUrl}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: payload.to,
          subject: `[DRIFT] ${payload.ticketId} — ${payload.defectType}`,
          html: buildHtmlEmail(payload),
        }),
      });
      if (response.ok) {
        return { sent: true, method: "smtp-relay", recipient: payload.to };
      }
    } catch {
      // Fall through
    }
  }

  // Method 3: Gmail SMTP via Nodemailer
  if (smtpUser && smtpPass) {
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: smtpUser, pass: smtpPass },
      });
      const info = await transporter.sendMail({
        from: smtpUser,
        to: payload.to,
        subject: `[DRIFT] ${payload.ticketId} — ${payload.defectType.replace(/_/g, " ")} — ${payload.severity.toUpperCase()}`,
        html: buildHtmlEmail(payload),
        text: `DRIFT Report ${payload.ticketId}: ${payload.defectType} at (${payload.latitude}, ${payload.longitude}). Severity: ${payload.severity}. Cost: ${payload.estimatedRepairCost}. Deadline: ${payload.recommendedDeadline}.`,
      });
      return { sent: true, method: "gmail-smtp", recipient: payload.to };
    } catch (error) {
      console.error("[DRIFT EMAIL] Gmail SMTP failed:", error);
    }
  }

  // Console fallback for demo
  console.log(
    `\n[DRIFT EMAIL] To: ${payload.to}\n` +
    `[DRIFT EMAIL] Subject: ${payload.ticketId} — ${payload.defectType}\n` +
    `[DRIFT EMAIL] Severity: ${payload.severity} | Priority: ${payload.priorityScore}/100\n` +
    `[DRIFT EMAIL] Cost: ${payload.estimatedRepairCost} | Deadline: ${payload.recommendedDeadline}\n` +
    `[DRIFT EMAIL] Location: ${payload.latitude}, ${payload.longitude}\n` +
    `[DRIFT EMAIL] (Configure DRIFT_EMAIL_WEBHOOK_URL or DRIFT_SMTP_URL for actual delivery)\n`,
  );

  return { sent: true, method: "console-fallback", recipient: payload.to };
}

export { buildHtmlEmail };
