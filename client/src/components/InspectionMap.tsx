import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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
  const configuredMapId = typeof options.map.get === "function" ? options.map.get("mapId") : undefined;
  const AdvancedMarkerElement = configuredMapId && configuredMapId !== "DEMO_MAP_ID" ? window.google.maps.marker?.AdvancedMarkerElement : undefined;
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

function fallbackMapPosition(point: { lat: number; lng: number }, points: Array<{ lat: number; lng: number }>) {
  const latitudes = points.map(item => item.lat);
  const longitudes = points.map(item => item.lng);
  const minLat = Math.min(...latitudes, point.lat);
  const maxLat = Math.max(...latitudes, point.lat);
  const minLng = Math.min(...longitudes, point.lng);
  const maxLng = Math.max(...longitudes, point.lng);
  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const lngSpan = Math.max(maxLng - minLng, 0.0001);
  return { left: `${8 + ((point.lng - minLng) / lngSpan) * 84}%`, top: `${8 + (1 - (point.lat - minLat) / latSpan) * 76}%` };
}

export function InspectionMap({ defects, telemetry, selectedId, streetViewRequest = 0, onSelect, className }: InspectionMapProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const leafletElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletLayerRef = useRef<L.LayerGroup | null>(null);
  const projectMarkers = useRef<MapMarker[]>([]);
  const contextMarkers = useRef<MapMarker[]>([]);
  const completedStreetViewRequest = useRef(0);
  const [mapState, setMapState] = useState<"loading" | "ready" | "fallback">("fallback");
  const [streetViewStatus, setStreetViewStatus] = useState<"idle" | "checking" | "open" | "unavailable">("idle");
  const [kartaViewStatus, setKartaViewStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [kartaViewPhotos, setKartaViewPhotos] = useState<KartaViewPhoto[]>([]);
  const [kartaViewOpen, setKartaViewOpen] = useState(false);
  const [selectedKartaViewPhoto, setSelectedKartaViewPhoto] = useState<KartaViewPhoto | null>(null);
  const [telemetryVisible, setTelemetryVisible] = useState(false);
  const googleMapsEnabled = import.meta.env.VITE_ENABLE_GOOGLE_MAPS === "true";
  const apiKey = googleMapsEnabled ? import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() : undefined;
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim();
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
    let tileLoaded = false;
    const fallbackTimer = window.setTimeout(() => { if (!cancelled && !tileLoaded) setMapState("fallback"); }, 7000);
    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || authFailed || !mapElement.current) return;
      const center = validDefects[0]?.point ?? { lat: publicNbiBridgeContext[0]!.latitude, lng: publicNbiBridgeContext[0]!.longitude };
      mapRef.current = new window.google.maps.Map(mapElement.current, { center, zoom: validDefects.length ? 14 : 6, ...(mapId ? { mapId } : {}), mapTypeControl: true, streetViewControl: true, fullscreenControl: true, clickableIcons: false, gestureHandling: "cooperative" });
      mapRef.current.addListener("tilesloaded", () => { tileLoaded = true; window.clearTimeout(fallbackTimer); });
      setMapState("ready");
    }).catch(() => { if (!cancelled) setMapState("fallback"); });
    return () => { cancelled = true; window.clearTimeout(fallbackTimer); if (windowWithMapsAuth.gm_authFailure === authFailureHandler) delete windowWithMapsAuth.gm_authFailure; };
  }, [apiKey, mapId]);

  useEffect(() => {
    if (mapState !== "fallback" || !leafletElement.current) return;
    const center = selectedDefect?.point ?? validDefects[0]?.point ?? validTelemetry[0] ?? { lat: publicNbiBridgeContext[0]!.latitude, lng: publicNbiBridgeContext[0]!.longitude };
    const map = leafletMapRef.current ?? L.map(leafletElement.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], validDefects.length ? 13 : 7);
    leafletMapRef.current = map;
    if (!map.getPane("tilePane")) return;
    if (!map.getPane("driftTiles")) {
      map.createPane("driftTiles");
      map.getPane("driftTiles")!.style.zIndex = "200";
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 20, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>', pane: "driftTiles" }).addTo(map);
    }
    leafletLayerRef.current?.clearLayers();
    const layer = leafletLayerRef.current ?? L.layerGroup().addTo(map);
    leafletLayerRef.current = layer;
    const points = validDefects.map(item => item.point);
    validDefects.forEach(({ defect, point }, index) => {
      const marker = L.circleMarker([point.lat, point.lng], { radius: selectedId === defect.id ? 13 : 9, color: "#ffffff", weight: selectedId === defect.id ? 4 : 2, fillColor: colors[defect.severity], fillOpacity: 0.92 }).addTo(layer);
      marker.bindTooltip(`${defect.isTransient || defect.id < 0 ? `Advisory ${index + 1}` : defect.severity.toUpperCase()} · ${defect.label}`, { direction: "top", offset: [0, -8] });
      marker.on("click", () => onSelect(defect.id));
    });
    if (shouldShowTelemetry) validTelemetry.forEach(point => L.circleMarker([point.lat, point.lng], { radius: 4, color: "#cffafe", weight: 1, fillColor: "#06b6d4", fillOpacity: 0.75 }).addTo(layer));
    if (!validDefects.length && !validTelemetry.length) publicNbiBridgeContext.forEach(context => L.circleMarker([context.latitude, context.longitude], { radius: 6, color: "#ede9fe", weight: 2, fillColor: "#7c3aed", fillOpacity: 0.85 }).bindTooltip(`NBI context · ${context.title}`, { direction: "top" }).addTo(layer));
    const boundsPoints = [...points, ...(shouldShowTelemetry ? validTelemetry : []), ...(!validDefects.length && !validTelemetry.length ? publicNbiBridgeContext.map(context => ({ lat: context.latitude, lng: context.longitude })) : [])];
    if (boundsPoints.length > 1) map.fitBounds(L.latLngBounds(boundsPoints.map(point => [point.lat, point.lng] as [number, number])).pad(0.16), { maxZoom: validDefects.length ? 15 : 7 });
    else map.setView([center.lat, center.lng], 13);
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => { layer.clearLayers(); };
  }, [mapState, onSelect, selectedDefect, selectedId, shouldShowTelemetry, validDefects, validTelemetry]);

  useEffect(() => {
    return () => { leafletMapRef.current?.remove(); leafletMapRef.current = null; leafletLayerRef.current = null; };
  }, []);

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
    const panorama = map.getStreetView?.();
    panorama?.setVisible?.(false);
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
    const panorama = map.getStreetView?.();
    panorama?.setVisible?.(false);
    map.fitBounds(bounds, 60);
  };
  const focusTemporaryGrid = () => {
    const map = mapRef.current;
    if (!map || !window.google?.maps || !transientDefects.length) return;
    const bounds = new window.google.maps.LatLngBounds();
    transientDefects.forEach(item => bounds.extend(item.point));
    const panorama = map.getStreetView?.();
    panorama?.setVisible?.(false);
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
      const panorama = map.getStreetView?.();
      if (!panorama) throw new Error("Street View panorama is unavailable");
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

  return <section className={cn("relative min-h-[500px] overflow-hidden border border-slate-700 bg-slate-950", className)} aria-label="DRIFT infrastructure inspection map · Google Maps infrastructure context optional">
    <div ref={mapElement} className={cn("absolute inset-0", mapState === "fallback" && "hidden")} />
    {mapState === "loading" && <div className="absolute inset-0 grid place-items-center bg-slate-950 text-center text-xs font-semibold uppercase tracking-[.14em] text-slate-200">Loading Google Maps context…</div>}
    {mapState === "fallback" && <div className="absolute inset-0 z-10 overflow-auto bg-slate-950/62 p-5 text-slate-100"><div className="mx-auto max-w-3xl"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="block text-[10px] font-bold uppercase tracking-[.16em] text-amber-300">STREET IMAGERY MODE</span><strong className="mt-1 block text-lg text-white">Circular evidence map active</strong><p className="mt-2 max-w-xl text-xs leading-5 text-slate-300">The inspection workspace is still usable. Select a circular point or finding below to keep review context, or open its coordinates in Google Maps. No invented map imagery is substituted.</p></div><span className="border border-amber-300/60 bg-amber-950/70 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[.1em] text-amber-100">{validDefects.length} FINDINGS · {validTelemetry.length} TELEMETRY</span></div><div ref={leafletElement} className="real-tile-map h-64 w-full rounded border border-emerald-300/50" aria-label="Real OpenStreetMap geographic map" /><div className="fallback-map-plot" aria-label="Coordinate point index"><span className="fallback-map-axis fallback-map-axis-top">N</span><span className="fallback-map-axis fallback-map-axis-bottom">S</span>{validDefects.map(({ defect, point }, index) => <button key={`plot-${defect.id}`} type="button" className={cn("fallback-map-dot", selectedId === defect.id && "selected")} style={{ ...fallbackMapPosition(point, validDefects.map(item => item.point)), backgroundColor: colors[defect.severity] }} onClick={() => onSelect(defect.id)} title={`${defect.label} · ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`} aria-label={`Map point ${index + 1}: ${defect.label}`}><span>{defect.isTransient || defect.id < 0 ? index + 1 : defect.severity[0]!.toUpperCase()}</span></button>)}{!validDefects.length && validTelemetry.map((point, index) => <span key={`telemetry-plot-${point.lat}-${point.lng}-${index}`} className="fallback-map-dot telemetry" style={fallbackMapPosition(point, validTelemetry)} title={`Telemetry ${index + 1}`}><span>•</span></span>)}<span className="fallback-map-legend">CIRCULAR POINTS · CLICK TO SELECT FINDING</span></div><div className="mt-5 border border-emerald-400/40 bg-emerald-950/50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="block text-[9px] font-bold uppercase tracking-[.14em] text-emerald-300">KARTAVIEW STREET CONTEXT</span><strong className="mt-1 block text-sm text-white">Street-level imagery for the selected point</strong><p className="mt-1 max-w-xl text-[10px] leading-4 text-slate-300">Search public KartaView images within 500 m of the selected finding and review their capture GPS/date in this workbench.</p></div><button type="button" onClick={() => void openKartaView()} disabled={kartaViewStatus === "loading"} className="border border-emerald-300/70 bg-emerald-900/90 px-3 py-2 text-[9px] font-bold uppercase tracking-[.1em] text-white disabled:cursor-not-allowed disabled:opacity-60">{kartaViewStatus === "loading" ? "SEARCHING" : kartaViewStatus === "ready" ? "REFRESH KARTAVIEW" : "OPEN KARTAVIEW"}</button></div>{kartaViewStatus === "ready" && selectedKartaViewPhoto && <div className="mt-3 flex items-center gap-3 text-[10px] text-emerald-100"><img className="h-14 w-20 object-cover" src={selectedKartaViewPhoto.imageUrl} alt="Selected KartaView street reference" /><span>Nearest image: {selectedKartaViewPhoto.latitude.toFixed(6)}, {selectedKartaViewPhoto.longitude.toFixed(6)}<br /><b>{selectedKartaViewPhoto.shotDate ?? "Capture date unavailable"}</b></span></div>}{kartaViewStatus === "empty" && <p className="mt-3 text-[10px] text-amber-200">No KartaView imagery was found within 500 m of this coordinate.</p>}{kartaViewStatus === "error" && <p className="mt-3 text-[10px] text-amber-200">KartaView could not be reached. Try again when the browser connection is available.</p>}</div><div className="mt-5 grid gap-2 sm:grid-cols-2">{validDefects.map(({ defect, point }, index) => <button key={defect.id} type="button" onClick={() => onSelect(defect.id)} className={cn("border p-3 text-left transition", selectedId === defect.id ? "border-emerald-300 bg-emerald-950/70" : "border-slate-700 bg-slate-900 hover:border-slate-400")}><span className="block text-[9px] font-bold uppercase tracking-[.12em]" style={{ color: colors[defect.severity] }}>{defect.isTransient || defect.id < 0 ? `TEMPORARY ADVISORY ${index + 1}` : defect.severity}</span><strong className="mt-1 block text-sm text-white">{defect.label}</strong><span className="mt-1 block text-[10px] text-slate-400">{point.lat.toFixed(6)}, {point.lng.toFixed(6)}</span></button>)}{!validDefects.length && validTelemetry.slice(0, 12).map((point, index) => <div key={`${point.lat}-${point.lng}-${index}`} className="border border-cyan-900 bg-slate-900 p-3"><span className="block text-[9px] font-bold uppercase tracking-[.12em] text-cyan-300">TELEMETRY POINT {index + 1}</span><span className="mt-1 block text-xs text-slate-200">{point.lat.toFixed(6)}, {point.lng.toFixed(6)}</span></div>)}{!validDefects.length && !validTelemetry.length && <div className="border border-slate-700 bg-slate-900 p-4 text-xs text-slate-300">No valid coordinates are available for this view.</div>}</div>{(selectedDefect?.point ?? validTelemetry[0]) && <a className="mt-5 inline-flex border border-sky-300/70 bg-sky-900/80 px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-white" href={`https://www.google.com/maps/search/?api=1&query=${(selectedDefect?.point ?? validTelemetry[0])!.lat},${(selectedDefect?.point ?? validTelemetry[0])!.lng}`} target="_blank" rel="noreferrer">OPEN SELECTED COORDINATE IN GOOGLE MAPS</a>}</div></div>}
    <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] bg-slate-950/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.13em] text-slate-100 shadow-xl"><div>{validDefects.length} displayed advisory point{validDefects.length === 1 ? "" : "s"} · {validTelemetry.length} telemetry {shouldShowTelemetry ? "shown" : "hidden for map clarity"}</div><div className="mt-2 flex flex-wrap gap-2 text-[9px] tracking-[.08em]">{severityCounts.map(item => <span key={item.severity} className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[item.severity] }} />{item.count} {item.severity}</span>)}</div></div>
    <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2 bg-slate-950/95 p-2.5 text-[9px] font-semibold uppercase tracking-[.1em] text-slate-100 shadow-xl"><span className="mr-auto">● numbered temporary advisory · select any marker or report item · ◆ public NBI context</span><button type="button" onClick={focusTemporaryGrid} disabled={!transientDefects.length || mapState !== "ready"} className="pointer-events-auto border border-emerald-300/70 bg-emerald-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">FOCUS 15-POINT GRID</button><button type="button" onClick={() => setTelemetryVisible(current => !current)} disabled={!validTelemetry.length || mapState !== "ready"} className="pointer-events-auto border border-cyan-300/70 bg-cyan-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{shouldShowTelemetry ? "HIDE TELEMETRY" : `SHOW ${validTelemetry.length} TELEMETRY`}</button><button type="button" onClick={openStreetView} disabled={!selectedDefect || mapState !== "ready" || streetViewStatus === "checking"} className="pointer-events-auto border border-sky-300/70 bg-sky-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{streetViewStatus === "checking" ? "CHECKING STREET VIEW" : "OPEN STREET VIEW"}</button><button type="button" onClick={() => void openKartaView()} disabled={kartaViewStatus === "loading"} className="pointer-events-auto border border-emerald-300/70 bg-emerald-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{kartaViewStatus === "loading" ? "LOADING KARTAVIEW" : "OPEN KARTAVIEW"}</button><button type="button" onClick={showNbiContext} disabled={mapState !== "ready"} className="pointer-events-auto border border-violet-300/70 bg-violet-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">FOCUS PUBLIC NBI CONTEXT</button><a className="pointer-events-auto border border-slate-500 px-2.5 py-1.5 text-[9px] font-bold text-slate-100" href="https://geodata.bts.gov/datasets/usdot::national-bridge-inventory/about" target="_blank" rel="noreferrer">NBI SOURCE</a></div>
    {kartaViewOpen && <div className="absolute bottom-16 right-3 z-20 w-[min(430px,calc(100%-1.5rem))] overflow-hidden border border-emerald-300/60 bg-slate-950/98 p-3 text-slate-100 shadow-2xl" role="dialog" aria-label="KartaView street-level imagery"><div className="flex items-start justify-between gap-3"><div><span className="block text-[9px] font-bold uppercase tracking-[.14em] text-emerald-300">KARTAVIEW · STREET-LEVEL IMAGERY</span><strong className="mt-1 block text-sm text-white">Public street reference</strong><span className="mt-1 block text-[10px] text-slate-400">Near {kartaViewCenter.lat.toFixed(6)}, {kartaViewCenter.lng.toFixed(6)} · radius 500 m</span></div><button type="button" onClick={() => setKartaViewOpen(false)} className="border border-slate-600 px-2 py-1 text-[9px] font-bold text-slate-200">CLOSE</button></div>{kartaViewStatus === "loading" && <div className="mt-4 border border-slate-700 bg-slate-900 p-5 text-center text-[10px] uppercase tracking-[.12em] text-slate-300">Searching nearby public imagery…</div>}{kartaViewStatus === "error" && <div className="mt-4 border border-amber-800 bg-amber-950/60 p-4 text-xs leading-5 text-amber-100">KartaView could not be reached. Check the browser connection and try again.</div>}{kartaViewStatus === "empty" && <div className="mt-4 border border-slate-700 bg-slate-900 p-4 text-xs leading-5 text-slate-300">No public KartaView image was found within 500 m of this coordinate. This does not mean the asset has no defect.</div>}{kartaViewStatus === "ready" && selectedKartaViewPhoto && <><img className="mt-3 block max-h-64 w-full object-cover" src={selectedKartaViewPhoto.imageUrl} alt="KartaView public street-level reference" /><div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-300"><span>IMAGE GPS<br /><b className="text-white">{selectedKartaViewPhoto.latitude.toFixed(6)}, {selectedKartaViewPhoto.longitude.toFixed(6)}</b></span><span>CAPTURED<br /><b className="text-white">{selectedKartaViewPhoto.shotDate ?? "Date unavailable"}</b></span></div><div className="mt-3 flex flex-wrap gap-1.5">{kartaViewPhotos.map(photo => <button key={photo.id} type="button" onClick={() => setSelectedKartaViewPhoto(photo)} className={cn("h-10 w-14 overflow-hidden border", selectedKartaViewPhoto.id === photo.id ? "border-emerald-300" : "border-slate-700")} aria-label={`Select KartaView image ${photo.id}`}><img className="h-full w-full object-cover" src={photo.imageUrl} alt="" /></button>)}</div></>}{kartaViewStatus === "ready" && <p className="mt-3 text-[10px] leading-4 text-amber-200">Public third-party imagery only. It is not DRIFT evidence, not a crack confirmation, and not an engineering determination.</p>}</div>}
    {streetViewStatus === "unavailable" && <div className="absolute bottom-16 left-3 z-10 max-w-xs bg-amber-950/95 px-3 py-2 text-[10px] leading-4 text-amber-50 shadow-xl" role="status">Street View is not available within 250 m of this selected coordinate. No imagery is substituted or treated as DRIFT evidence.</div>}
    {streetViewStatus === "open" && <div className="absolute bottom-16 left-3 z-10 max-w-xs bg-sky-950/95 px-3 py-2 text-[10px] leading-4 text-sky-50 shadow-xl" role="status">Public Street View opened for the selected coordinate. It is third-party public imagery, not DRIFT evidence or a defect confirmation.</div>}
  </section>;
}
