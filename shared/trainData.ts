/**
 * Train monitoring data: railway tracks, vibration sensors, priority levels.
 * All data is demo/simulated for the current implementation.
 */

export type TrackPriority = "high" | "moderate" | "safe";

export type RailwayTrack = {
  id: string;
  name: string;
  route: string;
  /** Array of [lat, lng] points forming the track polyline */
  polyline: number[][];
  priority: TrackPriority;
  anomalyCount: number;
  status: string;
};

export type VibrationSensor = {
  id: string;
  trackId: string;
  name: string;
  latitude: number;
  longitude: number;
  anomalyDetected: boolean;
  severity: "low" | "medium" | "high" | "critical";
  frequencyHz: number;
  amplitude: number;
  timestamp: string;
  /** Vibration graph data points (time-series) */
  graphData: number[];
  priorityContribution: number;
};

export const railwayTracks: RailwayTrack[] = [
  {
    id: "TRK-001",
    name: "Delhi — Jaipur High-Speed Corridor",
    route: "Delhi Cantt → Rewari → Jaipur",
    polyline: [
      [28.6139, 77.209],
      [28.58, 77.18],
      [28.25, 76.58],
      [27.95, 75.78],
      [26.91, 75.79],
    ],
    priority: "high",
    anomalyCount: 7,
    status: "High Priority — Multiple Sensor Anomalies",
  },
  {
    id: "TRK-002",
    name: "Delhi — Chandigarh Main Line",
    route: "New Delhi → Ambala → Chandigarh",
    polyline: [
      [28.6139, 77.209],
      [28.95, 77.27],
      [29.5, 76.98],
      [30.74, 76.78],
    ],
    priority: "moderate",
    anomalyCount: 3,
    status: "Moderate — Some Sensor Readings Elevated",
  },
  {
    id: "TRK-003",
    name: "Lucknow — Varanasi Expressway",
    route: "Lucknow → Allahabad → Varanasi",
    polyline: [
      [26.85, 80.95],
      [26.45, 81.85],
      [25.44, 81.85],
    ],
    priority: "safe",
    anomalyCount: 0,
    status: "Safe — No Significant Anomalies",
  },
];

export const vibrationSensors: VibrationSensor[] = [
  // Track A — High priority (3 sensors)
  {
    id: "VIB-A1",
    trackId: "TRK-001",
    name: "Sensor Point 1 — Delhi Cantt",
    latitude: 28.6139,
    longitude: 77.209,
    anomalyDetected: true,
    severity: "critical",
    frequencyHz: 45.2,
    amplitude: 8.7,
    timestamp: new Date().toISOString(),
    graphData: [2.1, 3.5, 5.8, 8.2, 7.9, 8.7, 8.1, 7.5, 6.8, 7.2, 8.5, 8.7, 7.9, 6.2, 5.1, 4.8, 5.5, 6.8, 7.9, 8.7],
    priorityContribution: 35,
  },
  {
    id: "VIB-A2",
    trackId: "TRK-001",
    name: "Sensor Point 2 — Rewari Junction",
    latitude: 28.25,
    longitude: 76.58,
    anomalyDetected: true,
    severity: "high",
    frequencyHz: 38.6,
    amplitude: 6.3,
    timestamp: new Date().toISOString(),
    graphData: [1.8, 2.2, 3.1, 4.5, 5.8, 6.3, 6.1, 5.5, 5.0, 5.3, 6.0, 6.3, 5.8, 4.5, 3.8, 3.2, 3.8, 4.5, 5.5, 6.3],
    priorityContribution: 25,
  },
  {
    id: "VIB-A3",
    trackId: "TRK-001",
    name: "Sensor Point 3 — Approaching Jaipur",
    latitude: 27.95,
    longitude: 75.78,
    anomalyDetected: true,
    severity: "high",
    frequencyHz: 41.1,
    amplitude: 7.1,
    timestamp: new Date().toISOString(),
    graphData: [2.0, 2.8, 4.2, 5.5, 6.8, 7.1, 6.9, 6.2, 5.8, 6.1, 6.8, 7.1, 6.5, 5.2, 4.1, 3.5, 4.2, 5.5, 6.5, 7.1],
    priorityContribution: 30,
  },
  // Track B — Moderate (2 sensors with mild anomalies)
  {
    id: "VIB-B1",
    trackId: "TRK-002",
    name: "Sensor Point 1 — Ambala",
    latitude: 29.5,
    longitude: 76.98,
    anomalyDetected: true,
    severity: "medium",
    frequencyHz: 22.4,
    amplitude: 3.2,
    timestamp: new Date().toISOString(),
    graphData: [1.0, 1.2, 1.5, 2.0, 2.8, 3.2, 3.0, 2.6, 2.2, 2.5, 3.0, 3.2, 2.8, 2.0, 1.5, 1.2, 1.5, 2.0, 2.5, 3.2],
    priorityContribution: 15,
  },
  // Track C — Safe
  {
    id: "VIB-C1",
    trackId: "TRK-003",
    name: "Sensor Point 1 — Allahabad",
    latitude: 25.44,
    longitude: 81.85,
    anomalyDetected: false,
    severity: "low",
    frequencyHz: 12.0,
    amplitude: 1.1,
    timestamp: new Date().toISOString(),
    graphData: [1.0, 1.0, 1.1, 1.0, 1.1, 1.0, 1.1, 1.0, 1.1, 1.0, 1.1, 1.0, 1.1, 1.0, 1.1, 1.0, 1.1, 1.0, 1.1, 1.0],
    priorityContribution: 2,
  },
];

export function getSensorsForTrack(trackId: string): VibrationSensor[] {
  return vibrationSensors.filter((s) => s.trackId === trackId);
}

export function getTrackPriorityColor(priority: TrackPriority): string {
  switch (priority) {
    case "high":
      return "#ef4444";
    case "moderate":
      return "#f97316";
    case "safe":
      return "#22c55e";
  }
}
