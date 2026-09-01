/**
 * Public demo detection endpoint.
 * Accepts detection data, persists to real PostgreSQL database,
 * auto-assigns contractor by geo-boundary, calculates priority,
 * generates repair estimate, creates ticket — all in one call.
 *
 * No authentication required for demo mode.
 */

import { z } from "zod";
import { sql } from "drizzle-orm";
import { findContractorByLocation, getDefaultContractor } from "../shared/contractors";
import { calculateOverallPriority, formatRepairCost } from "../shared/priorityScoring";
import { enhancePriorityWithTraffic } from "./services/trafficIntegration";

type Severity = "low" | "medium" | "high" | "critical";

/**
 * Run the complete detection pipeline on the real database.
 * Returns the full detection object with contractor, priority, report, and ticket.
 */
export async function runDemoDetection(input: {
  defectType: string;
  confidence: number;
  latitude: number;
  longitude: number;
  infrastructureType: string;
  imageUrl?: string;
  sensorContribution?: number;
}): Promise<{
  success: boolean;
  detection: Record<string, unknown>;
  contractor: Record<string, unknown>;
  priority: Record<string, unknown>;
  report: Record<string, unknown>;
  ticket: Record<string, unknown>;
  message: string;
}> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not connected. Set DATABASE_URL in environment.");
  }

  // Step 1: Find contractor by GPS
  const geoMatch = findContractorByLocation(input.latitude, input.longitude, input.infrastructureType);
  const geoContractor = geoMatch ?? getDefaultContractor(input.infrastructureType);

  // Map to DB contractor by external reference
  const dbContractors = await db.execute<{ id: number; legalName: string; externalReference: string }>(
    sql`SELECT id, "legalName", "externalReference" FROM contractors WHERE status = 'active' LIMIT 10`
  );
  let contractorDbId: number;
  let contractorName: string;
  let contractorEmail: string;
  let contractorOrg: string;
  let contractorRegion: string;
  let matchedBy: string;

  // Find matching DB contractor by region/name
  const igdtuwDb = dbContractors.rows.find(r => r.externalReference === 'igdtuw-manu');
  const iiitdDb = dbContractors.rows.find(r => r.externalReference === 'iiitd-ridhima');

  if (geoContractor.region === 'IGDTUW Campus' && igdtuwDb) {
    contractorDbId = igdtuwDb.id;
    contractorName = 'Manu';
    contractorEmail = 'ridhimakulashri07042025@gmail.com';
    contractorOrg = 'IGDTUW Infrastructure Maintenance';
    contractorRegion = 'IGDTUW Campus';
    matchedBy = 'geo-boundary';
  } else if (geoContractor.region === 'IIIT-Delhi Campus' && iiitdDb) {
    contractorDbId = iiitdDb.id;
    contractorName = 'Ridhima Kulashriz';
    contractorEmail = 'ridhimakulashriz@gmail.com';
    contractorOrg = 'IIIT-Delhi Infrastructure Division';
    contractorRegion = 'IIIT-Delhi Campus';
    matchedBy = 'geo-boundary';
  } else {
    // Fallback to first DB contractor
    const fallback = dbContractors.rows[0];
    contractorDbId = fallback?.id ?? 1;
    contractorName = fallback?.legalname ?? 'Unassigned';
    contractorEmail = '';
    contractorOrg = '';
    contractorRegion = '';
    matchedBy = 'default-fallback';
  }

  // Step 2: Calculate priority
  const severityMap: Record<string, number> = {
    pothole: 45, crack: 55, structural: 85, corrosion: 70,
    spalling: 75, exposed_rebar: 88, water_intrusion: 60,
    settlement: 90, rail_alignment: 82, obstruction: 40, lighting_failure: 50,
  };
  const baseSeverity = severityMap[input.defectType] ?? 50;

  const priority = calculateOverallPriority(
    {
      defectSeverity: baseSeverity,
      mlConfidence: input.confidence,
      trafficImpact: 0,
      sensorAnomaly: input.sensorContribution ?? 0,
      infrastructureCriticality: 3,
    },
    input.defectType,
    input.sensorContribution ?? 0,
  );

  const trafficEnhanced = enhancePriorityWithTraffic(
    input.latitude,
    input.longitude,
    priority.overallScore,
    input.infrastructureType,
  );

  const finalPriority = trafficEnhanced.enhancedPriority;

  // Step 3: Get or create mission and asset
  let missionId: number;
  let assetId: number;

  // Try to find existing mission first
  const existingMissions = await db.execute<{ id: number; assetId: number }>(
    sql`SELECT id, "assetId" FROM missions ORDER BY id DESC LIMIT 1`
  );

  if (existingMissions.rows.length > 0) {
    missionId = Number(existingMissions.rows[0].id);
    assetId = Number(existingMissions.rows[0].assetId);
  } else {
    // Create asset first (use raw SQL without enum cast)
    const assetResult = await db.execute<{ id: number }>(
      sql`INSERT INTO assets (name, assetType, locality, latitude, longitude, criticality, status, createdat, updatedat)
          VALUES ('Campus Infrastructure', 'road', 'IGDTUW + IIIT-Delhi', '28.6163', '77.2425', 3, 'operational', NOW(), NOW())
          RETURNING id`
    );
    assetId = Number(assetResult.rows[0].id);

    const missionResult = await db.execute<{ id: number }>(
      sql`INSERT INTO missions (assetId, name, mode, status, startedat, createdat, updatedat)
          VALUES (${assetId}, 'Demo inspection scan', 'demo', 'completed', NOW(), NOW(), NOW())
          RETURNING id`
    );
    missionId = Number(missionResult.rows[0].id);
  }

  // Step 4: Create evidence record if image provided
  let evidenceId: number | null = null;
  if (input.imageUrl) {
    const evResult = await db.execute<{ id: number }>(
      sql`INSERT INTO evidence (missionId, fileName, mimeType, storageKey, storageUrl, mediaKind, latitude, longitude, source, qualitystatus, capturezone, createdat, provenance)
          VALUES (${missionId}, ${input.defectType + '-' + Date.now() + '.jpg'}, 'image/jpeg', ${'drift/demo/' + input.defectType + '-' + Date.now()}, ${input.imageUrl}, 'photo', ${String(input.latitude)}, ${String(input.longitude)}, 'simulator', 'review', 'oblique', NOW(), ${JSON.stringify({ kind: 'demo-detection', infrastructureType: input.infrastructureType })}::jsonb)
          RETURNING id`
    );
    evidenceId = Number(evResult.rows[0].id);
  }

  // Step 5: Create defect record
  const defectResult = await db.execute<{ id: number }>(
    sql`INSERT INTO defects ("missionId", "assetId", "defectType", "label", "confidencePercent", "zeroErrorScore", severity, status, "reviewState", latitude, longitude, "inspectionDomain", "correlationKey", "coveragePercent", createdat, updatedat)
        VALUES (${missionId}, ${assetId}, ${input.defectType}, ${input.defectType.replace(/_/g, ' ')}, ${Math.round(input.confidence * 100)}, ${finalPriority}, ${priority.priorityLevel}, 'detected', 'pending', ${String(input.latitude)}, ${String(input.longitude)}, ${input.infrastructureType}, ${'demo:' + Date.now()}, 85, NOW(), NOW())
        RETURNING id`
  );
  const defectId = Number(defectResult.rows[0].id);

  // Step 6: Create repair estimate
  await db.execute(
    sql`INSERT INTO repairEstimates (defectId, estimateCents, currency, assumptions, status, createdat, updatedat)
        VALUES (${defectId}, ${priority.repairCostEstimateINR}, 'INR', ${JSON.stringify({ method: 'rule-based', defectType: input.defectType, priority: priority.priorityLevel })}::jsonb, 'draft', NOW(), NOW())`
  );

  // Step 7: Create severity history
  await db.execute(
    sql`INSERT INTO severityHistory (defectId, nextSeverity, score, reason, createdat)
        VALUES (${defectId}, ${priority.priorityLevel}, ${finalPriority}, ${priority.recommendedDeadline}, NOW())`
  );

  // Step 8: Create ticket
  const ticketResult = await db.execute<{ id: number }>(
    sql`INSERT INTO contractorTickets (assetId, defectId, contractorId, title, scopeNote, latitude, longitude, priority, status, verificationcriterion, createdat, updatedat)
        VALUES (${assetId}, ${defectId}, ${contractorDbId}, ${`${input.defectType.replace(/_/g, ' ').toUpperCase()} — ${contractorRegion}`}, ${`Auto-generated ticket for ${input.defectType} detected at (${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}). Assigned to ${contractorName} (${contractorOrg}).`}, ${String(input.latitude)}, ${String(input.longitude)}, 'p2', 'open', 'Engineer must verify repair completion with follow-up evidence.', NOW(), NOW())
        RETURNING id`
  );
  const ticketId = Number(ticketResult.rows[0].id);

  // Step 9: Create alert if high severity
  if (priority.priorityLevel === "critical" || priority.priorityLevel === "high") {
    await db.execute(
      sql`INSERT INTO alerts (missionId, defectId, severity, title, message, status, createdat)
          VALUES (${missionId}, ${defectId}, ${priority.priorityLevel}, ${`${priority.priorityLevel.toUpperCase()} — ${input.defectType.replace(/_/g, ' ')}`}, ${priority.recommendedDeadline}, 'open', NOW())`
    );
  }

  // Step 10: Create audit event
  await db.execute(
    sql`INSERT INTO auditEvents (missionId, defectId, action, details, createdat)
        VALUES (${missionId}, ${defectId}, 'demo.detection_created', ${JSON.stringify({
      defectType: input.defectType,
      confidence: input.confidence,
      latitude: input.latitude,
      longitude: input.longitude,
      infrastructureType: input.infrastructureType,
      contractorId: contractorDbId,
      contractorName: contractorName,
      priorityScore: finalPriority,
      priorityLevel: priority.priorityLevel,
    })}::jsonb, NOW())`
  );

  return {
    success: true,
    detection: {
      id: defectId,
      defectType: input.defectType,
      confidence: input.confidence,
      confidencePercent: Math.round(input.confidence * 100),
      latitude: input.latitude,
      longitude: input.longitude,
      infrastructureType: input.infrastructureType,
      severity: priority.priorityLevel,
      priorityScore: finalPriority,
      status: "detected",
      evidenceId,
      imageUrl: input.imageUrl,
    },
    contractor: {
      id: contractorDbId,
      name: contractorName,
      email: contractorEmail,
      organization: contractorOrg,
      region: contractorRegion,
      matchedBy: geoMatch ? "geo-boundary" : "default-fallback",
    },
    priority: {
      overallScore: finalPriority,
      priorityLevel: priority.priorityLevel,
      repairCostINR: priority.repairCostEstimateINR,
      repairCostFormatted: formatRepairCost(priority.repairCostEstimateINR),
      recommendedDeadline: priority.recommendedDeadline,
      breakdown: priority.breakdown,
      trafficEnhanced: trafficEnhanced,
    },
    report: {
      ticketId: `DRIFT-${ticketId}`,
      title: `${input.defectType.replace(/_/g, ' ').toUpperCase()} Detection Report`,
      summary: `A ${input.defectType.replace(/_/g, ' ')} was detected with ${Math.round(input.confidence * 100)}% confidence at (${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}). Assigned to ${contractorName} (${contractorOrg}) for ${contractorRegion}. Priority: ${priority.priorityLevel} (${finalPriority}/100). Estimated cost: ${formatRepairCost(priority.repairCostEstimateINR)}. Deadline: ${priority.recommendedDeadline}.`,
    },
    ticket: {
      id: ticketId,
      ticketDisplayId: `DRIFT-${ticketId}`,
      status: "open",
      defectId,
      contractorId: contractorDbId,
      contractorName: contractorName,
    },
    message: `Detection ${defectId} created. Ticket DRIFT-${ticketId} assigned to ${contractorName}. Priority: ${priority.priorityLevel}. Cost: ${formatRepairCost(priority.repairCostEstimateINR)}.`,
  };
}

async function getDb() {
  const { getDb: getDbFn } = await import("./db");
  return getDbFn();
}
