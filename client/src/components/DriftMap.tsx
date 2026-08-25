import { useEffect, useMemo, useRef, useState } from "react";
import { MapView } from "@/components/Map";
import { cn } from "@/lib/utils";

type Severity = "low" | "medium" | "high" | "critical";
type MapDefect = {
  id: number;
  label: string;
  defectType?: string;
  severity: Severity;
  zeroErrorScore?: number;
  confidencePercent?: number;
  latitude: string | number;
  longitude: string | number;
};

type MapTelemetry = {
  latitude: string | number;
  longitude: string | number;
};

const severityMeta: Record<Severity, { color: string; label: string }> = {
  critical: { color: "#ef4444", label: "Critical" },
  high: { color: "#f97316", label: "High" },
  medium: { color: "#eab308", label: "Medium" },
  low: { color: "#22c55e", label: "Low" },
};

function colorForSeverity(severity: Severity) {
  return severityMeta[severity].color;
}

export function DriftMap({ defects, telemetry, selectedId, onSelect, className }: {
  defects: MapDefect[];
  telemetry: MapTelemetry[];
  selectedId?: number;
  onSelect: (id: number) => void;
  className?: string;
}) {
  const overlays = useRef<google.maps.MVCObject[]>([]);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const validDefects = useMemo(() => defects.filter(point => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))), [defects]);
  const validTelemetry = useMemo(() => telemetry.filter(point => Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))), [telemetry]);
  const coordinates = [...validDefects, ...validTelemetry].map(point => ({ lat: Number(point.latitude), lng: Number(point.longitude) }));
  const center = coordinates[0] ?? { lat: 28.6139, lng: 77.209 };
  const bounds = useMemo(() => {
    const lats = coordinates.map(point => point.lat);
    const lngs = coordinates.map(point => point.lng);
    const minLat = Math.min(...lats, center.lat);
    const maxLat = Math.max(...lats, center.lat);
    const minLng = Math.min(...lngs, center.lng);
    const maxLng = Math.max(...lngs, center.lng);
    return {
      minLat: minLat - Math.max((maxLat - minLat) * 0.16, 0.001),
      maxLat: maxLat + Math.max((maxLat - minLat) * 0.16, 0.001),
      minLng: minLng - Math.max((maxLng - minLng) * 0.16, 0.001),
      maxLng: maxLng + Math.max((maxLng - minLng) * 0.16, 0.001),
    };
  }, [center.lat, center.lng, coordinates]);
  const project = (latitude: string | number, longitude: string | number) => ({
    left: `${Math.min(94, Math.max(6, ((Number(longitude) - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1)) * 100))}%`,
    top: `${Math.min(88, Math.max(12, (1 - (Number(latitude) - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1)) * 100))}%`,
  });
  const severityCounts = (Object.keys(severityMeta) as Severity[]).map(severity => ({ severity, count: validDefects.filter(defect => defect.severity === severity).length }));
  const selectedPoint = useMemo(() => validDefects.find(defect => defect.id === selectedId), [validDefects, selectedId]);
  const criticalPoint = useMemo(() => validDefects.find(defect => defect.severity === "critical"), [validDefects]);

  useEffect(() => {
    if (!mapRef.current || !selectedPoint) return;
    mapRef.current.panTo({ lat: Number(selectedPoint.latitude), lng: Number(selectedPoint.longitude) });
    mapRef.current.setZoom(selectedPoint.severity === "critical" ? 18 : 17);
  }, [selectedPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    overlays.current.forEach(item => {
      if ("setMap" in item && typeof item.setMap === "function") item.setMap(null);
    });
    overlays.current = [];
    if (validTelemetry.length > 1) overlays.current.push(new google.maps.Polyline({ map, path: validTelemetry.map(point => ({ lat: Number(point.latitude), lng: Number(point.longitude) })), geodesic: true, strokeColor: "#06b6d4", strokeOpacity: 0.9, strokeWeight: 3 }));
    validDefects.forEach((defect, index) => {
      const overlapIndex = validDefects.slice(0, index).filter(other => other.latitude === defect.latitude && other.longitude === defect.longitude).length;
      const marker = new google.maps.Marker({ map, position: { lat: Number(defect.latitude) + overlapIndex * 0.000018, lng: Number(defect.longitude) + overlapIndex * 0.000018 }, title: `${defect.label} · ${defect.severity} · ${defect.latitude}, ${defect.longitude}`, label: { text: `${defect.severity.toUpperCase()} · ${defect.id}`, color: "#ffffff", fontSize: "10px", fontWeight: "700" }, icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: colorForSeverity(defect.severity), fillOpacity: selectedId === defect.id ? 1 : 0.95, strokeColor: "#ffffff", strokeWeight: selectedId === defect.id ? 4 : 2, scale: selectedId === defect.id ? 12 : 9 }, zIndex: defect.severity === "critical" ? 40 : defect.severity === "high" ? 30 : defect.severity === "medium" ? 20 : 10 });
      marker.addListener("click", () => onSelect(defect.id));
      overlays.current.push(marker);
    });
    return () => {
      overlays.current.forEach(item => {
        if ("setMap" in item && typeof item.setMap === "function") item.setMap(null);
      });
      overlays.current = [];
    };
  }, [mapReady, validDefects, validTelemetry, selectedId, onSelect]);

  useEffect(() => () => {
    overlays.current.forEach(item => {
      if ("setMap" in item && typeof item.setMap === "function") item.setMap(null);
    });
    mapRef.current = null;
  }, []);

  return (
    <div className={cn("relative min-h-[420px] overflow-hidden bg-slate-950", className)} aria-label="Provider-backed geospatial defect map">
      <MapView
        className="h-[420px]"
        initialCenter={center}
        initialZoom={coordinates.length ? 15 : 12}
        onMapError={() => { setMapReady(false); setMapError(true); }}
        onMapReady={map => {
          mapRef.current = map;
          setMapReady(true);
          setMapError(false);

        }}
      />

      {(!mapReady || mapError) && <div className="absolute inset-0 z-[2] overflow-hidden bg-[radial-gradient(circle_at_50%_42%,#172554_0%,#080d1c_52%,#020617_100%)]" aria-label="Coordinate fallback plot">
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "linear-gradient(rgba(148,163,184,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.28) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
        <div className="absolute left-5 top-20 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Coordinate field · {center.lat.toFixed(4)} / {center.lng.toFixed(4)}</div>
        {validTelemetry.map((point, index) => { const position = project(point.latitude, point.longitude); return <span key={`telemetry-${index}`} className="absolute h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_#22d3ee]" style={position} />; })}
        {validDefects.map((defect, index) => { const position = project(defect.latitude, defect.longitude); const overlapIndex = validDefects.slice(0, index).filter(other => other.latitude === defect.latitude && other.longitude === defect.longitude).length; return <button key={defect.id} type="button" className={cn("absolute flex items-center gap-1 rounded-full border px-1.5 py-1 text-[10px] font-bold text-white shadow-lg transition-transform hover:scale-110", selectedId === defect.id && "ring-2 ring-white ring-offset-2 ring-offset-slate-950")} style={{ ...position, transform: `translate(calc(-50% + ${overlapIndex * 10}px), calc(-50% - ${overlapIndex * 10}px))`, backgroundColor: colorForSeverity(defect.severity), borderColor: "rgba(255,255,255,.9)" }} onClick={() => onSelect(defect.id)} title={`${defect.label} · ${defect.severity} · ${defect.latitude}, ${defect.longitude}`} aria-label={`Locate ${defect.severity} finding ${defect.id} at ${defect.latitude}, ${defect.longitude}`}><span>{defect.severity.toUpperCase()}</span><span>· {defect.id}</span></button>; })}
        {!validDefects.length && <div className="absolute inset-0 flex items-center justify-center text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">No finding coordinates yet<br /><span className="mt-2 block font-normal normal-case tracking-normal text-slate-500">Run a simulator mission or connect an approved bridge.</span></div>}
      </div>}

      <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] bg-slate-950/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-100 shadow-lg">
        <div>{validDefects.length} findings · {validTelemetry.length} telemetry points · {mapReady ? "live map" : "coordinate plot"}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-[9px] tracking-[0.1em]">{severityCounts.map(item => <span key={item.severity} className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForSeverity(item.severity) }} />{item.count} {item.severity}</span>)}</div>
      </div>
      {criticalPoint && <button type="button" className="pointer-events-auto absolute right-3 top-3 z-10 border border-red-200/60 bg-red-950/90 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-red-50 shadow-lg transition hover:bg-red-900" onClick={() => onSelect(criticalPoint.id)} title={`Locate critical finding ${criticalPoint.id}`}><span className="mr-2 inline-block h-2 w-2 rounded-full bg-red-400" />LOCATE CRITICAL · {Number(criticalPoint.latitude).toFixed(5)}, {Number(criticalPoint.longitude).toFixed(5)}</button>}
      <button type="button" className="pointer-events-auto absolute bottom-12 right-3 z-20 border border-slate-500 bg-slate-950/95 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-100 shadow-xl" onClick={() => setShowRegister(value => !value)} aria-expanded={showRegister}>{showRegister ? "CLOSE" : "OPEN"} FINDING REGISTER · {validDefects.length}</button>
      {showRegister && <div className="pointer-events-auto absolute bottom-20 right-3 z-30 max-h-44 w-64 overflow-auto border border-slate-500 bg-slate-950/98 p-2 text-[9px] uppercase tracking-[0.08em] text-slate-100 shadow-2xl"><div className="mb-1 flex items-center justify-between border-b border-slate-700 pb-1 font-bold text-slate-400"><span>IN-MAP FINDING REGISTER</span><button type="button" className="text-slate-200" onClick={() => setShowRegister(false)} aria-label="Close finding register">×</button></div>{validDefects.map(defect => <button key={`register-${defect.id}`} type="button" className={cn("flex w-full items-center justify-between gap-2 border-b border-slate-800 px-1 py-1.5 text-left transition hover:bg-slate-800", selectedId === defect.id && "bg-slate-800")} onClick={() => { onSelect(defect.id); setShowRegister(false); }}><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForSeverity(defect.severity) }} />{defect.severity} · {defect.id}</span><span className="text-[8px] text-slate-400">{Number(defect.latitude).toFixed(4)}, {Number(defect.longitude).toFixed(4)}</span></button>)}</div>}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap gap-3 bg-slate-950/90 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-slate-200">
        {(Object.keys(severityMeta) as Severity[]).map(severity => <span key={severity}><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colorForSeverity(severity) }} />{severityMeta[severity].label}</span>)}
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-cyan-400" />flight trace</span>
      </div>
    </div>
  );
}
