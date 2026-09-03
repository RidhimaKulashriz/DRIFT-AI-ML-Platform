import { runVisionInference } from "./mlInference";

export type SimulatedFinding = Awaited<ReturnType<typeof runVisionInference>> & {
  title: string;
  latitude: number;
  longitude: number;
  captureOffsetSeconds: number;
  infrastructureType: string;
};

export async function buildSimulatorMission(name = "Campus infrastructure inspection") {
  // Real campus coordinates — IGDTUW and IIIT-Delhi
  const igdtuw = { latitude: 28.6647, longitude: 77.2325 };
  const iiitDelhi = { latitude: 28.5444, longitude: 77.2725 };

  const detections: Array<{
    fileName: string;
    latOffset: number;
    lngOffset: number;
    assetCriticality: number;
    infrastructureType: string;
    label: string;
    campus: string;
  }> = [
    // IGDTUW Campus — Road & Building Defects
    { fileName: "igdtuw_bridge_structural_01.jpg", latOffset: 0.0008, lngOffset: 0.0012, assetCriticality: 5, infrastructureType: "bridges", label: "structural", campus: "IGDTUW" },
    { fileName: "igdtuw_pothole_gate_02.jpg", latOffset: -0.0005, lngOffset: 0.0008, assetCriticality: 3, infrastructureType: "roads", label: "pothole", campus: "IGDTUW" },
    { fileName: "igdtuw_building_spalling_03.jpg", latOffset: 0.0003, lngOffset: -0.0006, assetCriticality: 5, infrastructureType: "buildings", label: "spalling", campus: "IGDTUW" },
    { fileName: "igdtuw_drainage_04.jpg", latOffset: -0.0009, lngOffset: -0.0003, assetCriticality: 3, infrastructureType: "drainage", label: "water_intrusion", campus: "IGDTUW" },
    { fileName: "igdtuw_corrosion_rail_05.jpg", latOffset: 0.0006, lngOffset: 0.0004, assetCriticality: 4, infrastructureType: "roads", label: "corrosion", campus: "IGDTUW" },

    // IIIT-Delhi Campus — Road & Bridge Defects
    { fileName: "iiitd_road_pothole_01.jpg", latOffset: 0.0006, lngOffset: -0.0008, assetCriticality: 3, infrastructureType: "roads", label: "pothole", campus: "IIIT-Delhi" },
    { fileName: "iiitd_bridge_crack_02.jpg", latOffset: -0.0004, lngOffset: 0.001, assetCriticality: 5, infrastructureType: "bridges", label: "structural", campus: "IIIT-Delhi" },
    { fileName: "iiitd_road_settlement_03.jpg", latOffset: 0.0002, lngOffset: -0.0005, assetCriticality: 4, infrastructureType: "roads", label: "settlement", campus: "IIIT-Delhi" },
    { fileName: "iiitd_road_crack_04.jpg", latOffset: -0.0007, lngOffset: 0.0003, assetCriticality: 4, infrastructureType: "roads", label: "crack", campus: "IIIT-Delhi" },
    { fileName: "iiitd_exposed_rebar_05.jpg", latOffset: 0.0005, lngOffset: 0.0007, assetCriticality: 5, infrastructureType: "bridges", label: "exposed_rebar", campus: "IIIT-Delhi" },

    // Shared corridor (Delhi connecting road)
    { fileName: "delhi_ringroad_pothole_01.jpg", latOffset: 0.003, lngOffset: 0.004, assetCriticality: 3, infrastructureType: "roads", label: "pothole", campus: "Corridor" },
    { fileName: "delhi_overpass_structural_02.jpg", latOffset: 0.002, lngOffset: 0.003, assetCriticality: 5, infrastructureType: "bridges", label: "structural", campus: "Corridor" },
    { fileName: "igdtuw_road_settlement_06.jpg", latOffset: 0.0011, lngOffset: -0.0008, assetCriticality: 4, infrastructureType: "roads", label: "settlement", campus: "IGDTUW" },
    { fileName: "iiitd_water_intrusion_06.jpg", latOffset: -0.0010, lngOffset: 0.0006, assetCriticality: 4, infrastructureType: "bridges", label: "water_intrusion", campus: "IIIT-Delhi" },
    { fileName: "corridor_rail_alignment_03.jpg", latOffset: 0.0025, lngOffset: 0.0035, assetCriticality: 3, infrastructureType: "railways", label: "rail_alignment", campus: "Corridor" },
  ];

  const findings: SimulatedFinding[] = await Promise.all(
    detections.map(async (det, index) => {
      const anchor = det.campus === "IIIT-Delhi" ? iiitDelhi : det.campus === "IGDTUW" ? igdtuw : { latitude: (igdtuw.latitude + iiitDelhi.latitude) / 2, longitude: (igdtuw.longitude + iiitDelhi.longitude) / 2 };
      const latitude = anchor.latitude + det.latOffset;
      const longitude = anchor.longitude + det.lngOffset;
      const inference = await runVisionInference({
        fileName: det.fileName,
        latitude,
        longitude,
        assetCriticality: det.assetCriticality,
        priorOpenDefects: index % 4,
        demo: true,
      });
      return {
        ...inference,
        title: `SIMULATED DEMO · ${det.campus} — ${det.label.replace(/_/g, " ").toUpperCase()}`,
        latitude,
        longitude,
        captureOffsetSeconds: 42 + index * 38,
        infrastructureType: det.infrastructureType,
      };
    }),
  );

  // Telemetry — drone flight path between the two campuses
  const waypoints = 30;
  const latStart = igdtuw.latitude;
  const latEnd = iiitDelhi.latitude;
  const lngStart = igdtuw.longitude;
  const lngEnd = iiitDelhi.longitude;

  return {
    name,
    startedAt: Date.now() - 1000 * 60 * 25,
    telemetry: Array.from({ length: waypoints }, (_, index) => ({
      latitude: latStart + (latEnd - latStart) * (index / waypoints) + (Math.sin(index * 0.5) * 0.0003),
      longitude: lngStart + (lngEnd - lngStart) * (index / waypoints) + (Math.cos(index * 0.7) * 0.0003),
      altitude: 45 + (index % 5) * 3,
      batteryPercent: 98 - Math.floor(index * 98 / waypoints),
      speedMps: 6 + (index % 3),
      timestamp: Date.now() - (waypoints - index) * 15000,
    })),
    findings,
  };
}
