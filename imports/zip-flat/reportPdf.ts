import PDFDocument from "pdfkit";

const COLORS = {
  ink: "#121417",
  navy: "#071225",
  slate: "#52606d",
  line: "#d7dce1",
  paper: "#f7f8f6",
  white: "#ffffff",
  cyan: "#15b8c9",
  critical: "#c62828",
  high: "#e56b22",
  medium: "#b48a00",
  low: "#2f8b57",
};

type Severity = "critical" | "high" | "medium" | "low";
type PdfEvidence = {
  id: number;
  fileName: string;
  source?: string | null;
  captureZone?: string | null;
  qualityStatus?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  cameraId?: string | null;
  storageUrl?: string | null;
  provenance?: unknown;
  imageBuffer?: Buffer;
};
type PdfDefect = {
  id: number;
  label: string;
  defectType: string;
  severity: Severity;
  zeroErrorScore?: number | null;
  confidencePercent?: number | null;
  coveragePercent?: number | null;
  status?: string | null;
  reviewState?: string | null;
  inspectionDomain?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  evidenceId?: number | null;
  explanation?: unknown;
  uncertainty?: unknown;
  correlationKey?: string | null;
};

type PdfMission = { id: number; name: string; startedAt?: Date | null; completedAt?: Date | null; mode?: string | null; status?: string | null };

function safeText(value: unknown, fallback = "Not recorded") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}
function listText(value: unknown, fallback = "Not recorded") {
  if (!Array.isArray(value)) return fallback;
  const items = value.filter(item => typeof item === "string");
  return items.length ? items.join(" · ") : fallback;
}
function severityColor(severity: Severity) { return COLORS[severity] ?? COLORS.slate; }
function titleCase(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase()); }
function formatDate(value?: Date | null) { return value ? value.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded"; }
type FitTextOptions = PDFKit.Mixins.TextOptions & { fontSize?: number; fillColor?: string };
function fitText(doc: PDFKit.PDFDocument, text: string, x: number, y: number, width: number, height: number, options?: FitTextOptions) {
  const { fontSize = 9, fillColor = COLORS.ink, ...textOptions } = options ?? {};
  doc.fontSize(fontSize).fillColor(fillColor).text(text, x, y, { width, height, ellipsis: true, lineGap: 2, ...textOptions });
}
function pageHeader(doc: PDFKit.PDFDocument, section: string, page: number) {
  doc.save().rect(0, 0, 612, 44).fill(COLORS.navy).restore();
  doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(10).text("DRIFT", 38, 17, { characterSpacing: 1.5 });
  doc.font("Helvetica").fontSize(8).fillColor("#b8c6d9").text(section.toUpperCase(), 115, 18, { characterSpacing: 1.2 });
  doc.text(`PAGE ${page}`, 510, 18, { width: 64, align: "right" });
}
function footer(doc: PDFKit.PDFDocument) {
  doc.font("Helvetica").fontSize(7).fillColor(COLORS.slate).text("DRIFT · Automated outputs are advisory and require qualified engineer review before maintenance release.", 38, 768, { width: 536 });
}
function severityPill(doc: PDFKit.PDFDocument, severity: Severity, x: number, y: number, width = 72) {
  doc.roundedRect(x, y, width, 19, 3).fill(severityColor(severity));
  doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(8).text(severity.toUpperCase(), x, y + 6, { width, align: "center", characterSpacing: 0.8 });
}
function metric(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number) {
  doc.fillColor(COLORS.slate).font("Helvetica-Bold").fontSize(7).text(label.toUpperCase(), x, y, { width, characterSpacing: 0.7 });
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(14).text(value, x, y + 12, { width });
}
function drawCoordinatePlot(doc: PDFKit.PDFDocument, defects: PdfDefect[], x: number, y: number, width: number, height: number) {
  doc.roundedRect(x, y, width, height, 5).fill(COLORS.navy);
  doc.strokeColor("#27415b").lineWidth(0.5);
  for (let i = 1; i < 6; i += 1) {
    doc.moveTo(x + width * i / 6, y).lineTo(x + width * i / 6, y + height).stroke();
    doc.moveTo(x, y + height * i / 6).lineTo(x + width, y + height * i / 6).stroke();
  }
  const points = defects.map(item => ({ lat: Number(item.latitude), lng: Number(item.longitude), item })).filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng));
  if (!points.length) {
    doc.fillColor("#9bb0c7").font("Helvetica").fontSize(9).text("No coordinate-bearing findings were available for this report.", x + 18, y + height / 2 - 5, { width: width - 36, align: "center" });
    return;
  }
  const minLat = Math.min(...points.map(p => p.lat));
  const maxLat = Math.max(...points.map(p => p.lat));
  const minLng = Math.min(...points.map(p => p.lng));
  const maxLng = Math.max(...points.map(p => p.lng));
  points.forEach(point => {
    const px = x + 18 + ((point.lng - minLng) / (maxLng - minLng || 1)) * (width - 36);
    const py = y + height - 18 - ((point.lat - minLat) / (maxLat - minLat || 1)) * (height - 36);
    doc.circle(px, py, 7).fill(severityColor(point.item.severity));
    doc.circle(px, py, 7).lineWidth(1).strokeColor(COLORS.white).stroke();
    doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(6.5).text(String(point.item.id), px - 6, py - 2.5, { width: 12, align: "center" });
  });
  doc.fillColor("#9bb0c7").font("Helvetica").fontSize(7).text("NORTH ↑  ·  COORDINATE PLOT  ·  NOT A SURVEY BASEMAP", x + 15, y + height - 13, { width: width - 30, characterSpacing: 0.4 });
}

export async function renderInspectionPdf(input: { mission: PdfMission; evidence: PdfEvidence[]; defects: PdfDefect[]; repairTotalCents: number; }) {
  const doc = new PDFDocument({ size: "A4", margin: 38, autoFirstPage: false, compress: false });
  doc.initForm();
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", chunk => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const counts = (Object.keys(COLORS) as string[]).filter(key => ["critical", "high", "medium", "low"].includes(key)).reduce<Record<string, number>>((acc, key) => { acc[key] = input.defects.filter(item => item.severity === key).length; return acc; }, {});
  const coordinateCount = input.defects.filter(item => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))).length;
  const generated = new Date();
  const reportStatus = input.defects.some(item => item.reviewState === "pending" || item.reviewState === "rejected") ? "ENGINEER REVIEW REQUIRED" : "READY FOR SIGN-OFF";

  doc.addPage();
  doc.rect(0, 0, 612, 842).fill(COLORS.paper);
  doc.rect(0, 0, 612, 260).fill(COLORS.navy);
  doc.rect(38, 49, 8, 44).fill(COLORS.cyan);
  doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(34).text("DRIFT", 60, 48, { characterSpacing: 2 });
  doc.fillColor("#b8c6d9").font("Helvetica-Bold").fontSize(8).text("DRONE BASED RECONNAISSANCE & FAULT TRACKING", 62, 91, { characterSpacing: 1.2 });
  doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(26).text("INFRASTRUCTURE\nINSPECTION REPORT", 38, 144, { lineGap: 3 });
  doc.fillColor(COLORS.cyan).font("Helvetica-Bold").fontSize(9).text(reportStatus, 40, 232, { characterSpacing: 1.2 });
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(22).text(input.mission.name, 38, 310, { width: 500 });
  doc.fillColor(COLORS.slate).font("Helvetica").fontSize(10).text(`Mission ${input.mission.id}  ·  ${titleCase(safeText(input.mission.mode, "inspection"))}  ·  ${titleCase(safeText(input.mission.status, "completed"))}`, 40, 348);
  doc.moveTo(38, 380).lineTo(574, 380).strokeColor(COLORS.line).stroke();
  metric(doc, "Report generated", formatDate(generated), 40, 407, 170);
  metric(doc, "Evidence records", String(input.evidence.length), 240, 407, 110);
  metric(doc, "Candidate findings", String(input.defects.length), 410, 407, 130);
  doc.fillColor(COLORS.slate).font("Helvetica").fontSize(9).text("This report binds persisted evidence, coordinate context, model outputs, review state, uncertainty, and recommended next actions. It is not a substitute for a qualified field inspection.", 40, 490, { width: 485, lineGap: 3 });
  doc.roundedRect(40, 560, 500, 92, 5).fill("#e8eef3");
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(11).text("CONTROL BOUNDARY", 58, 580, { characterSpacing: 0.8 });
  doc.fillColor(COLORS.slate).font("Helvetica").fontSize(9).text("Automated outputs are advisory. Every critical and high finding must be reviewed by an authorised engineer before a work order, restriction, or release decision.", 58, 602, { width: 455, lineGap: 3 });
  footer(doc);

  doc.addPage();
  pageHeader(doc, "Executive summary", 2);
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(23).text("Executive summary", 38, 72);
  doc.fillColor(COLORS.slate).font("Helvetica").fontSize(9).text("Decision-ready overview of the inspection pass and its open engineering controls.", 38, 105);
  const summaryCards = [
    ["CRITICAL", String(counts.critical ?? 0), COLORS.critical], ["HIGH", String(counts.high ?? 0), COLORS.high], ["MEDIUM", String(counts.medium ?? 0), COLORS.medium], ["LOW", String(counts.low ?? 0), COLORS.low],
  ];
  summaryCards.forEach(([label, value, color], index) => { const x = 38 + index * 132; doc.roundedRect(x, 145, 118, 78, 4).fill("#edf0f2"); doc.rect(x, 145, 118, 6).fill(color); doc.fillColor(COLORS.slate).font("Helvetica-Bold").fontSize(8).text(label, x + 12, 164, { characterSpacing: 0.9 }); doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(28).text(value, x + 12, 183); });
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(13).text("Inspection controls", 38, 267);
  const controls = [["Mission status", titleCase(safeText(input.mission.status, "completed"))], ["Review gate", reportStatus], ["Coordinate-bearing findings", `${coordinateCount} / ${input.defects.length}`], ["Repair exposure", `₹${Math.round(input.repairTotalCents / 100).toLocaleString("en-IN")}`], ["Evidence provenance", input.evidence.some(item => item.source === "simulator") ? "Simulator/reference media present" : "Uploaded/hardware media"], ["Coverage interpretation", "Media-linked, not a site-survey completeness claim"]];
  controls.forEach(([label, value], index) => { const y = 305 + index * 31; doc.strokeColor(COLORS.line).lineWidth(0.7).moveTo(38, y + 21).lineTo(574, y + 21).stroke(); doc.fillColor(COLORS.slate).font("Helvetica-Bold").fontSize(8).text(label.toUpperCase(), 38, y + 5, { width: 180, characterSpacing: 0.5 }); doc.fillColor(COLORS.ink).font("Helvetica").fontSize(9).text(value, 228, y + 5, { width: 340 }); });
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(13).text("Coordinate context", 38, 521);
  drawCoordinatePlot(doc, input.defects, 38, 548, 536, 165);
  footer(doc);

  doc.addPage();
  pageHeader(doc, "Evidence register", 3);
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(23).text("Evidence register", 38, 72);
  doc.fillColor(COLORS.slate).font("Helvetica").fontSize(9).text(`${input.evidence.length} persisted media record(s) linked to mission ${input.mission.id}.`, 38, 105);
  let ey = 145;
  for (const item of input.evidence) {
    if (ey > 690) { footer(doc); doc.addPage(); pageHeader(doc, "Evidence register", 3); ey = 72; }
    doc.roundedRect(38, ey, 536, 112, 4).fill("#eef1f2");
    if (item.imageBuffer) {
      try { doc.image(item.imageBuffer, 50, ey + 12, { fit: [104, 76], align: "center", valign: "center" }); } catch { doc.rect(50, ey + 12, 104, 76).fill("#d2d9dd"); }
    } else { doc.rect(50, ey + 12, 104, 76).fill(COLORS.navy); doc.fillColor("#9bb0c7").font("Helvetica-Bold").fontSize(8).text("MEDIA\nPREVIEW", 50, ey + 39, { width: 104, align: "center", lineGap: 2 }); }
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(10).text(`#${item.id}  ${safeText(item.fileName)}`, 174, ey + 14, { width: 380, ellipsis: true });
    doc.fillColor(COLORS.slate).font("Helvetica").fontSize(8).text(`${titleCase(safeText(item.source, "unknown"))}  ·  ${titleCase(safeText(item.captureZone, "unknown"))}  ·  ${titleCase(safeText(item.qualityStatus, "unknown"))}`, 174, ey + 33, { width: 380 });
    doc.fillColor(COLORS.slate).font("Helvetica").fontSize(8).text(`GPS  ${safeText(item.latitude)}  /  ${safeText(item.longitude)}    CAMERA  ${safeText(item.cameraId)}`, 174, ey + 51, { width: 380 });
    const provenance = item.provenance && typeof item.provenance === "object" ? item.provenance as Record<string, unknown> : {};
    const kind = typeof provenance.kind === "string" ? provenance.kind : "unclassified";
    const aircraftProfile = typeof provenance.aircraftProfile === "string" ? provenance.aircraftProfile : "not recorded";
    doc.fillColor(COLORS.slate).font("Helvetica").fontSize(8).text(`Provenance: ${kind} · Aircraft: ${aircraftProfile}`, 174, ey + 69, { width: 380, ellipsis: true });
    doc.fillColor(COLORS.slate).font("Helvetica").fontSize(8).text(item.storageUrl ? `Stored original: ${item.storageUrl}` : "Stored media URL not recorded", 174, ey + 85, { width: 380, ellipsis: true });
    ey += 124;
  }
  if (!input.evidence.length) doc.fillColor(COLORS.slate).font("Helvetica").fontSize(10).text("No evidence records are available for this mission.", 38, 150);
  footer(doc);

  let page = 4;
  for (const defect of input.defects) {
    doc.addPage();
    pageHeader(doc, "Finding review", page);
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(22).text(`Finding ${String(defect.id).padStart(3, "0")}`, 38, 72);
    severityPill(doc, defect.severity, 466, 75, 108);
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(15).text(defect.label, 38, 121, { width: 400 });
    doc.fillColor(COLORS.slate).font("Helvetica").fontSize(9).text(`${titleCase(defect.defectType)}  ·  ${titleCase(safeText(defect.inspectionDomain, "domain pending"))}`, 38, 146);
    const findingMetrics = [["ZEROERROR SCORE", safeText(defect.zeroErrorScore, "0")], ["CONFIDENCE", `${safeText(defect.confidencePercent, "0")}%`], ["COVERAGE", `${safeText(defect.coveragePercent, "0")}%`], ["REVIEW STATE", titleCase(safeText(defect.reviewState, "pending"))]];
    findingMetrics.forEach(([label, value], index) => { const x = 38 + index * 134; doc.roundedRect(x, 178, 120, 59, 4).fill("#edf0f2"); doc.fillColor(COLORS.slate).font("Helvetica-Bold").fontSize(7).text(label, x + 10, 191, { characterSpacing: 0.5 }); doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(14).text(value, x + 10, 208, { width: 100, ellipsis: true }); });
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(12).text("Location and lifecycle", 38, 276);
    const fields = [["Coordinates", `${safeText(defect.latitude)}  /  ${safeText(defect.longitude)}`], ["Status", titleCase(safeText(defect.status, "detected"))], ["Evidence link", defect.evidenceId ? `Evidence ${defect.evidenceId}` : "Unlinked"], ["Correlation key", safeText(defect.correlationKey)], ["Review requirement", "Engineer verification required before release"]];
    fields.forEach(([label, value], index) => { const y = 306 + index * 24; doc.fillColor(COLORS.slate).font("Helvetica-Bold").fontSize(8).text(label.toUpperCase(), 38, y, { width: 142, characterSpacing: 0.5 }); doc.fillColor(COLORS.ink).font("Helvetica").fontSize(9).text(value, 184, y, { width: 390, ellipsis: true }); });
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(12).text("Explainable assessment", 38, 450);
    fitText(doc, listText(defect.explanation, "No model explanation was recorded."), 38, 477, 536, 55, { fontSize: 9, fillColor: COLORS.slate });
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(12).text("Uncertainty and next action", 38, 565);
    const uncertainty = typeof defect.uncertainty === "object" && defect.uncertainty ? JSON.stringify(defect.uncertainty) : safeText(defect.uncertainty, "Uncertainty not recorded.");
    fitText(doc, `${uncertainty}\nRecommended action: ${defect.severity === "critical" ? "Isolate risk and dispatch an engineer within 4 hours." : defect.severity === "high" ? "Engineer review within 24 hours and plan site verification." : "Retain in the maintenance queue and confirm on the next approved pass."}`, 38, 592, 536, 70, { fontSize: 9, fillColor: COLORS.slate });
    footer(doc);
    page += 1;
  }
  doc.addPage();
  pageHeader(doc, "Release gate", page);
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(23).text("Release gate", 38, 72);
  doc.fillColor(COLORS.slate).font("Helvetica").fontSize(9).text("Recommended controls before a maintenance or public-safety decision is released.", 38, 105);
  const steps = ["Confirm coordinate context and asset identity against the operator mission log.", "Review every critical and high finding with original media and model provenance.", "Resolve failed or review-state evidence gates before creating a work order.", "Perform site verification for uncertain, low-quality, obstructed, or under-structure captures.", "Record engineer decision, priority override, and sign-off in the DRIFT audit trail."];
  steps.forEach((step, index) => { const y = 150 + index * 50; doc.roundedRect(38, y, 536, 34, 4).fill(index < 2 ? "#fff1ed" : "#eef3f4"); doc.circle(58, y + 17, 10).fill(index < 2 ? COLORS.high : COLORS.cyan); doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(8).text(String(index + 1), 54, y + 14, { width: 8, align: "center" }); doc.fillColor(COLORS.ink).font("Helvetica").fontSize(9).text(step, 82, y + 11, { width: 470 }); });
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(13).text("Engineer sign-off", 38, 445);
  doc.roundedRect(38, 474, 536, 122, 4).strokeColor(COLORS.line).stroke();
  doc.fillColor(COLORS.slate).font("Helvetica").fontSize(9).text("Decision", 55, 492);
  const interactiveDoc = doc as unknown as { formCheckbox?: (name: string, x: number, y: number, width: number, height: number, options?: Record<string, unknown>) => void; formText?: (name: string, x: number, y: number, width: number, height: number, options?: Record<string, unknown>) => void };
  ["Approve", "Override", "Site visit required", "Reject"].forEach((label, index) => { const x = 55 + index * 116; interactiveDoc.formCheckbox?.(`decision_${label.replaceAll(" ", "_")}`, x, 512, 11, 11, { size: 11, borderColor: COLORS.slate, fillColor: COLORS.white, textColor: COLORS.ink }); doc.fillColor(COLORS.ink).font("Helvetica").fontSize(8).text(label, x + 16, 514); });
  doc.fillColor(COLORS.slate).font("Helvetica").fontSize(8).text("Reviewer name / role", 55, 546); interactiveDoc.formText?.("reviewer_name_role", 158, 542, 390, 18, { borderColor: COLORS.line, backgroundColor: COLORS.white, fontSize: 9 });
  doc.fillColor(COLORS.slate).font("Helvetica").fontSize(8).text("Signature", 55, 575); interactiveDoc.formText?.("signature", 158, 571, 390, 18, { borderColor: COLORS.line, backgroundColor: COLORS.white, fontSize: 9 });
  doc.fillColor(COLORS.slate).font("Helvetica").fontSize(8).text("Date / time", 55, 604); interactiveDoc.formText?.("date_time", 158, 600, 390, 18, { borderColor: COLORS.line, backgroundColor: COLORS.white, fontSize: 9 });
  doc.fillColor(COLORS.slate).font("Helvetica").fontSize(8).text("Sign-off is intentionally blank. DRIFT does not fabricate approval, review, or customer testimony.", 38, 635, { width: 536 });
  footer(doc);
  doc.end();
  return result;
}
