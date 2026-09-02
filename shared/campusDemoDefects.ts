/**
 * DEMO/SEED reference data for IGDTUW and IIIT-Delhi campuses.
 *
 * IMPORTANT: These are NOT real-world inspection detections.
 * They are demonstration records used to populate the UI when no
 * real inspections exist. Coordinates are approximate campus locations
 * (verified against public sources) but defect placement is illustrative.
 *
 * For real detections, see actual inspection / evidence / detection records
 * returned by the backend.
 *
 * IGDTUW campus center: 28.6876, 77.2100
 * IIIT-Delhi campus center: 28.5449, 77.2750
 */

export type CampusDemoDefect = {
  id: number;
  label: string;
  defectType: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  latitude: string;
  longitude: string;
  campus: "IGDTUW" | "IIIT-Delhi";
  infrastructureType: string;
  imageUrl: string;
  description: string;
  estimatedRepairCostINR: number;
  recommendedDeadline: string;
  contractor: string;
  contractorEmail: string;
};

// Real roads around IGDTUW campus (near 28.6876, 77.2100)
// Real roads around IIIT-Delhi campus (near 28.5449, 77.2750)

export const campusDemoDefects: CampusDemoDefect[] = [
  // ── IGDTUW Campus Defects ──
  {
    id: 101,
    label: "Pothole on main campus road",
    defectType: "pothole",
    severity: "medium",
    confidence: 88,
    latitude: "28.6882",
    longitude: "77.2098",
    campus: "IGDTUW",
    infrastructureType: "roads",
    imageUrl: "https://raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset/master/PreviewImages/1097248_DF_070_070BDF0010_04158_RAW.jpg",
    description: "Pothole detected on the main entry road to IGDTUW campus, near the main gate.",
    estimatedRepairCostINR: 15000,
    recommendedDeadline: "Within 14 days",
    contractor: "Manu",
    contractorEmail: "ridhimakulashri07042025@gmail.com",
  },
  {
    id: 102,
    label: "Crack in campus building facade",
    defectType: "crack",
    severity: "high",
    confidence: 92,
    latitude: "28.6871",
    longitude: "77.2104",
    campus: "IGDTUW",
    infrastructureType: "buildings",
    imageUrl: "https://raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset/master/PreviewImages/1097248_DF_070_070BDF0010_04158_RAW.jpg",
    description: "Structural crack detected in the main building facade at IGDTUW campus.",
    estimatedRepairCostINR: 45000,
    recommendedDeadline: "Within 7 days",
    contractor: "Manu",
    contractorEmail: "ridhimakulashri07042025@gmail.com",
  },
  {
    id: 103,
    label: "Spalling concrete on parking area",
    defectType: "spalling",
    severity: "medium",
    confidence: 85,
    latitude: "28.6879",
    longitude: "77.2095",
    campus: "IGDTUW",
    infrastructureType: "buildings",
    imageUrl: "https://raw.githubusercontent.com/berttarosio/StructuralDefects/master/Examples/spalling_01.jpg",
    description: "Concrete spalling detected on the IGDTUW campus parking area.",
    estimatedRepairCostINR: 25000,
    recommendedDeadline: "Within 30 days",
    contractor: "Manu",
    contractorEmail: "ridhimakulashri07042025@gmail.com",
  },
  {
    id: 104,
    label: "Water intrusion near drainage",
    defectType: "water_intrusion",
    severity: "low",
    confidence: 78,
    latitude: "28.6865",
    longitude: "77.2108",
    campus: "IGDTUW",
    infrastructureType: "drainage",
    imageUrl: "https://raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset/master/PreviewImages/1097248_DF_070_070BDF0010_04158_RAW.jpg",
    description: "Water seepage detected near drainage area at IGDTUW campus.",
    estimatedRepairCostINR: 8000,
    recommendedDeadline: "Within 60 days",
    contractor: "Manu",
    contractorEmail: "ridhimakulashri07042025@gmail.com",
  },

  // ── IIIT-Delhi Campus Defects ──
  {
    id: 105,
    label: "Pothole on IIIT-Delhi main road",
    defectType: "pothole",
    severity: "medium",
    confidence: 90,
    latitude: "28.5442",
    longitude: "77.2745",
    campus: "IIIT-Delhi",
    infrastructureType: "roads",
    imageUrl: "https://raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset/master/PreviewImages/1097248_DF_070_070BDF0010_04158_RAW.jpg",
    description: "Pothole detected on the main access road to IIIT-Delhi campus.",
    estimatedRepairCostINR: 18000,
    recommendedDeadline: "Within 14 days",
    contractor: "Ridhima Kulashriz",
    contractorEmail: "ridhimakulashriz@gmail.com",
  },
  {
    id: 106,
    label: "Bridge crack near Academic Block",
    defectType: "structural",
    severity: "critical",
    confidence: 95,
    latitude: "28.5453",
    longitude: "77.2757",
    campus: "IIIT-Delhi",
    infrastructureType: "bridges",
    imageUrl: "https://raw.githubusercontent.com/berttarosio/StructuralDefects/master/Examples/cracks_01.jpg",
    description: "Critical structural crack detected in the bridge connecting the academic block at IIIT-Delhi.",
    estimatedRepairCostINR: 125000,
    recommendedDeadline: "Within 24 hours",
    contractor: "Ridhima Kulashriz",
    contractorEmail: "ridhimakulashriz@gmail.com",
  },
  {
    id: 107,
    label: "Road settlement near library",
    defectType: "settlement",
    severity: "high",
    confidence: 87,
    latitude: "28.5440",
    longitude: "77.2760",
    campus: "IIIT-Delhi",
    infrastructureType: "roads",
    imageUrl: "https://raw.githubusercontent.com/biankatpas/Cracks-and-Potholes-in-Road-Images-Dataset/master/PreviewImages/1097248_DF_070_070BDF0010_04158_RAW.jpg",
    description: "Ground settlement detected on the road near the IIIT-Delhi library.",
    estimatedRepairCostINR: 55000,
    recommendedDeadline: "Within 7 days",
    contractor: "Ridhima Kulashriz",
    contractorEmail: "ridhimakulashriz@gmail.com",
  },
  {
    id: 108,
    label: "Exposed rebar on campus walkway",
    defectType: "exposed_rebar",
    severity: "critical",
    confidence: 91,
    latitude: "28.5438",
    longitude: "77.2742",
    campus: "IIIT-Delhi",
    infrastructureType: "bridges",
    imageUrl: "https://raw.githubusercontent.com/berttarosio/StructuralDefects/master/Examples/exposed_rebar_01.jpg",
    description: "Exposed rebar detected on the campus walkway bridge at IIIT-Delhi.",
    estimatedRepairCostINR: 85000,
    recommendedDeadline: "Within 48 hours",
    contractor: "Ridhima Kulashriz",
    contractorEmail: "ridhimakulashriz@gmail.com",
  },
  {
    id: 109,
    label: "Corrosion on playground fence",
    defectType: "corrosion",
    severity: "low",
    confidence: 76,
    latitude: "28.5455",
    longitude: "77.2735",
    campus: "IIIT-Delhi",
    infrastructureType: "buildings",
    imageUrl: "https://raw.githubusercontent.com/berttarosio/StructuralDefects/master/Examples/corrosion_01.jpg",
    description: "Minor corrosion detected on the playground fence at IIIT-Delhi campus.",
    estimatedRepairCostINR: 5000,
    recommendedDeadline: "Within 90 days",
    contractor: "Ridhima Kulashriz",
    contractorEmail: "ridhimakulashriz@gmail.com",
  },
];

// Helper: get all demo defects for a specific campus
export function getDefectsForCampus(campus: "IGDTUW" | "IIIT-Delhi"): CampusDemoDefect[] {
  return campusDemoDefects.filter(d => d.campus === campus);
}

// Helper: get all demo defects
export function getAllCampusDefects(): CampusDemoDefect[] {
  return campusDemoDefects;
}
