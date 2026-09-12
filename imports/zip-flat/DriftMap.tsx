import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CAMPUS_SITES } from "@shared/campusSites";

type Severity = "low" | "medium" | "high" | "critical";
type MapDefect = { id: number; label: string; defectType?: string; severity: Severity; zeroErrorScore?: number; confidencePercent?: number; latitude: string | number; longitude: string | number; isTransient?: boolean };
type MapTelemetry = { latitude: string | number; longitude: string | number };
type PublicBridgeContext = { structureNumber: string; title: string; latitude: number; longitude: number; deckCondition: string; source: string; sourceUrl: string };

export const publicNbiBridgeContext: PublicBridgeContext[] = [
  { structureNumber: "0518", title: "Johnson River", latitude: 63.704797, longitude: -144.640464, deckCondition: "4", source: "USDOT/BTS NBI 2025", sourceUrl: "https://geodata.bts.gov/datasets/usdot::national-bridge-inventory/about" },
  { structureNumber: "0574", title: "Gulkana River", latitude: 62.268856, longitude: -145.373803, deckCondition: "4", source: "USDOT/BTS NBI 2025", sourceUrl: "https://geodata.bts.gov/datasets/usdot::national-bridge-inventory/about" },
  { structureNumber: "0581", title: "Upper Miller Creek", latitude: 63.375533, longitude: -145.729814, deckCondition: "4", source: "USDOT/BTS NBI 2025", sourceUrl: "https://geodata.bts.gov/datasets/usdot::national-bridge-inventory/about" },
];
const severityMeta: Record<Severity, { color: string; label: string }> = { critical: { color: "#c81e1e", label: "Critical" }, high: { color: "#e26d16", label: "High" }, medium: { color: "#b98600", label: "Medium" }, low: { color: "#177a47", label: "Low" } };

let googleMapsPromise: Promise<typeof google> | null = null;
function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("drift-google-maps-sdk") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps could not be loaded.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "drift-google-maps-sdk";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("Google Maps could not be loaded."));
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}
function asCoordinates(value: { latitude: string | number; longitude: string | number }) {
  const lat = Number(value.latitude);
  const lng = Number(value.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
}

export function DriftMap({ defects, telemetry, selectedId, streetViewRequest = 0, onSelect, className }: { defects: MapDefect[]; telemetry: MapTelemetry[]; selectedId?: number; streetViewRequest?: number; onSelect: (id: number) => void; className?: string }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const projectMarkers = useRef<google.maps.Marker[]>([]);
  const contextMarkers = useRef<google.maps.Marker[]>([]);
  const completedStreetViewRequest = useRef(0);
  const [mapState, setMapState] = useState<"loading" | "ready" | "missing-key" | "error">("loading");
  const [streetViewStatus, setStreetViewStatus] = useState<"idle" | "checking" | "open" | "unavailable">("idle");
  const [telemetryVisible, setTelemetryVisible] = useState(false);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  const validDefects = useMemo(() => defects.map(defect => ({ defect, point: asCoordinates(defect) })).filter((item): item is { defect: MapDefect; point: { lat: number; lng: number } } => Boolean(item.point)), [defects]);
  const validTelemetry = useMemo(() => telemetry.map(asCoordinates).filter((point): point is { lat: number; lng: number } => Boolean(point)), [telemetry]);
  const shouldShowTelemetry = telemetryVisible || validDefects.length === 0;
  const severityCounts = useMemo(() => (Object.keys(severityMeta) as Severity[]).map(severity => ({ severity, count: validDefects.filter(item => item.defect.severity === severity).length })), [validDefects]);
  const selectedDefect = useMemo(() => validDefects.find(item => item.defect.id === selectedId) ?? null, [selectedId, validDefects]);
  const transientDefects = useMemo(() => validDefects.filter(item => item.defect.isTransient === true || item.defect.id < 0), [validDefects]);

  useEffect(() => {
    if (!apiKey) { setMapState("missing-key"); return; }
    let cancelled = false;
    setMapState("loading");
    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !mapElement.current) return;
      const center = validDefects[0]?.point ?? { lat: CAMPUS_SITES[0].latitude, lng: CAMPUS_SITES[0].longitude };
      mapRef.current = new window.google.maps.Map(mapElement.current, { center, zoom: validDefects.length ? 14 : 11, mapTypeControl: true, streetViewControl: true, fullscreenControl: true, clickableIcons: false, gestureHandling: "cooperative" });
      setMapState("ready");
    }).catch(() => { if (!cancelled) setMapState("error"); });
    return () => { cancelled = true; };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready" || !window.google?.maps) return;
    projectMarkers.current.forEach(marker => marker.setMap(null));
    contextMarkers.current.forEach(marker => marker.setMap(null));
    projectMarkers.current = [];
    contextMarkers.current = [];
    const bounds = new window.google.maps.LatLngBounds();
    const infoWindow = new window.google.maps.InfoWindow();
    validDefects.forEach(({ defect, point }, index) => {
      const isTransient = defect.isTransient === true || defect.id < 0;
      const selected = selectedId === defect.id;
      const marker = new window.google.maps.Marker({ map, position: point, title: `${isTransient ? "SIMULATED DEMO advisory" : "DRIFT project finding"}: ${defect.label}`, zIndex: selected ? 10_000 : 1_000 + index, label: { text: isTransient ? String(index + 1) : defect.severity[0]!.toUpperCase(), color: "#ffffff", fontWeight: "700", fontSize: isTransient ? "10px" : "12px" }, icon: { path: window.google.maps.SymbolPath.CIRCLE, fillColor: severityMeta[defect.severity].color, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: selected ? 4 : 2, scale: selected ? 15 : 10 } });
      marker.addListener("click", () => { onSelect(defect.id); setStreetViewStatus("idle"); infoWindow.setContent(`<div style="max-width:240px;font:13px Arial,sans-serif"><strong>${isTransient ? "SIMULATED DEMO advisory" : "DRIFT project finding"}</strong><br/>${defect.label}<br/>Severity: ${defect.severity}<br/>Coordinates: ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}<br/><em>${isTransient ? "Temporary browser-only data. Not field evidence." : "Engineer review required."}</em></div>`); infoWindow.open({ map, anchor: marker }); });
      projectMarkers.current.push(marker);
      bounds.extend(point);
    });
    if (shouldShowTelemetry) validTelemetry.forEach(point => { const marker = new window.google.maps.Marker({ map, position: point, clickable: false, zIndex: 50, icon: { path: window.google.maps.SymbolPath.CIRCLE, fillColor: "#16b7d4", fillOpacity: .42, strokeColor: "#ffffff", strokeWeight: .75, scale: 1.5 } }); projectMarkers.current.push(marker); if (!validDefects.length) bounds.extend(point); });
    publicNbiBridgeContext.forEach(context => { const marker = new window.google.maps.Marker({ map, position: { lat: context.latitude, lng: context.longitude }, title: `Public NBI context: ${context.title}`, label: { text: "NBI", color: "#ffffff", fontSize: "9px", fontWeight: "700" }, icon: { path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, fillColor: "#5646b0", fillOpacity: .95, strokeColor: "#ffffff", strokeWeight: 1.5, scale: 6 } }); marker.addListener("click", () => { infoWindow.setContent(`<div style="max-width:250px;font:13px Arial,sans-serif"><strong>Public NBI context only</strong><br/>${context.title} · Structure ${context.structureNumber}<br/>Published deck-condition field: ${context.deckCondition}<br/><em>2025 public inventory record. Not a DRIFT site, live defect, ticket, or safety determination.</em></div>`); infoWindow.open({ map, anchor: marker }); }); contextMarkers.current.push(marker); });
    CAMPUS_SITES.forEach(site => { const marker = new window.google.maps.Marker({ map, position: { lat: site.latitude, lng: site.longitude }, title: `Campus reference: ${site.name}`, label: { text: site.shortName === "IIIT DELHI" ? "IIIT" : "IGD", color: "#ffffff", fontSize: "9px", fontWeight: "700" }, icon: { path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, fillColor: "#047481", fillOpacity: .98, strokeColor: "#ffffff", strokeWeight: 1.5, scale: 7 } }); marker.addListener("click", () => { infoWindow.setContent(`<div style="max-width:260px;font:13px Arial,sans-serif"><strong>Verified campus reference only</strong><br/>${site.name}<br/>${site.address}<br/>Coordinates: ${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}<br/><em>Not a DRIFT finding, inspection record, evidence location, or safety determination.</em></div>`); infoWindow.open({ map, anchor: marker }); }); contextMarkers.current.push(marker); });
    if (validDefects.length || (shouldShowTelemetry && validTelemetry.length)) map.fitBounds(bounds, validDefects.length ? 54 : 84);
  }, [mapState, onSelect, selectedId, shouldShowTelemetry, validDefects, validTelemetry]);

  useEffect(() => { const map = mapRef.current; if (!map || mapState !== "ready" || !selectedDefect) return; map.getStreetView().setVisible(false); map.panTo(selectedDefect.point); map.setZoom(Math.max(map.getZoom() ?? 15, 16)); }, [mapState, selectedDefect]);
  const showNbiContext = () => { const map = mapRef.current; if (!map || !window.google?.maps) return; const bounds = new window.google.maps.LatLngBounds(); publicNbiBridgeContext.forEach(point => bounds.extend({ lat: point.latitude, lng: point.longitude })); map.getStreetView().setVisible(false); map.fitBounds(bounds, 60); };
  const focusTemporaryGrid = () => { const map = mapRef.current; if (!map || !window.google?.maps || !transientDefects.length) return; const bounds = new window.google.maps.LatLngBounds(); transientDefects.forEach(item => bounds.extend(item.point)); map.getStreetView().setVisible(false); setStreetViewStatus("idle"); map.fitBounds(bounds, 54); };
  const focusCampus = (siteId: (typeof CAMPUS_SITES)[number]["id"]) => { const map = mapRef.current; const site = CAMPUS_SITES.find(candidate => candidate.id === siteId); if (!map || !site) return; map.getStreetView().setVisible(false); setStreetViewStatus("idle"); map.panTo({ lat: site.latitude, lng: site.longitude }); map.setZoom(16); };
  const openStreetView = useCallback(async () => { const map = mapRef.current; if (!map || !selectedDefect || !window.google?.maps) return; setStreetViewStatus("checking"); try { const response = await new window.google.maps.StreetViewService().getPanorama({ location: selectedDefect.point, radius: 250 }); const pano = response.data.location?.pano; if (!pano) throw new Error("No panorama"); const panorama = map.getStreetView(); panorama.setPano(pano); panorama.setPov({ heading: 0, pitch: 0 }); panorama.setVisible(true); setStreetViewStatus("open"); } catch { setStreetViewStatus("unavailable"); } }, [selectedDefect]);
  useEffect(() => { if (!streetViewRequest || streetViewRequest === completedStreetViewRequest.current || mapState !== "ready" || !selectedDefect) return; completedStreetViewRequest.current = streetViewRequest; void openStreetView(); }, [mapState, openStreetView, selectedDefect, streetViewRequest]);

  return <section className={cn("relative min-h-[500px] overflow-hidden border border-slate-700 bg-slate-950", className)} aria-label="Google Maps infrastructure context"><div ref={mapElement} className="absolute inset-0" />{mapState === "loading" && <div className="absolute inset-0 grid place-items-center bg-slate-950 text-center text-xs font-semibold uppercase tracking-[.14em] text-slate-200">Loading Google Maps context…</div>}{mapState === "missing-key" && <div className="absolute inset-0 grid place-items-center bg-slate-950 p-8 text-center text-xs font-semibold uppercase tracking-[.14em] text-slate-200"><div><strong className="block text-sm text-white">Google Maps configuration required</strong><span className="mt-3 block max-w-md normal-case font-normal leading-5 tracking-normal text-slate-400">Set the browser-visible Vercel variable <code>VITE_GOOGLE_MAPS_API_KEY</code> with a domain-restricted Google Maps JavaScript API key. No fallback map or invented locations are shown.</span></div></div>}{mapState === "error" && <div className="absolute inset-0 grid place-items-center bg-slate-950 p-8 text-center text-xs font-semibold uppercase tracking-[.14em] text-slate-200"><div><strong className="block text-sm text-white">Google Maps could not load</strong><span className="mt-3 block max-w-md normal-case font-normal leading-5 tracking-normal text-slate-400">Verify the browser key, allowed Vercel domain, and Google Maps JavaScript API. Project and public-context markers remain intentionally unavailable until the map is live.</span></div></div>}<div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] bg-slate-950/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.13em] text-slate-100 shadow-xl"><div>{validDefects.length} displayed advisory point{validDefects.length === 1 ? "" : "s"} · {validTelemetry.length} telemetry {shouldShowTelemetry ? "shown" : "hidden for map clarity"}</div><div className="mt-2 flex flex-wrap gap-2 text-[9px] tracking-[.08em]">{severityCounts.map(item => <span key={item.severity} className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: severityMeta[item.severity].color }} />{item.count} {item.severity}</span>)}</div></div><div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2 bg-slate-950/95 p-2.5 text-[9px] font-semibold uppercase tracking-[.1em] text-slate-100 shadow-xl"><span className="mr-auto">● numbered temporary advisory · select any marker or report item · ◆ public NBI context · ▲ verified campus reference</span><button type="button" onClick={() => focusCampus("iiit-delhi")} disabled={mapState !== "ready"} className="pointer-events-auto border border-teal-300/70 bg-teal-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:opacity-60">FOCUS IIIT DELHI</button><button type="button" onClick={() => focusCampus("igdtuw")} disabled={mapState !== "ready"} className="pointer-events-auto border border-teal-300/70 bg-teal-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:opacity-60">FOCUS IGDTUW</button><button type="button" onClick={focusTemporaryGrid} disabled={!transientDefects.length || mapState !== "ready"} className="pointer-events-auto border border-emerald-300/70 bg-emerald-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">FOCUS 15-POINT GRID</button><button type="button" onClick={() => setTelemetryVisible(current => !current)} disabled={!validTelemetry.length || mapState !== "ready"} className="pointer-events-auto border border-cyan-300/70 bg-cyan-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{shouldShowTelemetry ? "HIDE TELEMETRY" : `SHOW ${validTelemetry.length} TELEMETRY`}</button><button type="button" onClick={openStreetView} disabled={!selectedDefect || mapState !== "ready" || streetViewStatus === "checking"} className="pointer-events-auto border border-sky-300/70 bg-sky-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{streetViewStatus === "checking" ? "CHECKING STREET VIEW" : "OPEN STREET VIEW"}</button><button type="button" onClick={showNbiContext} className="pointer-events-auto border border-violet-300/70 bg-violet-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white">FOCUS PUBLIC NBI CONTEXT</button><a className="pointer-events-auto border border-slate-500 px-2.5 py-1.5 text-[9px] font-bold text-slate-100" href="https://geodata.bts.gov/datasets/usdot::national-bridge-inventory/about" target="_blank" rel="noreferrer">NBI SOURCE</a></div>{streetViewStatus === "unavailable" && <div className="absolute bottom-16 left-3 z-10 max-w-xs bg-amber-950/95 px-3 py-2 text-[10px] leading-4 text-amber-50 shadow-xl" role="status">Street View is not available within 250 m of this selected coordinate. No imagery is substituted or treated as DRIFT evidence.</div>}{streetViewStatus === "open" && <div className="absolute bottom-16 left-3 z-10 max-w-xs bg-sky-950/95 px-3 py-2 text-[10px] leading-4 text-sky-50 shadow-xl" role="status">Public Street View opened for the selected coordinate. It is third-party public imagery, not DRIFT evidence or a defect confirmation.</div>}</section>;
}
