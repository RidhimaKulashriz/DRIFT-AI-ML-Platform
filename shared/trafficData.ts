/**
 * Traffic density data for map overlay.
 * Combines with infrastructure defects for priority scoring.
 */

export type TrafficDensity = "heavy" | "moderate" | "light" | "free";

export type TrafficSegment = {
  id: string;
  name: string;
  /** Array of [lat, lng] points */
  polyline: number[][];
  density: TrafficDensity;
  /** Vehicles per hour estimate */
  vehiclesPerHour: number;
  /** Speed in km/h */
  averageSpeedKmh: number;
  /** Affected infrastructure types */
  infrastructureTypes: string[];
};

export const trafficSegments: TrafficSegment[] = [
  // Near IGDTUW
  {
    id: "TRF-001",
    name: "GT Karnal Road — IGDTUW",
    polyline: [
      [28.6670, 77.2280],
      [28.6650, 77.2320],
      [28.6630, 77.2360],
      [28.6610, 77.2400],
    ],
    density: "heavy",
    vehiclesPerHour: 4200,
    averageSpeedKmh: 18,
    infrastructureTypes: ["roads", "bridges"],
  },
  {
    id: "TRF-002",
    name: "Ring Road — Civil Lines",
    polyline: [
      [28.6620, 77.2360],
      [28.6600, 77.2400],
      [28.6580, 77.2440],
    ],
    density: "moderate",
    vehiclesPerHour: 2800,
    averageSpeedKmh: 35,
    infrastructureTypes: ["roads"],
  },
  // Near IIIT-Delhi
  {
    id: "TRF-003",
    name: "Outer Ring Road — Okhla",
    polyline: [
      [28.5464, 77.2700],
      [28.5444, 77.2725],
      [28.5424, 77.2780],
      [28.5404, 77.2840],
    ],
    density: "heavy",
    vehiclesPerHour: 5100,
    averageSpeedKmh: 15,
    infrastructureTypes: ["roads", "bridges", "railways"],
  },
  {
    id: "TRF-004",
    name: "Mathura Road — Badarpur",
    polyline: [
      [28.5380, 77.2740],
      [28.5330, 77.2800],
      [28.5280, 77.2860],
    ],
    density: "moderate",
    vehiclesPerHour: 3100,
    averageSpeedKmh: 32,
    infrastructureTypes: ["roads"],
  },
  // Delhi railway corridors
  {
    id: "TRF-005",
    name: "Delhi — Mumbai Rail Corridor",
    polyline: [
      [28.6139, 77.209],
      [28.58, 77.18],
      [28.25, 76.58],
    ],
    density: "heavy",
    vehiclesPerHour: 800,
    averageSpeedKmh: 95,
    infrastructureTypes: ["railways"],
  },
];

export function getTrafficForLocation(
  latitude: number,
  longitude: number,
  radiusDegrees: number = 0.005,
): TrafficSegment | null {
  for (const segment of trafficSegments) {
    for (const [lat, lng] of segment.polyline) {
      const dist = Math.sqrt(
        (latitude - lat) ** 2 + (longitude - lng) ** 2,
      );
      if (dist <= radiusDegrees) return segment;
    }
  }
  return null;
}

export function getTrafficDensityScore(density: TrafficDensity): number {
  switch (density) {
    case "heavy":
      return 30;
    case "moderate":
      return 18;
    case "light":
      return 8;
    case "free":
      return 0;
  }
}
