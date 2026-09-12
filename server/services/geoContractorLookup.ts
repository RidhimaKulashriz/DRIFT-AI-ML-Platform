/**
 * Server-side contractor geo-lookup service.
 * Maps GPS coordinates to responsible contractor using geo-boundary matching.
 */

import { findContractorByLocation, getDefaultContractor, type Contractor } from "../../shared/contractors";

export type GeoLookupResult = {
  contractor: Contractor;
  matchedBy: "geo-boundary" | "default-fallback";
  confidence: number;
};

/**
 * Find the responsible contractor for a GPS location.
 */
export function lookupContractorForLocation(
  latitude: number,
  longitude: number,
  infrastructureType: string = "roads",
): GeoLookupResult {
  const geoMatch = findContractorByLocation(latitude, longitude);

  if (geoMatch) {
    return {
      contractor: geoMatch,
      matchedBy: "geo-boundary",
      confidence: 0.95,
    };
  }

  // Fallback to infrastructure-type default
  const defaultContractor = getDefaultContractor(infrastructureType);
  return {
    contractor: defaultContractor,
    matchedBy: "default-fallback",
    confidence: 0.6,
  };
}

/**
 * Generate a contractor report payload for email delivery.
 */
export function buildContractorReportPayload(params: {
  ticketId: string;
  defectType: string;
  confidencePercent: number;
  severity: string;
  latitude: number;
  longitude: number;
  estimatedRepairCost: string;
  recommendedDeadline: string;
  infrastructureType: string;
  detectedImage?: string;
  priorityScore: number;
  contractor?: Contractor;
}) {
  const contractor =
    params.contractor ??
    lookupContractorForLocation(
      params.latitude,
      params.longitude,
      params.infrastructureType,
    ).contractor;

  return {
    ticketId: params.ticketId,
    contractorName: contractor.name,
    contractorEmail: contractor.email,
    contractorOrganization: contractor.organization,
    contractorRegion: contractor.region,
    defectType: params.defectType,
    confidencePercent: params.confidencePercent,
    severity: params.severity,
    latitude: params.latitude,
    longitude: params.longitude,
    estimatedRepairCost: params.estimatedRepairCost,
    recommendedDeadline: params.recommendedDeadline,
    infrastructureType: params.infrastructureType,
    priorityScore: params.priorityScore,
    detectedImage: params.detectedImage,
    generatedAt: new Date().toISOString(),
  };
}
