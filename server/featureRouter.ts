/**
 * New tRPC routes for the DRIFT platform features:
 * - Contractor management
 * - Train monitoring
 * - Traffic integration
 * - Drone connection
 * - Report generation with contractor assignment
 * - Email delivery
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { contractors, findContractorByLocation } from "../shared/contractors";
import { getAllCampusDefects, getDefectsForCampus } from "../shared/campusDemoDefects";
import {
  railwayTracks,
  vibrationSensors,
  getSensorsForTrack,
} from "../shared/trainData";
import { trafficSegments, getTrafficForLocation } from "../shared/trafficData";
import {
  calculateOverallPriority,
  formatRepairCost,
} from "../shared/priorityScoring";
import { lookupContractorForLocation, buildContractorReportPayload } from "./services/geoContractorLookup";
import { sendContractorEmail, buildHtmlEmail } from "./services/emailService";
import { getDroneStatus, updateDroneStatus, validateDroneMediaPayload, getDroneIntegrationGuide } from "./services/droneConnection";
import { enhancePriorityWithTraffic } from "./services/trafficIntegration";

let ticketCounter = 1000;
function nextTicketId(): string {
  ticketCounter++;
  return `DRIFT-${new Date().getFullYear()}-${String(ticketCounter).padStart(4, "0")}`;
}

/** In-memory defect store for demo (replace with DB in production) */
const detectedDefects: Array<{
  id: string;
  ticketId: string;
  defectType: string;
  confidence: number;
  latitude: number;
  longitude: number;
  severity: string;
  priorityScore: number;
  infrastructureType: string;
  estimatedCost: number;
  deadline: string;
  contractorId: number;
  status: string;
  detectedAt: string;
  imageUrl?: string;
  emailSent: boolean;
}> = [];

export const featureRouter = router({
  /** Contractor management */
  contractors: router({
    list: publicProcedure.query(() => contractors),
    lookup: publicProcedure
      .input(
        z.object({
          latitude: z.number(),
          longitude: z.number(),
          infrastructureType: z.string().default("roads"),
        }),
      )
      .query(({ input }) =>
        lookupContractorForLocation(
          input.latitude,
          input.longitude,
          input.infrastructureType,
        ),
      ),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => contractors.find((c) => c.id === input.id) ?? null),
  }),

  /** Train monitoring */
  trains: router({
    tracks: publicProcedure.query(() => railwayTracks),
    sensors: publicProcedure.query(() => vibrationSensors),
    trackSensors: publicProcedure
      .input(z.object({ trackId: z.string() }))
      .query(({ input }) => getSensorsForTrack(input.trackId)),
    getTrackById: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => railwayTracks.find((t) => t.id === input.id) ?? null),
  }),

  /** Traffic integration */
  traffic: router({
    segments: publicProcedure.query(() => trafficSegments),
    nearLocation: publicProcedure
      .input(
        z.object({
          latitude: z.number(),
          longitude: z.number(),
          radius: z.number().default(0.01),
        }),
      )
      .query(({ input }) => getTrafficForLocation(input.latitude, input.longitude)),
  }),

  /** Drone connection */
  drone: router({
    status: publicProcedure.query(() => getDroneStatus()),
    updateStatus: protectedProcedure
      .input(
        z.object({
          connected: z.boolean().optional(),
          batteryPercent: z.number().min(0).max(100).optional(),
          gpsLock: z.boolean().optional(),
          signalStrength: z.number().min(0).max(100).optional(),
          mode: z.string().optional(),
        }),
      )
      .mutation(({ input }) => updateDroneStatus(input)),
    integrationGuide: publicProcedure.query(() => getDroneIntegrationGuide()),
    receiveMedia: protectedProcedure
      .input(
        z.object({
          fileName: z.string(),
          mimeType: z.string(),
          base64: z.string(),
          latitude: z.number(),
          longitude: z.number(),
          altitude: z.number().optional(),
          timestamp: z.number().optional(),
          batteryPercent: z.number().optional(),
          mediaKind: z.enum(["photo", "video"]),
          cameraId: z.string().optional(),
          headingDegrees: z.number().optional(),
        }),
      )
      .mutation(({ input }) => {
        const validation = validateDroneMediaPayload(input);
        if (!validation.valid) throw new Error(validation.message);
        return {
          received: true,
          fileName: input.fileName,
          location: { latitude: input.latitude, longitude: input.longitude },
          nextStep: "ML inference will be triggered on the backend",
        };
      }),
  }),

   /** Priority scoring */
   priority: router({
     calculate: publicProcedure
       .input(
         z.object({
           defectType: z.string(),
           confidence: z.number().min(0).max(1),
           latitude: z.number(),
           longitude: z.number(),
           infrastructureCriticality: z.number().min(1).max(5).default(3),
           trafficEnabled: z.boolean().default(true),
           sensorContribution: z.number().default(0),
         }),
       )
       .query(({ input }) => {
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
             sensorAnomaly: input.sensorContribution,
             infrastructureCriticality: input.infrastructureCriticality,
           },
           input.defectType,
           input.sensorContribution,
         );

        const trafficEnhancement = input.trafficEnabled
          ? enhancePriorityWithTraffic(
            input.latitude,
            input.longitude,
            priority.overallScore,
            input.defectType,
          )
          : null;

        return {
          ...priority,
          repairCostFormatted: formatRepairCost(priority.repairCostEstimateINR),
          trafficEnhancement,
        };
      }),
  }),

   /** Campus-based DEMO defect data with sample images (NOT real inspection detections) */
   campusDemoDefects: router({
     all: publicProcedure.query(() => getAllCampusDefects()),
     byCampus: publicProcedure
       .input(z.object({ campus: z.enum(["IGDTUW", "IIIT-Delhi"]) }))
       .query(({ input }) => getDefectsForCampus(input.campus)),
   }),

   /** Verified campus data — IGDTUW and IIIT-Delhi */
   campus: router({
     list: publicProcedure.query(async () => {
       const { getDb } = await import("./db");
       const db = await getDb();
       if (!db) return [];
       const { campuses } = await import("../drizzle/schema");
       return db.select().from(campuses);
     }),
     locations: publicProcedure
       .input(z.object({ campusId: z.number().int().positive().optional() }))
       .query(async ({ input }) => {
         const { getDb } = await import("./db");
         const db = await getDb();
         if (!db) return [];
         const { campusLocations } = await import("../drizzle/schema");
         const { eq } = await import("drizzle-orm");
         if (input.campusId) return db.select().from(campusLocations).where(eq(campusLocations.campusId, input.campusId));
         return db.select().from(campusLocations);
       }),
   }),

   /** Ticket & report system */
   reports: router({
     /** Generate a defect report and create a ticket — PUBLIC for demo */
     generateAndTicket: publicProcedure
      .input(
        z.object({
          defectType: z.string(),
          confidence: z.number(),
          latitude: z.number(),
          longitude: z.number(),
          infrastructureType: z.string().default("roads"),
          imageUrl: z.string().optional(),
          sensorContribution: z.number().default(0),
        }),
      )
      .mutation(({ input }) => {
        const contractor = lookupContractorForLocation(
          input.latitude,
          input.longitude,
          input.infrastructureType,
        );

        const severityMap: Record<string, number> = {
          pothole: 45, crack: 55, structural: 85, corrosion: 70,
          spalling: 75, exposed_rebar: 88, water_intrusion: 60,
          settlement: 90, rail_alignment: 82, obstruction: 40, lighting_failure: 50,
        };

        const priority = calculateOverallPriority(
          {
            defectSeverity: severityMap[input.defectType] ?? 50,
            mlConfidence: input.confidence,
            trafficImpact: 0,
            sensorAnomaly: input.sensorContribution,
            infrastructureCriticality: 3,
          },
          input.defectType,
          input.sensorContribution,
        );

        const trafficEnhanced = enhancePriorityWithTraffic(
          input.latitude,
          input.longitude,
          priority.overallScore,
          input.infrastructureType,
        );

        const ticketId = nextTicketId();
        const defect = {
          id: `DEF-${Date.now()}`,
          ticketId,
          defectType: input.defectType,
          confidence: input.confidence,
          latitude: input.latitude,
          longitude: input.longitude,
          severity: priority.priorityLevel,
          priorityScore: trafficEnhanced.enhancedPriority,
          infrastructureType: input.infrastructureType,
          estimatedCost: priority.repairCostEstimateINR,
          deadline: priority.recommendedDeadline,
          contractorId: contractor.contractor.id,
          status: "open",
          detectedAt: new Date().toISOString(),
          imageUrl: input.imageUrl,
          emailSent: false,
        };

        detectedDefects.push(defect);

        return {
          defect,
          contractor: {
            id: contractor.contractor.id,
            name: contractor.contractor.name,
            email: contractor.contractor.email,
            organization: contractor.contractor.organization,
            region: contractor.contractor.region,
            matchedBy: contractor.matchedBy,
            confidence: contractor.confidence,
          },
          priority: {
            ...priority,
            trafficEnhanced: trafficEnhanced,
          },
          report: {
            ticketId,
            title: `${input.defectType.replace(/_/g, " ").toUpperCase()} Detection Report`,
            summary: `A ${input.defectType.replace(/_/g, " ")} was detected with ${Math.round(input.confidence * 100)}% ML confidence at coordinates (${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}). The detected defect has been assigned to ${contractor.contractor.name} (${contractor.contractor.organization}) for the ${contractor.contractor.region} area. Estimated repair cost: ${formatRepairCost(priority.repairCostEstimateINR)}. Recommended deadline: ${priority.recommendedDeadline}.`,
          },
        };
      }),

    /** List all detected defects */
    listAll: publicProcedure.query(() => detectedDefects),

    /** Send email to contractor for a defect — PUBLIC for demo */
    sendEmail: publicProcedure
      .input(
        z.object({
          defectId: z.string(),
        }),
      )
      .mutation(async ({ input }) => {
        const defect = detectedDefects.find((d) => d.id === input.defectId);
        if (!defect) throw new Error("Defect not found");

        const contractor = contractors.find((c) => c.id === defect.contractorId);
        if (!contractor) throw new Error("Contractor not found");

        const result = await sendContractorEmail({
          to: contractor.email,
          subject: `[DRIFT] ${defect.ticketId} — ${defect.defectType} — ${defect.severity.toUpperCase()}`,
          ticketId: defect.ticketId,
          contractorName: contractor.name,
          contractorOrganization: contractor.organization,
          defectType: defect.defectType,
          confidencePercent: Math.round(defect.confidence * 100),
          severity: defect.severity,
          latitude: defect.latitude,
          longitude: defect.longitude,
          estimatedRepairCost: formatRepairCost(defect.estimatedCost),
          recommendedDeadline: defect.deadline,
          infrastructureType: defect.infrastructureType,
          priorityScore: defect.priorityScore,
          detectedImageUrl: defect.imageUrl,
          reportSummary: `Defect ${defect.ticketId} detected at (${defect.latitude.toFixed(6)}, ${defect.longitude.toFixed(6)}). Type: ${defect.defectType}. Severity: ${defect.severity}. This requires attention within the recommended deadline.`,
        });

        defect.emailSent = result.sent;

        return {
          emailSent: result.sent,
          method: result.method,
          recipient: result.recipient,
          ticketId: defect.ticketId,
          deliveryConfirmed: result.sent,
          message: result.sent
            ? `Report sent to ${result.recipient} via ${result.method}`
            : `Email not delivered — ${result.method}. Configure DRIFT_EMAIL_WEBHOOK_URL or EMAIL_USER/EMAIL_PASS on the backend to enable delivery.`,
        };
      }),
    }),
});
