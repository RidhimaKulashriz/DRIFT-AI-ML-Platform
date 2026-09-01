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
  const contractor = geoMatch ?? getDefaultContractor(input.infrastructureType);

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

  // Step 3: Ensure a demo mission exists (create if needed)
  let missionId: number;
  const existingMissions = await db.execute<{ id: number }>(
    sql`SELECT id FROM missions WHERE name = 'Demo inspection scan' LIMIT 1`
  );

  if (existingMissions.rows.length > 0) {
    missionId = Number(existingMissions.rows[0].id);
  } else {
    // Create asset first
    const assetResult = await db.execute<{ id: number }>(
      sql`INSERT INTO assets (name, assetType, locality, latitude, longitude, criticality, status, createdat, updatedat)
          VALUES ('Campus Infrastructure', 'road', 'IGDTUW + IIIT-Delhi', '28.6163', '77.2425', 3, 'operational', NOW(), NOW())
          RETURNING id`
    );
    const assetId = Number(assetResult.rows[0].id);

    const missionResult = await db.execute<{ id: number }>(
      sql`INSERT INTO missions (assetId, name, mode, status, startedat, createdat, updatedat)
          VALUES (${assetId}, 'Demo inspection scan', 'demo', 'completed', NOW(), NOW(), NOW())
          RETURNING id`
    );
    missionId = Number(missionResult.rows[0].id);
  }

  // Get the assetId from the mission
  const missionAsset = await db.execute<{ assetid: number }>(
    sql`SELECT assetId as assetid FROM missions WHERE id = ${missionId} LIMIT 1`
  );
  const assetId = Number(missionAsset.rows[0]?.assetid ?? 1);

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
    sql`INSERT INTO defects (missionId, assetId, evidenceId, defectType, label, confidencePercent, zeroErrorScore, severity, status, reviewState, latitude, longitude, inspectionDomain, correlationKey, coveragePercent, createdat, updatedat)
        VALUES (${missionId}, ${assetId}, ${evidenceId}, ${input.defectType}::defect_type, ${input.defectType.replace(/_/g, ' ')}, ${Math.round(input.confidence * 100)}, ${finalPriority}, ${priority.priorityLevel}::severity, 'detected', 'pending', ${String(input.latitude)}, ${String(input.longitude)}, ${input.infrastructureType}, ${'demo:' + Date.now()}, 85, NOW(), NOW())
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
        VALUES (${defectId}, ${priority.priorityLevel}::severity, ${finalPriority}, ${priority.recommendedDeadline}, NOW())`
  );

  // Step 8: Create ticket
  const ticketResult = await db.execute<{ id: number }>(
    sql`INSERT INTO contractorTickets (assetId, defectId, contractorId, title, scopeNote, latitude, longitude, priority, status, verificationcriterion, createdat, updatedat)
        VALUES (${assetId}, ${defectId}, ${contractor.id}, ${`${input.defectType.replace(/_/g, ' ').toUpperCase()} — ${contractor.region}`}, ${`Auto-generated ticket for ${input.defectType} detected at (${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}). Assigned to ${contractor.name} (${contractor.organization}).`}, ${String(input.latitude)}, ${String(input.longitude)}, 'p2', 'open', 'Engineer must verify repair completion with follow-up evidence.', NOW(), NOW())
        RETURNING id`
  );
  const ticketId = Number(ticketResult.rows[0].id);

  // Step 9: Create alert if high severity
  if (priority.priorityLevel === "critical" || priority.priorityLevel === "high") {
    await db.execute(
      sql`INSERT INTO alerts (missionId, defectId, severity, title, message, status, createdat)
          VALUES (${missionId}, ${defectId}, ${priority.priorityLevel}::severity, ${`${priority.priorityLevel.toUpperCase()} — ${input.defectType.replace(/_/g, ' ')}`}, ${priority.recommendedDeadline}, 'open', NOW())`
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
      contractorId: contractor.id,
      contractorName: contractor.name,
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
      id: contractor.id,
      name: contractor.name,
      email: contractor.email,
      organization: contractor.organization,
      region: contractor.region,
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
      summary: `A ${input.defectType.replace(/_/g, ' ')} was detected with ${Math.round(input.confidence * 100)}% confidence at (${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}). Assigned to ${contractor.name} (${contractor.organization}) for ${contractor.region}. Priority: ${priority.priorityLevel} (${finalPriority}/100). Estimated cost: ${formatRepairCost(priority.repairCostEstimateINR)}. Deadline: ${priority.recommendedDeadline}.`,
    },
    ticket: {
      id: ticketId,
      ticketDisplayId: `DRIFT-${ticketId}`,
      status: "open",
      defectId,
      contractorId: contractor.id,
      contractorName: contractor.name,
    },
    message: `Detection ${defectId} created. Ticket DRIFT-${ticketId} assigned to ${contractor.name}. Priority: ${priority.priorityLevel}. Cost: ${formatRepairCost(priority.repairCostEstimateINR)}.`,
  };
}

async function getDb() {
  const { getDb: getDbFn } = await import("./db");
  return getDbFn();
}
