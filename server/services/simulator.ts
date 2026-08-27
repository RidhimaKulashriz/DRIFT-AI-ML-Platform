import { runVisionInference } from "./mlInference";

export type SimulatedFinding = Awaited<ReturnType<typeof runVisionInference>> & {
  title: string;
  latitude: number;
  longitude: number;
  captureOffsetSeconds: number;
};

export async function buildSimulatorMission(name = "Demo corridor patrol") {
  // These coordinates form a reproducible, temporary demonstration grid. They are not
  // observations of real defects, assets, or work orders at the displayed map location.
  const anchor = { latitude: 28.6139, longitude: 77.209 };
  const demoAdvisories = [
    ["sim_demo_structural_frame_01.jpg", -0.0072, -0.0094, 5], ["sim_demo_crack_panel_02.jpg", -0.0072, -0.0047, 4], ["sim_demo_pothole_surface_03.jpg", -0.0072, 0, 3], ["sim_demo_corrosion_bearing_04.jpg", -0.0072, 0.0047, 4], ["sim_demo_spalling_edge_05.jpg", -0.0072, 0.0094, 3],
    ["sim_demo_rebar_zone_06.jpg", 0, -0.0094, 5], ["sim_demo_water_drainage_07.jpg", 0, -0.0047, 3], ["sim_demo_settlement_shoulder_08.jpg", 0, 0, 4], ["sim_demo_rail_alignment_09.jpg", 0, 0.0047, 4], ["sim_demo_obstruction_10.jpg", 0, 0.0094, 2],
    ["sim_demo_lighting_node_11.jpg", 0.0072, -0.0094, 2], ["sim_demo_crack_expansion_12.jpg", 0.0072, -0.0047, 4], ["sim_demo_pothole_lane_13.jpg", 0.0072, 0, 3], ["sim_demo_structural_parapet_14.jpg", 0.0072, 0.0047, 5], ["sim_demo_water_joint_15.jpg", 0.0072, 0.0094, 3],
  ] as const;
  const findings: SimulatedFinding[] = await Promise.all(
    demoAdvisories.map(async ([fileName, latitudeOffset, longitudeOffset, assetCriticality], index) => {
      const latitude = anchor.latitude + latitudeOffset;
      const longitude = anchor.longitude + longitudeOffset;
      const inference = await runVisionInference({ fileName, latitude, longitude, assetCriticality, priorOpenDefects: index % 6, demo: true });
      return { ...inference, title: `SIMULATED DEMO · ${fileName.replace(/[_-]/g, " ").replace(/\.jpg$/, "")}`, latitude, longitude, captureOffsetSeconds: 42 + index * 38 };
    }),
  );
  return {
    name,
    startedAt: Date.now() - 1000 * 60 * 18,
    telemetry: Array.from({ length: 30 }, (_, index) => ({
      latitude: anchor.latitude - 0.009 + index * 0.00062 + (index % 4) * 0.00018,
      longitude: anchor.longitude - 0.012 + index * 0.0008 + (index % 5) * 0.00014,
      altitude: 34 + (index % 4) * 2,
      batteryPercent: 94 - index,
      speedMps: 7 + (index % 3),
      timestamp: Date.now() - (30 - index) * 15000,
    })),
    findings,
  };
}
