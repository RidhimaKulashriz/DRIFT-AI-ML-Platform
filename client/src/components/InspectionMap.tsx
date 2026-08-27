import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Severity = "low" | "medium" | "high" | "critical";
type MapDefect = { id: number; label: string; severity: Severity; latitude: string | number; longitude: string | number; isTransient?: boolean };
type InspectionMapProps = { defects: MapDefect[]; telemetry: Array<{ latitude: string | number; longitude: string | number }>; selectedId?: number; streetViewRequest?: number; onSelect: (id: number) => void; className?: string };
type PublicBridgeContext = { structureNumber: string; title: string; latitude: number; longitude: number; deckCondition: string; source: string; sourceUrl: string };
type KartaViewPhoto = { id: string; imageUrl: string; latitude: number; longitude: number; heading?: string; shotDate?: string; sequenceId?: string };
type KartaViewResponse = { result?: { data?: Array<{ id?: string | number; imageProcUrl?: string; imageLthUrl?: string; fileurlProc?: string; lat?: string | number; lng?: string | number; heading?: string | number; shotDate?: string; sequenceId?: string | number }> } };

const colors: Record<Severity, string> = { critical: "#c81e1e", high: "#e26d16", medium: "#b98600", low: "#177a47" };
const publicNbiBridgeContext: PublicBridgeContext[] = [
  { structureNumber: "0518", title: "Johnson River", latitude: 63.704797, longitude: -144.640464, deckCondition: "4", source: "USDOT/BTS NBI 2025", sourceUrl: "https://geodata.bts.gov/datasets/usdot::national-bridge-inventory/about" },
  { structureNumber: "0574", title: "Gulkana River", latitude: 62.268856, longitude: -145.373803, deckCondition: "4", source: "USDOT/BTS NBI 2025", sourceUrl: "https://geodata.bts.gov/datasets/usdot::national-bridge-inventory/about" },
  { structureNumber: "0581", title: "Upper Miller Creek", latitude: 63.375533, longitude: -145.729814, deckCondition: "4", source: "USDOT/BTS NBI 2025", sourceUrl: "https://geodata.bts.gov/datasets/usdot::national-bridge-inventory/about" },
];

let googleMapsPromise: Promise<typeof google> | null = null;
type MapMarker = google.maps.Marker | google.maps.marker.AdvancedMarkerElement;

function removeMapMarker(marker: MapMarker) {
  if ("setMap" in marker && typeof marker.setMap === "function") marker.setMap(null);
  else (marker as google.maps.marker.AdvancedMarkerElement).map = null;
}

function createInspectionMarker(options: { map: google.maps.Map; position: google.maps.LatLngLiteral; title?: string; zIndex?: number; label: string; color: string; selected?: boolean; clickable?: boolean }): MapMarker {
  const AdvancedMarkerElement = window.google.maps.marker?.AdvancedMarkerElement;
  if (AdvancedMarkerElement) {
    const content = document.createElement("div");
    content.textContent = options.label;
    content.style.cssText = `display:grid;place-items:center;width:${options.selected ? 30 : 22}px;height:${options.selected ? 30 : 22}px;border:${options.selected ? 4 : 2}px solid #fff;border-radius:999px;background:${options.color};box-shadow:0 2px 8px rgba(0,0,0,.42);color:#fff;font:700 ${options.label.length > 2 ? 8 : 11}px Arial,sans-serif;transform:translate(-50%,-50%);`;
    return new AdvancedMarkerElement({ map: options.map, position: options.position, title: options.title, zIndex: options.zIndex, content, gmpClickable: options.clickable !== false });
  }
  return new window.google.maps.Marker({ map: options.map, position: options.position, title: options.title, zIndex: options.zIndex, clickable: options.clickable !== false, label: { text: options.label, color: "#ffffff", fontWeight: "700", fontSize: options.label.length > 2 ? "9px" : "12px" }, icon: { path: window.google.maps.SymbolPath.CIRCLE, fillColor: options.color, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: options.selected ? 4 : 2, scale: options.selected ? 15 : 10 } });
}

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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=marker`;
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

export function InspectionMap({ defects, telemetry, selectedId, streetViewRequest = 0, onSelect, className }: InspectionMapProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const projectMarkers = useRef<MapMarker[]>([]);
  const contextMarkers = useRef<MapMarker[]>([]);
  const completedStreetViewRequest = useRef(0);
  const [mapState, setMapState] = useState<"loading" | "ready" | "fallback">("loading");
  const [streetViewStatus, setStreetViewStatus] = useState<"idle" | "checking" | "open" | "unavailable">("idle");
  const [kartaViewStatus, setKartaViewStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [kartaViewPhotos, setKartaViewPhotos] = useState<KartaViewPhoto[]>([]);
  const [kartaViewOpen, setKartaViewOpen] = useState(false);
  const [selectedKartaViewPhoto, setSelectedKartaViewPhoto] = useState<KartaViewPhoto | null>(null);
  const [telemetryVisible, setTelemetryVisible] = useState(false);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim() || "DEMO_MAP_ID";
  const validDefects = useMemo(() => defects.map(defect => ({ defect, point: asCoordinates(defect) })).filter((item): item is { defect: MapDefect; point: { lat: number; lng: number } } => Boolean(item.point)), [defects]);
  const validTelemetry = useMemo(() => telemetry.map(asCoordinates).filter((point): point is { lat: number; lng: number } => Boolean(point)), [telemetry]);
  const shouldShowTelemetry = telemetryVisible || validDefects.length === 0;
  const severityCounts = useMemo(() => (Object.keys(colors) as Severity[]).map(severity => ({ severity, count: validDefects.filter(item => item.defect.severity === severity).length })), [validDefects]);
  const selectedDefect = useMemo(() => validDefects.find(item => item.defect.id === selectedId) ?? null, [selectedId, validDefects]);
  const transientDefects = useMemo(() => validDefects.filter(item => item.defect.isTransient === true || item.defect.id < 0), [validDefects]);
  const kartaViewCenter = useMemo(() => selectedDefect?.point ?? validDefects[0]?.point ?? validTelemetry[0] ?? { lat: publicNbiBridgeContext[0]!.latitude, lng: publicNbiBridgeContext[0]!.longitude }, [selectedDefect, validDefects, validTelemetry]);

  useEffect(() => {
    const windowWithMapsAuth = window as Window & { gm_authFailure?: () => void };
    let cancelled = false;
    let authFailed = false;
    const authFailureHandler = () => { authFailed = true; setMapState("fallback"); };
    windowWithMapsAuth.gm_authFailure = authFailureHandler;
    if (!apiKey) { setMapState("fallback"); return () => { if (windowWithMapsAuth.gm_authFailure === authFailureHandler) delete windowWithMapsAuth.gm_authFailure; }; }
    setMapState("loading");
    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || authFailed || !mapElement.current) return;
      const center = validDefects[0]?.point ?? { lat: publicNbiBridgeContext[0]!.latitude, lng: publicNbiBridgeContext[0]!.longitude };
      mapRef.current = new window.google.maps.Map(mapElement.current, { center, zoom: validDefects.length ? 14 : 6, mapId, mapTypeControl: true, streetViewControl: true, fullscreenControl: true, clickableIcons: false, gestureHandling: "cooperative" });
      setMapState("ready");
    }).catch(() => { if (!cancelled) setMapState("fallback"); });
    return () => { cancelled = true; if (windowWithMapsAuth.gm_authFailure === authFailureHandler) delete windowWithMapsAuth.gm_authFailure; };
  }, [apiKey, mapId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready" || !window.google?.maps) return;
    projectMarkers.current.forEach(removeMapMarker);
    contextMarkers.current.forEach(removeMapMarker);
    projectMarkers.current = [];
    contextMarkers.current = [];
    const bounds = new window.google.maps.LatLngBounds();
    const infoWindow = new window.google.maps.InfoWindow();

    validDefects.forEach(({ defect, point }, index) => {
      const isTransient = defect.isTransient === true || defect.id < 0;
      const selected = selectedId === defect.id;
      const marker = createInspectionMarker({ map, position: point, title: `${isTransient ? "SIMULATED DEMO advisory" : "DRIFT project finding"}: ${defect.label}`, zIndex: selected ? 10_000 : 1_000 + index, label: isTransient ? String(index + 1) : defect.severity[0]!.toUpperCase(), color: colors[defect.severity], selected });
      marker.addListener("click", () => {
        onSelect(defect.id);
        setStreetViewStatus("idle");
        infoWindow.setContent(`<div style="max-width:240px;font:13px Arial,sans-serif"><strong>${isTransient ? "SIMULATED DEMO advisory" : "DRIFT project finding"}</strong><br/>${defect.label}<br/>Severity: ${defect.severity}<br/>Coordinates: ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}<br/><em>${isTransient ? "Temporary browser-only data. Not field evidence." : "Engineer review required."}</em></div>`);
        infoWindow.open({ map, anchor: marker });
      });
      projectMarkers.current.push(marker);
      bounds.extend(point);
    });

    if (shouldShowTelemetry) {
      validTelemetry.forEach(point => {
        const marker = createInspectionMarker({ map, position: point, clickable: false, zIndex: 50, label: "", color: "#16b7d4" });
        projectMarkers.current.push(marker);
        if (!validDefects.length) bounds.extend(point);
      });
    }

    publicNbiBridgeContext.forEach(context => {
      const marker = createInspectionMarker({ map, position: { lat: context.latitude, lng: context.longitude }, title: `Public NBI context: ${context.title}`, label: "NBI", color: "#5646b0" });
      marker.addListener("click", () => {
        infoWindow.setContent(`<div style="max-width:250px;font:13px Arial,sans-serif"><strong>Public NBI context only</strong><br/>${context.title} · Structure ${context.structureNumber}<br/>Published deck-condition field: ${context.deckCondition}<br/><em>2025 public inventory record. Not a DRIFT site, live defect, ticket, or safety determination.</em></div>`);
        infoWindow.open({ map, anchor: marker });
      });
      contextMarkers.current.push(marker);
    });
    if (validDefects.length || (shouldShowTelemetry && validTelemetry.length)) map.fitBounds(bounds, validDefects.length ? 54 : 84);
  }, [mapState, onSelect, selectedId, shouldShowTelemetry, validDefects, validTelemetry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready" || !selectedDefect) return;
    map.getStreetView().setVisible(false);
    map.panTo(selectedDefect.point);
    map.setZoom(Math.max(map.getZoom() ?? 15, 16));
  }, [mapState, selectedDefect]);

  const openKartaView = useCallback(async () => {
    setKartaViewOpen(true);
    setKartaViewStatus("loading");
    setSelectedKartaViewPhoto(null);
    try {
      const url = new URL("https://api.openstreetcam.org/2.0/photo/");
      url.searchParams.set("lat", String(kartaViewCenter.lat));
      url.searchParams.set("lng", String(kartaViewCenter.lng));
      url.searchParams.set("radius", "500");
      const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`KartaView request failed with ${response.status}`);
      const payload = await response.json() as KartaViewResponse;
      const photos = (Array.isArray(payload.result?.data) ? payload.result.data : []).map((photo, index): KartaViewPhoto | null => {
        const latitude = Number(photo.lat);
        const longitude = Number(photo.lng);
        const imageUrl = photo.imageProcUrl || photo.imageLthUrl || photo.fileurlProc;
        if (!imageUrl || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
        return { id: String(photo.id ?? index), imageUrl, latitude, longitude, heading: photo.heading == null ? undefined : String(photo.heading), shotDate: photo.shotDate, sequenceId: photo.sequenceId == null ? undefined : String(photo.sequenceId) };
      }).filter((photo): photo is KartaViewPhoto => photo !== null).slice(0, 12);
      setKartaViewPhotos(photos);
      setSelectedKartaViewPhoto(photos[0] ?? null);
      setKartaViewStatus(photos.length ? "ready" : "empty");
    } catch {
      setKartaViewPhotos([]);
      setSelectedKartaViewPhoto(null);
      setKartaViewStatus("error");
    }
  }, [kartaViewCenter]);

  const showNbiContext = () => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    const bounds = new window.google.maps.LatLngBounds();
    publicNbiBridgeContext.forEach(point => bounds.extend({ lat: point.latitude, lng: point.longitude }));
    map.getStreetView().setVisible(false);
    map.fitBounds(bounds, 60);
  };
  const focusTemporaryGrid = () => {
    const map = mapRef.current;
    if (!map || !window.google?.maps || !transientDefects.length) return;
    const bounds = new window.google.maps.LatLngBounds();
    transientDefects.forEach(item => bounds.extend(item.point));
    map.getStreetView().setVisible(false);
    setStreetViewStatus("idle");
    map.fitBounds(bounds, 54);
  };
  const openStreetView = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !selectedDefect || !window.google?.maps) return;
    setStreetViewStatus("checking");
    try {
      const response = await new window.google.maps.StreetViewService().getPanorama({ location: selectedDefect.point, radius: 250 });
      const pano = response.data.location?.pano;
      if (!pano) throw new Error("No panorama");
      const panorama = map.getStreetView();
      panorama.setPano(pano);
      panorama.setPov({ heading: 0, pitch: 0 });
      panorama.setVisible(true);
      setStreetViewStatus("open");
    } catch {
      setStreetViewStatus("unavailable");
    }
  }, [selectedDefect]);

  useEffect(() => {
    if (!streetViewRequest || streetViewRequest === completedStreetViewRequest.current || mapState !== "ready" || !selectedDefect) return;
    completedStreetViewRequest.current = streetViewRequest;
    void openStreetView();
  }, [mapState, openStreetView, selectedDefect, streetViewRequest]);

  return <section className={cn("relative min-h-[500px] overflow-hidden border border-slate-700 bg-slate-950", className)} aria-label="Google Maps infrastructure context">
    <div ref={mapElement} className={cn("absolute inset-0", mapState === "fallback" && "hidden")} />
    {mapState === "loading" && <div className="absolute inset-0 grid place-items-center bg-slate-950 text-center text-xs font-semibold uppercase tracking-[.14em] text-slate-200">Loading Google Maps context…</div>}
    {mapState === "fallback" && <div className="absolute inset-0 overflow-auto bg-slate-950 p-5 text-slate-100"><div className="mx-auto max-w-3xl"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="block text-[10px] font-bold uppercase tracking-[.16em] text-amber-300">MAP FALLBACK ACTIVE</span><strong className="mt-1 block text-lg text-white">Google Maps unavailable or over quota</strong><p className="mt-2 max-w-xl text-xs leading-5 text-slate-300">The inspection workspace is still usable. Select a finding below to keep review context, or open its coordinates in Google Maps. No invented map imagery is substituted.</p></div><span className="border border-amber-300/60 bg-amber-950/70 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[.1em] text-amber-100">{validDefects.length} FINDINGS · {validTelemetry.length} TELEMETRY</span></div><div className="mt-5 grid gap-2 sm:grid-cols-2">{validDefects.map(({ defect, point }, index) => <button key={defect.id} type="button" onClick={() => onSelect(defect.id)} className={cn("border p-3 text-left transition", selectedId === defect.id ? "border-emerald-300 bg-emerald-950/70" : "border-slate-700 bg-slate-900 hover:border-slate-400")}><span className="block text-[9px] font-bold uppercase tracking-[.12em]" style={{ color: colors[defect.severity] }}>{defect.isTransient || defect.id < 0 ? `TEMPORARY ADVISORY ${index + 1}` : defect.severity}</span><strong className="mt-1 block text-sm text-white">{defect.label}</strong><span className="mt-1 block text-[10px] text-slate-400">{point.lat.toFixed(6)}, {point.lng.toFixed(6)}</span></button>)}{!validDefects.length && validTelemetry.slice(0, 12).map((point, index) => <div key={`${point.lat}-${point.lng}-${index}`} className="border border-cyan-900 bg-slate-900 p-3"><span className="block text-[9px] font-bold uppercase tracking-[.12em] text-cyan-300">TELEMETRY POINT {index + 1}</span><span className="mt-1 block text-xs text-slate-200">{point.lat.toFixed(6)}, {point.lng.toFixed(6)}</span></div>)}{!validDefects.length && !validTelemetry.length && <div className="border border-slate-700 bg-slate-900 p-4 text-xs text-slate-300">No valid coordinates are available for this view.</div>}</div>{(selectedDefect?.point ?? validTelemetry[0]) && <a className="mt-5 inline-flex border border-sky-300/70 bg-sky-900/80 px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-white" href={`https://www.google.com/maps/search/?api=1&query=${(selectedDefect?.point ?? validTelemetry[0])!.lat},${(selectedDefect?.point ?? validTelemetry[0])!.lng}`} target="_blank" rel="noreferrer">OPEN SELECTED COORDINATE IN GOOGLE MAPS</a>}</div></div>}
    <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] bg-slate-950/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.13em] text-slate-100 shadow-xl"><div>{validDefects.length} displayed advisory point{validDefects.length === 1 ? "" : "s"} · {validTelemetry.length} telemetry {shouldShowTelemetry ? "shown" : "hidden for map clarity"}</div><div className="mt-2 flex flex-wrap gap-2 text-[9px] tracking-[.08em]">{severityCounts.map(item => <span key={item.severity} className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[item.severity] }} />{item.count} {item.severity}</span>)}</div></div>
    <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2 bg-slate-950/95 p-2.5 text-[9px] font-semibold uppercase tracking-[.1em] text-slate-100 shadow-xl"><span className="mr-auto">● numbered temporary advisory · select any marker or report item · ◆ public NBI context</span><button type="button" onClick={focusTemporaryGrid} disabled={!transientDefects.length || mapState !== "ready"} className="pointer-events-auto border border-emerald-300/70 bg-emerald-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">FOCUS 15-POINT GRID</button><button type="button" onClick={() => setTelemetryVisible(current => !current)} disabled={!validTelemetry.length || mapState !== "ready"} className="pointer-events-auto border border-cyan-300/70 bg-cyan-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{shouldShowTelemetry ? "HIDE TELEMETRY" : `SHOW ${validTelemetry.length} TELEMETRY`}</button><button type="button" onClick={openStreetView} disabled={!selectedDefect || mapState !== "ready" || streetViewStatus === "checking"} className="pointer-events-auto border border-sky-300/70 bg-sky-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{streetViewStatus === "checking" ? "CHECKING STREET VIEW" : "OPEN STREET VIEW"}</button><button type="button" onClick={() => void openKartaView()} disabled={kartaViewStatus === "loading"} className="pointer-events-auto border border-emerald-300/70 bg-emerald-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{kartaViewStatus === "loading" ? "LOADING KARTAVIEW" : "OPEN KARTAVIEW"}</button><button type="button" onClick={showNbiContext} disabled={mapState !== "ready"} className="pointer-events-auto border border-violet-300/70 bg-violet-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">FOCUS PUBLIC NBI CONTEXT</button><a className="pointer-events-auto border border-slate-500 px-2.5 py-1.5 text-[9px] font-bold text-slate-100" href="https://geodata.bts.gov/datasets/usdot::national-bridge-inventory/about" target="_blank" rel="noreferrer">NBI SOURCE</a></div>
    {kartaViewOpen && <div className="absolute bottom-16 right-3 z-20 w-[min(430px,calc(100%-1.5rem))] overflow-hidden border border-emerald-300/60 bg-slate-950/98 p-3 text-slate-100 shadow-2xl" role="dialog" aria-label="KartaView street-level imagery"><div className="flex items-start justify-between gap-3"><div><span className="block text-[9px] font-bold uppercase tracking-[.14em] text-emerald-300">KARTAVIEW · STREET-LEVEL IMAGERY</span><strong className="mt-1 block text-sm text-white">Public street reference</strong><span className="mt-1 block text-[10px] text-slate-400">Near {kartaViewCenter.lat.toFixed(6)}, {kartaViewCenter.lng.toFixed(6)} · radius 500 m</span></div><button type="button" onClick={() => setKartaViewOpen(false)} className="border border-slate-600 px-2 py-1 text-[9px] font-bold text-slate-200">CLOSE</button></div>{kartaViewStatus === "loading" && <div className="mt-4 border border-slate-700 bg-slate-900 p-5 text-center text-[10px] uppercase tracking-[.12em] text-slate-300">Searching nearby public imagery…</div>}{kartaViewStatus === "error" && <div className="mt-4 border border-amber-800 bg-amber-950/60 p-4 text-xs leading-5 text-amber-100">KartaView could not be reached. Check the browser connection and try again.</div>}{kartaViewStatus === "empty" && <div className="mt-4 border border-slate-700 bg-slate-900 p-4 text-xs leading-5 text-slate-300">No public KartaView image was found within 500 m of this coordinate. This does not mean the asset has no defect.</div>}{kartaViewStatus === "ready" && selectedKartaViewPhoto && <><img className="mt-3 block max-h-64 w-full object-cover" src={selectedKartaViewPhoto.imageUrl} alt="KartaView public street-level reference" /><div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-300"><span>IMAGE GPS<br /><b className="text-white">{selectedKartaViewPhoto.latitude.toFixed(6)}, {selectedKartaViewPhoto.longitude.toFixed(6)}</b></span><span>CAPTURED<br /><b className="text-white">{selectedKartaViewPhoto.shotDate ?? "Date unavailable"}</b></span></div><div className="mt-3 flex flex-wrap gap-1.5">{kartaViewPhotos.map(photo => <button key={photo.id} type="button" onClick={() => setSelectedKartaViewPhoto(photo)} className={cn("h-10 w-14 overflow-hidden border", selectedKartaViewPhoto.id === photo.id ? "border-emerald-300" : "border-slate-700")} aria-label={`Select KartaView image ${photo.id}`}><img className="h-full w-full object-cover" src={photo.imageUrl} alt="" /></button>)}</div></>}{kartaViewStatus === "ready" && <p className="mt-3 text-[10px] leading-4 text-amber-200">Public third-party imagery only. It is not DRIFT evidence, not a crack confirmation, and not an engineering determination.</p>}</div>}
    {streetViewStatus === "unavailable" && <div className="absolute bottom-16 left-3 z-10 max-w-xs bg-amber-950/95 px-3 py-2 text-[10px] leading-4 text-amber-50 shadow-xl" role="status">Street View is not available within 250 m of this selected coordinate. No imagery is substituted or treated as DRIFT evidence.</div>}
    {streetViewStatus === "open" && <div className="absolute bottom-16 left-3 z-10 max-w-xs bg-sky-950/95 px-3 py-2 text-[10px] leading-4 text-sky-50 shadow-xl" role="status">Public Street View opened for the selected coordinate. It is third-party public imagery, not DRIFT evidence or a defect confirmation.</div>}
  </section>;
}
