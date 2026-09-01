/**
 * Traffic integration service.
 * Combines traffic density data with infrastructure defect priority scoring.
 */

import {
  trafficSegments,
  getTrafficForLocation,
  getTrafficDensityScore,
  type TrafficSegment,
  type TrafficDensity,
} from "../../shared/trafficData";

export type TrafficEnhancedPriority = {
  basePriority: number;
  trafficDensity: TrafficDensity;
  trafficImpactScore: number;
  enhancedPriority: number;
  recommendation: string;
};

/**
 * Enhance a defect's priority with traffic density data.
 */
export function enhancePriorityWithTraffic(
  latitude: number,
  longitude: number,
  basePriorityScore: number,
  infrastructureType: string = "roads",
): TrafficEnhancedPriority {
  const traffic = getTrafficForLocation(latitude, longitude);
  const trafficScore = traffic ? getTrafficDensityScore(traffic.density) : 0;

  const enhancedPriority = Math.min(100, basePriorityScore + trafficScore);

  let recommendation: string;
  if (traffic && traffic.density === "heavy" && basePriorityScore >= 60) {
    recommendation = `URGENT: High traffic (${traffic.vehiclesPerHour} veh/hr) + serious defect. Immediate dispatch recommended.`;
  } else if (traffic && traffic.density === "heavy" && basePriorityScore >= 40) {
    recommendation = `High priority: Heavy traffic area with moderate defect. Schedule repair within 24 hours.`;
  } else if (traffic && traffic.density === "moderate" && basePriorityScore >= 60) {
    recommendation = `Elevated priority: Moderate traffic with critical defect. Engineer review within 12 hours.`;
  } else if (trafficScore > 0) {
    recommendation = `Traffic-aware priority applied. Area has ${traffic!.density} traffic density.`;
  } else {
    recommendation = `No significant traffic impact at this location. Priority based on defect severity.`;
  }

  return {
    basePriority: basePriorityScore,
    trafficDensity: traffic?.density ?? "free",
    trafficImpactScore: trafficScore,
    enhancedPriority,
    recommendation,
  };
}

/**
 * Get all traffic segments near a given location.
 */
export function getNearbyTraffic(
  latitude: number,
  longitude: number,
  radiusDegrees: number = 0.01,
): TrafficSegment[] {
  return trafficSegments.filter((segment) => {
    for (const [lat, lng] of segment.polyline) {
      const dist = Math.sqrt(
        (latitude - lat) ** 2 + (longitude - lng) ** 2,
      );
      if (dist <= radiusDegrees) return true;
    }
    return false;
  });
}
