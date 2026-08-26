import { useMemo } from "react";

type Severity = "low" | "medium" | "high" | "critical";

type InspectionMapProps = {
  defects: Array<{ id: number; label: string; severity: Severity; latitude: string | number; longitude: string | number }>;
  telemetry: Array<{ latitude: string | number; longitude: string | number }>;
  selectedId?: number;
  onSelect: (id: number) => void;
};

const colors: Record<Severity, string> = { critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e" };

export function InspectionMap({ defects, telemetry, selectedId, onSelect }: InspectionMapProps) {
  const valid = useMemo(() => defects.filter(item => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))), [defects]);
  const center = valid[0] ? { lat: Number(valid[0].latitude), lon: Number(valid[0].longitude) } : { lat: 28.6139, lon: 77.209 };
  const latPad = 0.018;
  const lonPad = 0.022;
  const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${center.lon - lonPad}%2C${center.lat - latPad}%2C${center.lon + lonPad}%2C${center.lat + latPad}&layer=mapnik&marker=${center.lat}%2C${center.lon}`;

  return (
    <div className="relative overflow-hidden bg-slate-900">
      <iframe title="Free OpenStreetMap inspection map" src={embedUrl} className="h-[420px] w-full border-0 bg-slate-100" loading="lazy" />
      <div className="absolute left-3 top-3 z-10 border border-white/60 bg-slate-950/95 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-white shadow-xl">Free OpenStreetMap · {valid.length} findings · {telemetry.length} telemetry</div>
      <a href={`https://www.openstreetmap.org/?mlat=${center.lat}&mlon=${center.lon}#map=15/${center.lat}/${center.lon}`} target="_blank" rel="noreferrer" className="absolute right-3 top-3 z-10 border border-slate-900 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-950 shadow-xl">Open full map</a>
      <div className="flex flex-wrap gap-2 border-t border-slate-700 bg-slate-950 p-3" aria-label="Map finding markers">
        {valid.slice(0, 18).map(item => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-white ${selectedId === item.id ? "ring-2 ring-white" : ""}`} style={{ backgroundColor: colors[item.severity], borderColor: "rgba(255,255,255,.8)" }} title={`${item.label} · ${item.latitude}, ${item.longitude}`}>{item.severity} · {item.id}</button>)}
        {!valid.length && <span className="text-[10px] uppercase tracking-[0.12em] text-slate-400">No persisted finding coordinates yet</span>}
      </div>
    </div>
  );
}
