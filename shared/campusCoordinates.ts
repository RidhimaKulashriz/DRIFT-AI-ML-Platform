/** Canonical verified campus coordinates used by browser maps and hardware bridges. */
export type CampusCoordinate = { latitude: number; longitude: number; shortName: string };

export const VERIFIED_CAMPUS_COORDINATES = {
  IGDTUW: { latitude: 28.6647, longitude: 77.2325, shortName: "IGDTUW" },
  IIIT_DELHI: { latitude: 28.5444, longitude: 77.2725, shortName: "IIIT-Delhi" },
} as const satisfies Record<string, CampusCoordinate>;

export const CAMPUS_COORDINATES = [
  VERIFIED_CAMPUS_COORDINATES.IGDTUW,
  VERIFIED_CAMPUS_COORDINATES.IIIT_DELHI,
] as const;
