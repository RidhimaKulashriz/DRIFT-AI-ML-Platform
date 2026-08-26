import { useMemo, useState } from "react";
import { DriftMap } from "@/components/DriftMap";
import { MapView } from "@/components/Map";

type Severity = "low" | "medium" | "high" | "critical";

type InspectionMapProps = {
  defects: Array<{
    id: number;
    label: string;
    severity: Severity;
    zeroErrorScore?: number;
    confidencePercent?: number;
    latitude: string | number;
    longitude: string | number;
  }>;
  telemetry: Array<{ latitude: string | number; longitude: string | number }>;
  selectedId?: number;
  onSelect: (id: number) => void;
};

const markerColors: Record<Severity, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
};

export function InspectionMap({ defects, telemetry, selectedId, onSelect }: InspectionMapProps) {
  const [googleMapFailed, setGoogleMapFailed] = useState(false);
  const validDefects = useMemo(() => defects.filter(item => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))), [defects]);
  const center = validDefects[0] ? { lat: Number(validDefects[0].latitude), lng: Number(validDefects[0].longitude) } : { lat: 28.6139, lng: 77.209 };
  const markers = validDefects.map(defect => ({
    id: defect.id,
    position: { lat: Number(defect.latitude), lng: Number(defect.longitude) },
    label: `${defect.severity.toUpperCase()} · ${defect.id}`,
    color: markerColors[defect.severity],
    onClick: () => onSelect(defect.id),
  }));

  return (
    <div className="relative">
      {!googleMapFailed ? (
        <MapView
          className="h-[420px]"
          initialCenter={center}
          initialZoom={14}
          markers={markers}
          onMapError={() => setGoogleMapFailed(true)}
        />
      ) : (
        <DriftMap defects={defects} telemetry={telemetry} selectedId={selectedId} onSelect={onSelect} />
      )}
      <div className="absolute bottom-3 left-3 z-10 border border-slate-300/60 bg-slate-950/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-100">
        {googleMapFailed ? "Coordinate map fallback · Google Maps provider unavailable" : "Google Maps · inspection coordinates"}
      </div>
    </div>
  );
}
