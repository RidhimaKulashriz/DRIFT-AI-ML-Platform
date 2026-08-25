import { runVisionInference } from "./mlInference";

export type SimulatedFinding = Awaited<ReturnType<typeof runVisionInference>> & {
  title: string;
  latitude: number;
  longitude: number;
  captureOffsetSeconds: number;
};

export async function buildSimulatorMission(name = "Demo corridor patrol") {
  const anchor = { latitude: 28.6139, longitude: 77.209 }; // New Delhi demo coordinate
  const evidenceNames = ["bridge_structural_frame.jpg", "eastbound_crack_pass.jpg", "service_lane_pothole.jpg"];
  const findings: SimulatedFinding[] = await Promise.all(
    evidenceNames.map(async (fileName, index) => {
      const latitude = anchor.latitude + (index - 1) * 0.0032;
      const longitude = anchor.longitude + (index - 1) * 0.0041;
      const inference = await runVisionInference({ fileName, latitude, longitude, assetCriticality: index === 0 ? 5 : index === 1 ? 4 : 3, priorOpenDefects: index, demo: true });
      return { ...inference, title: fileName.replace(/[_-]/g, " ").replace(/\.jpg$/, ""), latitude, longitude, captureOffsetSeconds: 42 + index * 71 };
    }),
  );
  return {
    name,
    startedAt: Date.now() - 1000 * 60 * 18,
    telemetry: Array.from({ length: 12 }, (_, index) => ({
      latitude: anchor.latitude - 0.008 + index * 0.0013,
      longitude: anchor.longitude - 0.011 + index * 0.0018,
      altitude: 34 + (index % 4) * 2,
      batteryPercent: 94 - index * 3,
      speedMps: 7 + (index % 3),
      timestamp: Date.now() - (12 - index) * 15000,
    })),
    findings,
  };
}
