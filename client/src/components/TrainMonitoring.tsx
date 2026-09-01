import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  Train,
  AlertTriangle,
  CheckCheck,
  MapPinned,
  Radio,
  Activity,
  ChevronRight,
  CircleDot,
  Gauge,
  Zap,
} from "lucide-react";
import { format as formatDate } from "date-fns";

type TrackPriority = "high" | "moderate" | "safe";

const priorityMeta: Record<
  TrackPriority,
  { color: string; bg: string; border: string; icon: string; label: string }
> = {
  high: {
    color: "#ef4444",
    bg: "bg-red-50",
    border: "border-red-400",
    icon: "🔴",
    label: "HIGH PRIORITY",
  },
  moderate: {
    color: "#f97316",
    bg: "bg-orange-50",
    border: "border-orange-400",
    icon: "🟠",
    label: "MODERATE",
  },
  safe: {
    color: "#22c55e",
    bg: "bg-green-50",
    border: "border-green-400",
    icon: "🟢",
    label: "SAFE",
  },
};

function VibrationGraph({
  data,
  severity,
}: {
  data: number[];
  severity: string;
}) {
  const max = Math.max(...data, 1);
  const width = 280;
  const height = 80;
  const points = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * width},${height - (v / max) * (height - 10)}`,
    )
    .join(" ");

  const fillColor =
    severity === "critical"
      ? "#fecaca"
      : severity === "high"
        ? "#fed7aa"
        : severity === "medium"
          ? "#fef08a"
          : "#dcfce7";
  const strokeColor =
    severity === "critical"
      ? "#ef4444"
      : severity === "high"
        ? "#f97316"
        : severity === "medium"
          ? "#eab308"
          : "#22c55e";

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
    >
      <polygon points={areaPoints} fill={fillColor} opacity={0.4} />
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2}
      />
      {data.map((v, i) => (
        <circle
          key={i}
          cx={(i / (data.length - 1)) * width}
          cy={height - (v / max) * (height - 10)}
          r={2}
          fill={strokeColor}
        />
      ))}
    </svg>
  );
}

function SensorCard({
  sensor,
  trackName,
}: {
  sensor: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    anomalyDetected: boolean;
    severity: string;
    frequencyHz: number;
    amplitude: number;
    timestamp: string;
    graphData: number[];
    priorityContribution: number;
  };
  trackName: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-all",
        sensor.anomalyDetected
          ? "border-red-300 bg-red-50/50"
          : "border-green-300 bg-green-50/50",
      )}
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {sensor.id}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-gray-800">
            {sensor.name}
          </p>
          <p className="text-xs text-gray-500">{trackName}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-bold uppercase",
            sensor.anomalyDetected
              ? "bg-red-100 text-red-700"
              : "bg-green-100 text-green-700",
          )}
        >
          {sensor.severity}
        </span>
      </div>

      <VibrationGraph data={sensor.graphData} severity={sensor.severity} />

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1">
          <MapPinned className="h-3 w-3 text-gray-400" />
          <span className="text-gray-600">
            {sensor.latitude.toFixed(4)}, {sensor.longitude.toFixed(4)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Zap className="h-3 w-3 text-gray-400" />
          <span className="text-gray-600">
            {sensor.frequencyHz} Hz · {sensor.amplitude} mm/s
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Gauge className="h-3 w-3 text-gray-400" />
          <span className="text-gray-600">
            Priority: +{sensor.priorityContribution}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Activity className="h-3 w-3 text-gray-400" />
          <span className="text-gray-600">
            {formatDate(new Date(sensor.timestamp), "HH:mm:ss")}
          </span>
        </div>
      </div>

      {sensor.anomalyDetected && (
        <div className="mt-2 rounded bg-red-100 px-2 py-1 text-xs text-red-700">
          ⚠ Anomaly detected — contributes +{sensor.priorityContribution} to
          track priority
        </div>
      )}
    </div>
  );
}

function TrackMapCard({
  tracks,
  sensors,
  selectedTrackId,
  onSelectTrack,
}: {
  tracks: Array<{
    id: string;
    name: string;
    route: string;
    priority: TrackPriority;
    anomalyCount: number;
    status: string;
    polyline: number[][];
  }>;
  sensors: Array<{
    id: string;
    trackId: string;
    latitude: number;
    longitude: number;
    anomalyDetected: boolean;
    severity: string;
  }>;
  selectedTrackId: string | null;
  onSelectTrack: (id: string) => void;
}) {
  const allPoints = tracks.flatMap((t) =>
    t.polyline.map(([lat, lng]) => ({ lat, lng })),
  );
  const lats = allPoints.map((p) => p.lat);
  const lngs = allPoints.map((p) => p.lng);
  const minLat = Math.min(...lats) - 0.5;
  const maxLat = Math.max(...lats) + 0.5;
  const minLng = Math.min(...lngs) - 0.5;
  const maxLng = Math.max(...lngs) + 0.5;

  const project = (lat: number, lng: number) => ({
    x: ((lng - minLng) / (maxLng - minLng)) * 100,
    y: ((maxLat - lat) / (maxLat - minLat)) * 100,
  });

  return (
    <div className="relative min-h-[400px] rounded-xl border border-gray-200 bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
        🇮🇳 India Railway Network — Monitored Tracks
      </div>

      <svg
        viewBox="0 0 100 100"
        className="h-[360px] w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background grid */}
        {[...Array(11)].map((_, i) => (
          <line
            key={`h${i}`}
            x1={0}
            y1={i * 10}
            x2={100}
            y2={i * 10}
            stroke="#e2e8f0"
            strokeWidth={0.2}
          />
        ))}
        {[...Array(11)].map((_, i) => (
          <line
            key={`v${i}`}
            x1={i * 10}
            y1={0}
            x2={i * 10}
            y2={100}
            stroke="#e2e8f0"
            strokeWidth={0.2}
          />
        ))}

        {/* Track polylines */}
        {tracks.map((track) => {
          const points = track.polyline
            .map(([lat, lng]) => {
              const p = project(lat, lng);
              return `${p.x},${p.y}`;
            })
            .join(" ");
          const meta = priorityMeta[track.priority];
          const isSelected = selectedTrackId === track.id;
          return (
            <g key={track.id} onClick={() => onSelectTrack(track.id)}>
              <polyline
                points={points}
                fill="none"
                stroke={meta.color}
                strokeWidth={isSelected ? 1.2 : 0.7}
                strokeDasharray={track.priority === "safe" ? "1,1" : "none"}
                opacity={isSelected ? 1 : 0.7}
                className="cursor-pointer"
              />
              {/* Track label */}
              {track.polyline.length > 1 && (() => {
                const mid = track.polyline[Math.floor(track.polyline.length / 2)]!;
                const p = project(mid[0], mid[1]);
                return (
                  <text
                    x={p.x + 1}
                    y={p.y - 1.5}
                    fill={meta.color}
                    fontSize={isSelected ? 2.8 : 2.2}
                    fontWeight="bold"
                  >
                    {meta.icon} {track.name.split("—")[0]?.trim()}
                  </text>
                );
              })()}
            </g>
          );
        })}

        {/* Sensor points */}
        {sensors.map((sensor) => {
          const p = project(sensor.latitude, sensor.longitude);
          const sensorColor =
            sensor.severity === "critical"
              ? "#ef4444"
              : sensor.severity === "high"
                ? "#f97316"
                : sensor.severity === "medium"
                  ? "#eab308"
                  : "#22c55e";
          return (
            <g key={sensor.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={sensor.anomalyDetected ? 1.8 : 1.2}
                fill={sensorColor}
                stroke="#fff"
                strokeWidth={0.4}
              />
              {sensor.anomalyDetected && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={3}
                  fill="none"
                  stroke={sensorColor}
                  strokeWidth={0.3}
                  opacity={0.5}
                >
                  <animate
                    attributeName="r"
                    from="2"
                    to="5"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.6"
                    to="0"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <text
                x={p.x + 2.5}
                y={p.y + 0.8}
                fill="#374151"
                fontSize={2}
                fontWeight="bold"
              >
                {sensor.id}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {(["high", "moderate", "safe"] as TrackPriority[]).map((p) => (
          <div key={p} className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: priorityMeta[p].color }}
            />
            <span className="font-medium text-gray-600">
              {priorityMeta[p].label}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" />
          <span className="font-medium text-gray-600">VIBRATION SENSOR</span>
        </div>
      </div>
    </div>
  );
}

export default function TrainMonitoring() {
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(
    "TRK-001",
  );
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);

  const tracksQuery = trpc.features.trains.tracks.useQuery();
  const sensorsQuery = trpc.features.trains.sensors.useQuery();

  const tracks = tracksQuery.data ?? [];
  const sensors = sensorsQuery.data ?? [];

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);
  const trackSensors = selectedTrackId
    ? sensors.filter((s) => s.trackId === selectedTrackId)
    : [];
  const selectedSensor = selectedSensorId
    ? sensors.find((s) => s.id === selectedSensorId)
    : null;

  const totalAnomalies = sensors.filter((s) => s.anomalyDetected).length;
  const criticalSensors = sensors.filter(
    (s) => s.severity === "critical",
  ).length;
  const highPriorityTracks = tracks.filter(
    (t) => t.priority === "high",
  ).length;

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-orange-600">
            🚂 SEPARATE MODULE
          </span>
          <h2 className="mt-1 text-2xl font-bold text-gray-900">
            Train Monitoring &amp; Track Anomaly Detection
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            India railway network monitoring with vibration sensor integration.
            Track priority is calculated from sensor anomaly data.
          </p>
        </div>
        <Train className="h-8 w-8 text-orange-500" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Monitored Tracks
          </div>
          <div className="mt-1 text-2xl font-bold text-gray-800">
            {tracks.length}
          </div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
          <div className="text-xs font-bold uppercase tracking-wider text-red-400">
            🔴 High Priority
          </div>
          <div className="mt-1 text-2xl font-bold text-red-600">
            {highPriorityTracks}
          </div>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-center">
          <div className="text-xs font-bold uppercase tracking-wider text-orange-400">
            Sensor Anomalies
          </div>
          <div className="mt-1 text-2xl font-bold text-orange-600">
            {totalAnomalies}
          </div>
        </div>
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-center">
          <div className="text-xs font-bold uppercase tracking-wider text-yellow-600">
            Critical Sensors
          </div>
          <div className="mt-1 text-2xl font-bold text-yellow-700">
            {criticalSensors}
          </div>
        </div>
      </div>

      {/* Map + Track List */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <TrackMapCard
            tracks={tracks}
            sensors={sensors}
            selectedTrackId={selectedTrackId}
            onSelectTrack={setSelectedTrackId}
          />
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Track Classification
          </h3>
          {tracks.map((track) => {
            const meta = priorityMeta[track.priority];
            const isSelected = selectedTrackId === track.id;
            return (
              <button
                key={track.id}
                type="button"
                onClick={() => setSelectedTrackId(track.id)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-all",
                  isSelected
                    ? `${meta.bg} ${meta.border} border-2 ring-2 ring-offset-1`
                    : "border-gray-200 bg-white hover:border-gray-300",
                )}
                style={isSelected ? { ringColor: meta.color } : {}}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{meta.icon}</span>
                    <div>
                      <div className="text-sm font-bold text-gray-800">
                        {track.id}
                      </div>
                      <div className="text-xs text-gray-500">{track.name}</div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  {track.route}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-bold uppercase"
                    style={{
                      background: `${meta.color}20`,
                      color: meta.color,
                    }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-xs text-gray-400">
                    {track.anomalyCount} anomalies
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Track Detail */}
      {selectedTrack && (
        <div
          className={cn(
            "rounded-xl border-2 p-6",
            priorityMeta[selectedTrack.priority].bg,
            priorityMeta[selectedTrack.priority].border,
          )}
        >
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-800">
                {priorityMeta[selectedTrack.priority].icon}{" "}
                {selectedTrack.name}
              </h3>
              <p className="text-sm text-gray-600">{selectedTrack.route}</p>
              <p className="mt-1 text-xs text-gray-500">
                {selectedTrack.status}
              </p>
            </div>
            <span
              className="rounded-full px-3 py-1 text-sm font-bold uppercase"
              style={{
                background: priorityMeta[selectedTrack.priority].color,
                color: "#fff",
              }}
            >
              {priorityMeta[selectedTrack.priority].label}
            </span>
          </div>

          {/* Sensor Points on this track */}
          <div>
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
              📍 Vibration Sensor Points ({trackSensors.length})
            </h4>
            <div className="grid grid-cols-3 gap-4">
              {trackSensors.map((sensor) => (
                <div key={sensor.id}>
                  <SensorCard
                    sensor={sensor}
                    trackName={selectedTrack.name}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedSensorId(
                        selectedSensorId === sensor.id ? null : sensor.id,
                      )
                    }
                    className="mt-2 w-full rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50"
                  >
                    {selectedSensorId === sensor.id ? "CLOSE" : "VIEW DETAIL"}
                  </button>
                </div>
              ))}
            </div>

            {trackSensors.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-gray-400">
                No vibration sensors on this track yet
              </div>
            )}
          </div>

          {/* Sensor detail expansion */}
          {selectedSensor && (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
              <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-600">
                📊 Detailed Sensor Analysis — {selectedSensor.id}
              </h4>
              <VibrationGraph
                data={selectedSensor.graphData}
                severity={selectedSensor.severity}
              />
              <div className="mt-4 grid grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-xs text-gray-400">FREQUENCY</div>
                  <div className="font-bold">{selectedSensor.frequencyHz} Hz</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">AMPLITUDE</div>
                  <div className="font-bold">{selectedSensor.amplitude} mm/s</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">GPS</div>
                  <div className="font-bold">
                    {selectedSensor.latitude.toFixed(4)},{" "}
                    {selectedSensor.longitude.toFixed(4)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">PRIORITY CONTRIBUTION</div>
                  <div className="font-bold text-red-600">
                    +{selectedSensor.priorityContribution} points
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Priority Classification Legend */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-600">
          🎯 Track Priority Classification Logic
        </h3>
        <div className="grid grid-cols-3 gap-6">
          <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔴</span>
              <div>
                <div className="font-bold text-red-700">HIGH PRIORITY</div>
                <div className="text-xs text-red-600">
                  Multiple sensor anomalies detected
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-1 text-xs text-red-700">
              <div>• 3+ vibration sensors showing anomalies</div>
              <div>• Overall score ≥ 80</div>
              <div>• Immediate inspection & maintenance required</div>
              <div>• Emergency dispatch within 4 hours</div>
            </div>
          </div>
          <div className="rounded-lg border-2 border-orange-300 bg-orange-50 p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🟠</span>
              <div>
                <div className="font-bold text-orange-700">MODERATE</div>
                <div className="text-xs text-orange-600">
                  Some sensor readings elevated
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-1 text-xs text-orange-700">
              <div>• 1-2 sensors with medium anomalies</div>
              <div>• Overall score 35-79</div>
              <div>• Schedule repair in next maintenance cycle</div>
              <div>• Engineer review within 24 hours</div>
            </div>
          </div>
          <div className="rounded-lg border-2 border-green-300 bg-green-50 p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🟢</span>
              <div>
                <div className="font-bold text-green-700">SAFE</div>
                <div className="text-xs text-green-600">
                  No significant anomalies
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-1 text-xs text-green-700">
              <div>• All sensors normal</div>
              <div>• Overall score &lt; 35</div>
              <div>• Monitor and verify on next pass</div>
              <div>• Within 30 days schedule</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
