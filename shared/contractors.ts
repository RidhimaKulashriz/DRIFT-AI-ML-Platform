/**
 * Contractor database with geo-boundary mapping.
 * Each contractor is assigned a geographic region. When a defect is detected,
 * the system looks up which contractor covers that location.
 *
 * Replace dummy entries with real contractor dataset later.
 */

export type Contractor = {
  id: number;
  name: string;
  email: string;
  phone: string;
  organization: string;
  specialization: string[];
  /** Geo-boundary: array of [lat, lng] forming a polygon around the region */
  geoBoundary: number[][];
  /** Approximate center of the region for quick lookup */
  centerLat: number;
  centerLng: number;
  /** Radius in degrees for simple point-in-circle check */
  radiusDegrees: number;
  region: string;
  rating: number;
};

export const contractors: Contractor[] = [
  {
    id: 1,
    name: "Manu",
    email: "ridhimakulashri07042025@gmail.com",
    phone: "+91-XXXX-XXXX-01",
    organization: "IGDTUW Infrastructure Maintenance",
    specialization: ["roads", "bridges", "buildings", "drainage"],
    geoBoundary: [
      [28.6667, 77.2305],
      [28.6667, 77.2345],
      [28.6627, 77.2345],
      [28.6627, 77.2305],
    ],
    centerLat: 28.6647,
    centerLng: 77.2325,
    radiusDegrees: 0.005,
    region: "IGDTUW Campus",
    rating: 4.5,
  },
  {
    id: 2,
    name: "Ridhima Kulashriz",
    email: "ridhimakulashriz@gmail.com",
    phone: "+91-XXXX-XXXX-02",
    organization: "IIIT-Delhi Infrastructure Division",
    specialization: ["roads", "bridges", "railways", "buildings"],
    geoBoundary: [
      [28.5464, 77.2705],
      [28.5464, 77.2745],
      [28.5424, 77.2745],
      [28.5424, 77.2705],
    ],
    centerLat: 28.5444,
    centerLng: 77.2725,
    radiusDegrees: 0.005,
    region: "IIIT-Delhi Campus",
    rating: 4.8,
  },
];

/**
 * Find the contractor responsible for a given GPS location.
 * Uses simple distance-based lookup against contractor geo-boundaries.
 */
export function findContractorByLocation(
  latitude: number,
  longitude: number,
): Contractor | null {
  let bestMatch: Contractor | null = null;
  let bestDistance = Infinity;

  for (const contractor of contractors) {
    const distance = Math.sqrt(
      (latitude - contractor.centerLat) ** 2 +
        (longitude - contractor.centerLng) ** 2,
    );
    if (distance <= contractor.radiusDegrees && distance < bestDistance) {
      bestDistance = distance;
      bestMatch = contractor;
    }
  }

  return bestMatch;
}

/**
 * Get the default contractor for an infrastructure type.
 * Fallback when no geo-match is found.
 */
export function getDefaultContractor(
  infrastructureType: string,
): Contractor {
  const match = contractors.find((c) =>
    c.specialization.includes(infrastructureType),
  );
  return match ?? contractors[0]!;
}
