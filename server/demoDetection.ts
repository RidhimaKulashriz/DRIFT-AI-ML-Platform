/**
 * Public demo detection endpoint.
 * Accepts detection data, persists to real PostgreSQL database,
 * auto-assigns contractor by geo-boundary, calculates priority,
 * generates repair estimate, creates ticket — all in one call.
 */

import { findContractorByLocation, getDefaultContractor } from "../shared/contractors";
import { calculateOverallPriority, formatRepairCost } from "../shared/priorityScoring";
import { enhancePriorityWithTraffic } from "./services/trafficIntegration";

export async function runDemoDetection(input: {
  defectType: string;
  confidence: number;
  latitude: number;
  longitude: number;
  infrastructureType: string;
  imageUrl?: string;
  sensorContribution?: number;
}) {
  const { getDb: getDbFn } = await import("./db");
  const db = await getDbFn();
  if (!db) throw new Error("Database not connected. Set DATABASE_URL.");

  // 1. Find contractor by GPS
  const geoMatch = findContractorByLocation(input.latitude, input.longitude);
  const geoContractor = geoMatch ?? getDefaultContractor(input.infrastructureType);

  // 2. Map to DB contractor
  const contractorsTable = (await import("../drizzle/schema")).contractors;
  const { eq } = await import("drizzle-orm");

  const allContractors = await db.select().from(contractorsTable).where(eq(contractorsTable.status, "active"));
  const igdtuwDb = allContractors.find(r => r.externalReference === "igdtuw-manu");
  const iiitdDb = allContractors.find(r => r.externalReference === "iiitd-ridhima");

  let contractorDbId: number;
  let contractorName: string;
  let contractorEmail: string;
  let contractorOrg: string;
  let contractorRegion: string;

  if (geoContractor.region === "IGDTUW Campus" && igdtuwDb) {
    contractorDbId = igdtuwDb.id;
    contractorName = "Manu";
    contractorEmail = "ridhimakulashri07042025@gmail.com";
    contractorOrg = "IGDTUW Infrastructure Maintenance";
    contractorRegion = "IGDTUW Campus";
  } else if (geoContractor.region === "IIIT-Delhi Campus" && iiitdDb) {
    contractorDbId = iiitdDb.id;
    contractorName = "Ridhima Kulashriz";
    contractorEmail = "ridhimakulashriz@gmail.com";
    contractorOrg = "IIIT-Delhi Infrastructure Division";
    contractorRegion = "IIIT-Delhi Campus";
  } else {
    const fallback = allContractors[0];
    contractorDbId = fallback?.id ?? 1;
    contractorName = fallback?.legalName ?? "Unassigned";
    contractorEmail = "";
    contractorOrg = "";
    contractorRegion = "";
  }

  // 3. Calculate priority
  const severityMap: Record<string, number> = {
    pothole: 45, crack: 55, structural: 85, corrosion: 70,
    spalling: 75, exposed_rebar: 88, water_intrusion: 60,
    settlement: 90, rail_alignment: 82, obstruction: 40, lighting_failure: 50,
  };
  const priority = calculateOverallPriority(
    { defectSeverity: severityMap[input.defectType] ?? 50, mlConfidence: input.confidence, trafficImpact: 0, sensorAnomaly: input.sensorContribution ?? 0, infrastructureCriticality: 3 },
    input.defectType,
  );
  const trafficEnhanced = enhancePriorityWithTraffic(input.latitude, input.longitude, priority.overallScore, input.infrastructureType);
  const finalPriority = trafficEnhanced.enhancedPriority;

  // 4. Get existing mission + asset
  const missionsTable = (await import("../drizzle/schema")).missions;
  const latestMission = await db.select().from(missionsTable).limit(1);
  const missionId = latestMission[0]?.id ?? 1;
  const assetId = latestMission[0]?.assetId ?? 1;

  // 5. Seed contractors if DB table is empty
  if (allContractors.length === 0) {
    const { eq } = await import("drizzle-orm");
    await db.insert(contractorsTable).values([
      { legalName: "Manu — IGDTUW Campus", externalReference: "igdtuw-manu", status: "active" },
      { legalName: "Ridhima Kulashriz — IIIT-Delhi", externalReference: "iiitd-ridhima", status: "active" },
    ]);
    // Re-query
    const refreshed = await db.select().from(contractorsTable);
    const ig = refreshed.find(r => r.externalReference === "igdtuw-manu");
    const iiit = refreshed.find(r => r.externalReference === "iiitd-ridhima");
    if (geoContractor.region === "IGDTUW Campus" && ig) {
      contractorDbId = ig.id; contractorName = "Manu"; contractorEmail = "ridhimakulashri07042025@gmail.com"; contractorOrg = "IGDTUW Infrastructure Maintenance"; contractorRegion = "IGDTUW Campus";
    } else if (geoContractor.region === "IIIT-Delhi Campus" && iiit) {
      contractorDbId = iiit.id; contractorName = "Ridhima Kulashriz"; contractorEmail = "ridhimakulashriz@gmail.com"; contractorOrg = "IIIT-Delhi Infrastructure Division"; contractorRegion = "IIIT-Delhi Campus";
    }
  }

  // 5. Create defect
  const { defects, repairEstimates, severityHistory, contractorTickets, alerts, auditEvents } = await import("../drizzle/schema");

  const [defectRow] = await db.insert(defects).values({
    missionId,
    assetId,
    defectType: input.defectType as any,
    label: input.defectType.replace(/_/g, " "),
    confidencePercent: Math.round(input.confidence * 100),
    zeroErrorScore: finalPriority,
    severity: priority.priorityLevel as any,
    status: "detected",
    reviewState: "pending",
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    inspectionDomain: input.infrastructureType,
    correlationKey: "demo:" + Date.now(),
    coveragePercent: 85,
  }).returning({ id: defects.id });
  const defectId = defectRow.id;

  // 6. Create repair estimate
  await db.insert(repairEstimates).values({
    defectId,
    estimateCents: priority.repairCostEstimateINR,
    currency: "INR",
    assumptions: { method: "rule-based", defectType: input.defectType, priority: priority.priorityLevel },
    status: "draft",
  });

  // 7. Create severity history
  await db.insert(severityHistory).values({
    defectId,
    nextSeverity: priority.priorityLevel as any,
    score: finalPriority,
    reason: priority.recommendedDeadline,
  });

  // 8. Create ticket
  const [ticketRow] = await db.insert(contractorTickets).values({
    assetId,
    defectId,
    contractorId: contractorDbId,
    title: `${input.defectType.replace(/_/g, " ").toUpperCase()} — ${contractorRegion}`,
    scopeNote: `Auto-generated ticket for ${input.defectType} at (${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}). Assigned to ${contractorName}.`,
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    priority: "p2",
    status: "open",
    verificationCriterion: "Engineer must verify repair completion with follow-up evidence.",
    createdBy: 1,
  }).returning({ id: contractorTickets.id });
  const ticketId = ticketRow.id;

  // 9. Create alert if high severity
  if (priority.priorityLevel === "critical" || priority.priorityLevel === "high") {
    await db.insert(alerts).values({
      missionId,
      defectId,
      severity: priority.priorityLevel as any,
      title: `${priority.priorityLevel.toUpperCase()} — ${input.defectType.replace(/_/g, " ")}`,
      message: priority.recommendedDeadline,
      status: "open",
    });
  }

  // 10. Create audit event
  await db.insert(auditEvents).values({
    missionId,
    defectId,
    action: "demo.detection_created",
    details: { defectType: input.defectType, confidence: input.confidence, latitude: input.latitude, longitude: input.longitude, contractorId: contractorDbId, contractorName, priorityScore: finalPriority, priorityLevel: priority.priorityLevel },
  });

  return {
    success: true,
    detection: { id: defectId, defectType: input.defectType, confidence: input.confidence, confidencePercent: Math.round(input.confidence * 100), latitude: input.latitude, longitude: input.longitude, severity: priority.priorityLevel, priorityScore: finalPriority, status: "detected" },
    contractor: { id: contractorDbId, name: contractorName, email: contractorEmail, organization: contractorOrg, region: contractorRegion, matchedBy: geoMatch ? "geo-boundary" : "default-fallback" },
    priority: { overallScore: finalPriority, priorityLevel: priority.priorityLevel, repairCostINR: priority.repairCostEstimateINR, repairCostFormatted: formatRepairCost(priority.repairCostEstimateINR), recommendedDeadline: priority.recommendedDeadline, breakdown: priority.breakdown },
    report: { ticketId: `DRIFT-${ticketId}`, title: `${input.defectType.replace(/_/g, " ").toUpperCase()} Report`, summary: `${input.defectType.replace(/_/g, " ")} detected with ${Math.round(input.confidence * 100)}% confidence at (${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}). Assigned to ${contractorName}. Priority: ${priority.priorityLevel}. Cost: ${formatRepairCost(priority.repairCostEstimateINR)}. Deadline: ${priority.recommendedDeadline}.` },
    ticket: { id: ticketId, ticketDisplayId: `DRIFT-${ticketId}`, status: "open", defectId, contractorId: contractorDbId, contractorName },
    message: `Detection ${defectId} created. Ticket DRIFT-${ticketId} assigned to ${contractorName}. Priority: ${priority.priorityLevel}. Cost: ${formatRepairCost(priority.repairCostEstimateINR)}.`,
  };
}
