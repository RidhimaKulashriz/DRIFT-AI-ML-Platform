import { DriftMap } from "@/components/DriftMap";

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

export function InspectionMap({ defects, telemetry, selectedId, onSelect }: InspectionMapProps) {
  const first = defects.find(item => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)));
  const latitude = first ? Number(first.latitude) : 28.6139;
  const longitude = first ? Number(first.longitude) : 77.209;
  const googleMapsUrl = `https://www.google.com/maps/@${latitude},${longitude},15z`;

  return (
    <div className="relative">
      <DriftMap defects={defects} telemetry={telemetry} selectedId={selectedId} onSelect={onSelect} />
      <div className="absolute right-3 top-3 z-20 flex gap-2">
        <span className="border border-cyan-200/50 bg-slate-950/95 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-cyan-100 shadow-xl">Live coordinate map · markers active</span>
        <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="border border-white/60 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-950 shadow-xl">Open Google Maps</a>
      </div>
    </div>
  );
}
