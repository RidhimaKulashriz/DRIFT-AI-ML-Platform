import { useState } from "react";
import { MapView } from "@/components/Map";

 type Severity = "low" | "medium" | "high" | "critical";

type InspectionMapProps = {
  defects: Array<{ id: number; label: string; severity: Severity; latitude: string | number; longitude: string | number }>;
  telemetry: Array<{ latitude: string | number; longitude: string | number }>;
  selectedId?: number;
  onSelect: (id: number) => void;
};

const colors: Record<Severity, string> = { critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e" };

export function InspectionMap({ defects, telemetry, selectedId, onSelect }: InspectionMapProps) {
  const valid = defects.filter(item => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)));
  const center = valid[0] ? { lat: Number(valid[0].latitude), lng: Number(valid[0].longitude) } : { lat: 28.6139, lng: 77.209 };
  const [googleUnavailable, setGoogleUnavailable] = useState(false);
  const markers = valid.slice(0, 40).map(item => ({
    id: item.id,
    position: { lat: Number(item.latitude), lng: Number(item.longitude) },
    label: item.label,
    color: colors[item.severity],
    onClick: () => onSelect(item.id),
  }));

  return (
    <div className="relative overflow-hidden bg-slate-900">
      {googleUnavailable ? <>
        <div className="flex h-[420px] items-center justify-center bg-slate-950 p-8 text-center text-slate-100">
          <div className="max-w-md"><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">Google Maps configuration required</p><p className="mt-3 text-sm leading-6 text-slate-300">This DRIFT surface is intentionally Google Maps-only. Set a project-owned, domain-restricted <code>VITE_GOOGLE_MAPS_API_KEY</code> for this Vercel domain to render live coordinate markers.</p><p className="mt-3 text-xs text-slate-400">No alternate map provider is shown. Finding coordinates remain available in the reviewed record list.</p></div>
        </div>
        <div className="absolute left-3 top-3 z-10 border border-amber-300/60 bg-slate-950/95 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-100 shadow-xl">Google Maps key required · {valid.length} findings · {telemetry.length} telemetry</div>
        <a href={`https://www.google.com/maps/@${center.lat},${center.lng},14z`} target="_blank" rel="noreferrer" className="absolute right-3 top-3 z-10 border border-slate-900 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-950 shadow-xl">Open Google Maps</a>
      </> : <>
        <MapView
          className="h-[420px] w-full"
          initialCenter={center}
          initialZoom={valid.length ? 14 : 11}
          markers={markers}
          onMapError={() => setGoogleUnavailable(true)}
        />
        <div className="absolute left-3 top-3 z-10 border border-white/60 bg-slate-950/95 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-white shadow-xl">Google Maps · {valid.length} findings · {telemetry.length} telemetry</div>
        <a href={`https://www.google.com/maps/@${center.lat},${center.lng},14z`} target="_blank" rel="noreferrer" className="absolute right-3 top-3 z-10 border border-slate-900 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-950 shadow-xl">Open full map</a>
      </>}
      <div className="flex flex-wrap gap-2 border-t border-slate-700 bg-slate-950 p-3" aria-label="Map finding markers">
        {valid.slice(0, 18).map(item => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-white ${selectedId === item.id ? "ring-2 ring-white" : ""}`} style={{ backgroundColor: colors[item.severity], borderColor: "rgba(255,255,255,.8)" }} title={`${item.label} · ${item.latitude}, ${item.longitude}`}>{item.severity} · {item.id}</button>)}
        {!valid.length && <span className="text-[10px] uppercase tracking-[0.12em] text-slate-400">No persisted finding coordinates yet</span>}
      </div>
    </div>
  );
}
