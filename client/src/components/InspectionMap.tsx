/// <reference types="google.maps" />
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { VERIFIED_CAMPUS_COORDINATES } from "@shared/campusCoordinates";
import { CAMPUS_MAP_DATA, CAMPUS_REFERENCE_RADIUS_METERS, campusPopupHtml, campusPopupText } from "@shared/campusMapData";

type Severity = "low" | "medium" | "high" | "critical";
type MapDefect = { id: number; label: string; severity: Severity; latitude: string | number; longitude: string | number; isTransient?: boolean };
type InspectionMapProps = { defects: MapDefect[]; telemetry: Array<{ latitude: string | number; longitude: string | number }>; selectedId?: number; streetViewRequest?: number; onSelect: (id: number) => void; className?: string };

const colors: Record<Severity, string> = { critical: "#c81e1e", high: "#e26d16", medium: "#b98600", low: "#177a47" };

// Global Google Maps auth/billing failure handler. Set by the map component
// so that any auth failure (including BillingNotEnabledMapError) falls back to Leaflet.
declare global {
  interface Window {
    gm_authFailure?: () => void;
    __driftGoogleMapsReady?: () => void;
  }
}

let googleMapsPromise: Promise<typeof google> | null = null;

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps && typeof window.google.maps.Map === "function") return Promise.resolve(window.google);
  if (googleMapsPromise) return googleMapsPromise;

  const promise = new Promise<typeof google>((resolve, reject) => {
    const existing = document.getElementById("drift-google-maps-sdk") as HTMLScriptElement | null;
    const previousReady = window.__driftGoogleMapsReady;
    const previousAuthFailure = window.gm_authFailure;
    let settled = false;

    const cleanup = () => {
      if (window.__driftGoogleMapsReady === onReady) {
        if (previousReady) window.__driftGoogleMapsReady = previousReady;
        else delete window.__driftGoogleMapsReady;
      }
      if (window.gm_authFailure === onAuthFailure) {
        if (previousAuthFailure) window.gm_authFailure = previousAuthFailure;
        else delete window.gm_authFailure;
      }
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const waitForConstructor = () => {
      if (settled) return;
      if (window.google?.maps && typeof window.google.maps.Map === "function") {
        settled = true;
        cleanup();
        resolve(window.google);
        return;
      }
      window.setTimeout(waitForConstructor, 50);
    };

    const onReady = () => waitForConstructor();
    const onAuthFailure = () => {
      previousAuthFailure?.();
      fail("Google Maps authentication or billing failed.");
    };

    window.__driftGoogleMapsReady = onReady;
    window.gm_authFailure = onAuthFailure;

    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", () => fail("Google Maps could not be loaded."), { once: true });
      waitForConstructor();
      return;
    }

    const script = document.createElement("script");
    script.id = "drift-google-maps-sdk";
    // Use the script load event and constructor check as the single readiness path.
    // Use Google's recommended async loading mode, but omit the global callback.
    // Readiness is driven by the script load event and constructor check below.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&libraries=marker`;
    script.async = true;
    script.defer = true;
    script.onload = onReady;
    script.onerror = () => fail("Google Maps could not be loaded. Verify the API key and that billing is enabled for the project.");
    document.head.appendChild(script);
  });

  googleMapsPromise = promise.catch(error => {
    googleMapsPromise = null;
    throw error;
  });
  return googleMapsPromise;
}

function asCoordinates(value: { latitude: string | number; longitude: string | number }) {
  const lat = Number(value.latitude);
  const lng = Number(value.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
}

/* ─── Leaflet fallback map (no Google Maps key required) ─── */

function loadLeafletCSS() {
  if (document.getElementById("leaflet-css")) return;
  const link = document.createElement("link");
  link.id = "leaflet-css";
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
}

function LeafletFallbackMap({ defects, telemetry, selectedId, onSelect }: {
  defects: Array<{ defect: MapDefect; point: { lat: number; lng: number } }>;
  telemetry: Array<{ lat: number; lng: number }>;
  selectedId?: number;
  onSelect: (id: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);

  // Load Leaflet dynamically
  useEffect(() => {
    loadLeafletCSS();
    if ((window as any).L) { setReady(true); return; }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, []);

  // Init map
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const L = (window as any).L;
    const allPoints = [...defects.map(d => d.point), ...telemetry];
    const center = allPoints.length
      ? { lat: allPoints.reduce((s, p) => s + p.lat, 0) / allPoints.length, lng: allPoints.reduce((s, p) => s + p.lng, 0) / allPoints.length }
      : { lat: 28.6139, lng: 77.209 };

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: defects.length > 0 ? 13 : 11,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // These are official campus reference points, not surveyed boundaries.
    const campusPoints = [
      [VERIFIED_CAMPUS_COORDINATES.IGDTUW, CAMPUS_MAP_DATA.IGDTUW, [60, 20]],
      [VERIFIED_CAMPUS_COORDINATES.IIIT_DELHI, CAMPUS_MAP_DATA.IIIT_DELHI, [70, 20]],
    ] as const;
    campusPoints.forEach(([point, campus, iconSize]) => {
      L.marker([point.latitude, point.longitude], { icon: L.divIcon({ className: "campus-marker", html: `<div style="background:${campus.color};color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;white-space:nowrap">${campus.shortName}</div>`, iconSize, iconAnchor: [iconSize[0] / 2, 10] }) })
        .bindPopup(campusPopupText(campus)).addTo(map);
      L.circle([point.latitude, point.longitude], { radius: CAMPUS_REFERENCE_RADIUS_METERS, color: campus.color, fillColor: campus.color, fillOpacity: 0.08, weight: 1, dashArray: "4 4" }).bindTooltip(`${campus.shortName} · approximate reference area`).addTo(map);
    });

    return () => { map.remove(); mapRef.current = null; };
  }, [ready]);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !(window as any).L) return;
    const L = (window as any).L;

    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Add defect markers
    const bounds: any[] = [];
    defects.forEach(({ defect, point }) => {
      const isSelected = defect.id === selectedId;
      const color = colors[defect.severity];
      const size = isSelected ? 18 : 12;
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: size / 2,
        fillColor: color,
        color: "#fff",
        weight: isSelected ? 3 : 2,
        fillOpacity: 0.9,
      }).addTo(map);

      marker.bindPopup(`<div style="font:13px Arial,sans-serif"><strong>${defect.label}</strong><br/>Severity: ${defect.severity}<br/>GPS: ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}<br/><em>Engineer review required.</em></div>`);
      marker.on("click", () => onSelect(defect.id));
      markersRef.current.push(marker);
      bounds.push([point.lat, point.lng]);
    });

    // Add telemetry dots
    telemetry.forEach(point => {
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: 2, fillColor: "#16b7d4", color: "#fff", weight: 0.5, fillOpacity: 0.5,
      }).addTo(map);
      markersRef.current.push(marker);
      bounds.push([point.lat, point.lng]);
    });

    // Add campus reference points to bounds (campus markers themselves are created in init effect)
    bounds.push([VERIFIED_CAMPUS_COORDINATES.IGDTUW.latitude, VERIFIED_CAMPUS_COORDINATES.IGDTUW.longitude], [VERIFIED_CAMPUS_COORDINATES.IIIT_DELHI.latitude, VERIFIED_CAMPUS_COORDINATES.IIIT_DELHI.longitude]);

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [defects, telemetry, selectedId, onSelect]);

  // Pan to selected defect
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const found = defects.find(d => d.defect.id === selectedId);
    if (found) map.flyTo([found.point.lat, found.point.lng], Math.max(map.getZoom() ?? 14, 15));
  }, [selectedId, defects]);

  return <div ref={containerRef} className="absolute inset-0" style={{ minHeight: 500, background: "#e5e7eb" }} />;
}

/* ─── Main InspectionMap component ─── */

export function InspectionMap({ defects, telemetry, selectedId, streetViewRequest = 0, onSelect, className }: InspectionMapProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const projectOverlays = useRef<Array<{ setMap: (map: google.maps.Map | null) => void } | { map?: google.maps.Map | null }>>([]);
  const completedStreetViewRequest = useRef(0);
  const [mapState, setMapState] = useState<"loading" | "ready" | "missing-key" | "error">("loading");
  const [streetViewStatus, setStreetViewStatus] = useState<"idle" | "checking" | "open" | "unavailable">("idle");
  const [telemetryVisible, setTelemetryVisible] = useState(false);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  const validDefects = useMemo(() => defects.map(defect => ({ defect, point: asCoordinates(defect) })).filter((item): item is { defect: MapDefect; point: { lat: number; lng: number } } => Boolean(item.point)), [defects]);
  const validTelemetry = useMemo(() => telemetry.map(asCoordinates).filter((point): point is { lat: number; lng: number } => Boolean(point)), [telemetry]);
  const shouldShowTelemetry = telemetryVisible || validDefects.length === 0;
  const severityCounts = useMemo(() => (Object.keys(colors) as Severity[]).map(severity => ({ severity, count: validDefects.filter(item => item.defect.severity === severity).length })), [validDefects]);
  const selectedDefect = useMemo(() => validDefects.find(item => item.defect.id === selectedId) ?? null, [selectedId, validDefects]);
  const transientDefects = useMemo(() => validDefects.filter(item => item.defect.isTransient === true || item.defect.id < 0), [validDefects]);

  const [useLeaflet, setUseLeaflet] = useState(!apiKey);

  // Google Maps path
  useEffect(() => {
    if (!apiKey) { setUseLeaflet(true); setMapState("missing-key"); return; }
    let cancelled = false;
    const previousAuthFailure = window.gm_authFailure;
    const handleAuthFailure = () => {
      previousAuthFailure?.();
      if (cancelled) return;
      console.warn("[InspectionMap] Google Maps auth/billing failure — falling back to Leaflet.");
      setUseLeaflet(true);
      setMapState("error");
    };
    window.gm_authFailure = handleAuthFailure;
    setMapState("loading");
    setUseLeaflet(false);
    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !mapElement.current) return;
      const center = validDefects[0]?.point ?? { lat: 28.6139, lng: 77.209 };
      // Detect billing-not-enabled or any other Maps runtime error and fall back to Leaflet.
      try {
        mapRef.current = new window.google.maps.Map(mapElement.current, { center, zoom: validDefects.length ? 13 : 11, mapId: "DEMO_MAP_ID", mapTypeControl: true, streetViewControl: true, fullscreenControl: true, clickableIcons: false, gestureHandling: "cooperative" });
        setMapState("ready");
      } catch (err) {
        console.warn("[InspectionMap] Google Maps failed to initialize, falling back to Leaflet:", err);
        if (!cancelled) { setUseLeaflet(true); setMapState("error"); }
      }
    }).catch((err) => {
      if (!cancelled) { console.warn("[InspectionMap] Google Maps load failed, using Leaflet:", err?.message); setUseLeaflet(true); setMapState("error"); }
    });
    return () => {
      cancelled = true;
      if (window.gm_authFailure === handleAuthFailure) {
        if (previousAuthFailure) window.gm_authFailure = previousAuthFailure;
        else delete window.gm_authFailure;
      }
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready" || !window.google?.maps) return;
    projectOverlays.current.forEach(overlay => { if ("setMap" in overlay) overlay.setMap(null); else overlay.map = null; });
    projectOverlays.current = [];
    const bounds = new window.google.maps.LatLngBounds();
    const infoWindow = new window.google.maps.InfoWindow();

    const createMarker = (options: { position: google.maps.LatLngLiteral; title?: string; label?: string; color: string; size: number; opacity?: number }) => {
      const content = document.createElement("div");
      content.textContent = options.label ?? "";
      Object.assign(content.style, {
        width: `${options.size}px`, height: `${options.size}px`, borderRadius: "50%",
        display: "grid", placeItems: "center", boxSizing: "border-box",
        background: options.color, opacity: String(options.opacity ?? 1),
        border: "2px solid #ffffff", color: "#ffffff", font: "700 10px Arial, sans-serif",
        textAlign: "center", whiteSpace: "nowrap", transform: "translate(-50%, -50%)",
      });
      return new window.google.maps.marker.AdvancedMarkerElement({ map, position: options.position, title: options.title, content });
    };

    validDefects.forEach(({ defect, point }, index) => {
      const isTransient = defect.isTransient === true || defect.id < 0;
      const selected = selectedId === defect.id;
      const marker = createMarker({ position: point, title: defect.label, label: isTransient ? String(index + 1) : defect.severity[0]!.toUpperCase(), color: colors[defect.severity], size: selected ? 30 : 20 });
      marker.addEventListener("gmp-click", () => {
        onSelect(defect.id);
        setStreetViewStatus("idle");
        infoWindow.setContent(`<div style="max-width:240px;font:13px Arial,sans-serif"><strong>${defect.label}</strong><br/>Severity: ${defect.severity}<br/>GPS: ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}<br/><em>Engineer review required.</em></div>`);
        infoWindow.open({ map, anchor: marker });
      });
      projectOverlays.current.push(marker);
      bounds.extend(point);
    });

    if (shouldShowTelemetry) {
      validTelemetry.forEach(point => {
        const marker = createMarker({ position: point, color: "#16b7d4", size: 8, opacity: .55 });
        projectOverlays.current.push(marker);
        if (!validDefects.length) bounds.extend(point);
      });
    }

    // Official campus reference points plus a clearly approximate context radius.
    const igdtuwMarker = createMarker({ position: { lat: VERIFIED_CAMPUS_COORDINATES.IGDTUW.latitude, lng: VERIFIED_CAMPUS_COORDINATES.IGDTUW.longitude }, title: CAMPUS_MAP_DATA.IGDTUW.name, label: "IGDTUW", color: CAMPUS_MAP_DATA.IGDTUW.color, size: 20 });
    igdtuwMarker.addEventListener("gmp-click", () => { infoWindow.setContent(campusPopupHtml(CAMPUS_MAP_DATA.IGDTUW)); infoWindow.open({ map, anchor: igdtuwMarker }); });
    projectOverlays.current.push(igdtuwMarker);
    const igdtuwCircle = new window.google.maps.Circle({ map, center: { lat: VERIFIED_CAMPUS_COORDINATES.IGDTUW.latitude, lng: VERIFIED_CAMPUS_COORDINATES.IGDTUW.longitude }, radius: CAMPUS_REFERENCE_RADIUS_METERS, strokeColor: CAMPUS_MAP_DATA.IGDTUW.color, strokeOpacity: 0.65, strokeWeight: 1, fillColor: CAMPUS_MAP_DATA.IGDTUW.color, fillOpacity: 0.08, clickable: false });
    projectOverlays.current.push(igdtuwCircle);
    bounds.extend({ lat: VERIFIED_CAMPUS_COORDINATES.IGDTUW.latitude, lng: VERIFIED_CAMPUS_COORDINATES.IGDTUW.longitude });

    const iiitdMarker = createMarker({ position: { lat: VERIFIED_CAMPUS_COORDINATES.IIIT_DELHI.latitude, lng: VERIFIED_CAMPUS_COORDINATES.IIIT_DELHI.longitude }, title: CAMPUS_MAP_DATA.IIIT_DELHI.name, label: "IIIT-D", color: CAMPUS_MAP_DATA.IIIT_DELHI.color, size: 20 });
    iiitdMarker.addEventListener("gmp-click", () => { infoWindow.setContent(campusPopupHtml(CAMPUS_MAP_DATA.IIIT_DELHI)); infoWindow.open({ map, anchor: iiitdMarker }); });
    projectOverlays.current.push(iiitdMarker);
    const iiitdCircle = new window.google.maps.Circle({ map, center: { lat: VERIFIED_CAMPUS_COORDINATES.IIIT_DELHI.latitude, lng: VERIFIED_CAMPUS_COORDINATES.IIIT_DELHI.longitude }, radius: CAMPUS_REFERENCE_RADIUS_METERS, strokeColor: CAMPUS_MAP_DATA.IIIT_DELHI.color, strokeOpacity: 0.65, strokeWeight: 1, fillColor: CAMPUS_MAP_DATA.IIIT_DELHI.color, fillOpacity: 0.08, clickable: false });
    projectOverlays.current.push(iiitdCircle);
    bounds.extend({ lat: VERIFIED_CAMPUS_COORDINATES.IIIT_DELHI.latitude, lng: VERIFIED_CAMPUS_COORDINATES.IIIT_DELHI.longitude });

    if (validDefects.length || (shouldShowTelemetry && validTelemetry.length)) map.fitBounds(bounds, 54);
  }, [mapState, onSelect, selectedId, shouldShowTelemetry, validDefects, validTelemetry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready" || !selectedDefect) return;
    map.getStreetView().setVisible(false);
    map.panTo(selectedDefect.point);
    map.setZoom(Math.max(map.getZoom() ?? 15, 16));
  }, [mapState, selectedDefect]);

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
      const response = await new window.google.maps.StreetViewService().getPanorama({ location: selectedDefect.point, radius: 1000, source: window.google.maps.StreetViewSource.DEFAULT });
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

  // Leaflet fallback rendering
  if (useLeaflet) {
    return (
      <section className={cn("relative min-h-[500px] overflow-hidden border border-slate-200 bg-gray-100", className)} aria-label="Map infrastructure context">
        <LeafletFallbackMap defects={validDefects} telemetry={validTelemetry} selectedId={selectedId} onSelect={onSelect} />
        <div className="pointer-events-none absolute left-3 top-3 z-[1000] max-w-[calc(100%-1.5rem)] bg-white/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.13em] text-gray-700 shadow-xl rounded">
          <div>{validDefects.length} defect{validDefects.length === 1 ? "" : "s"} displayed &middot; {validTelemetry.length} telemetry {shouldShowTelemetry ? "points" : "hidden"}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-[9px] tracking-[.08em]">{severityCounts.map(item => <span key={item.severity} className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[item.severity] }} />{item.count} {item.severity}</span>)}</div>
        </div>
        <div className="absolute bottom-3 left-3 right-3 z-[1000] flex flex-wrap items-center gap-2 bg-white/95 p-2.5 text-[9px] font-semibold uppercase tracking-[.1em] text-gray-700 shadow-xl rounded">
          <span className="mr-auto">Defect markers &middot; Campus boundaries (IGDTUW + IIIT-Delhi) &middot; OpenStreetMap tiles</span>
          <a className="pointer-events-auto border border-gray-300 px-2.5 py-1.5 text-[9px] font-bold text-gray-700 rounded hover:bg-gray-100" href="https://www.openstreetmap.org/" target="_blank" rel="noreferrer">OPENSTREETMAP</a>
        </div>
      </section>
    );
  }

  // Google Maps rendering
  return <section className={cn("relative min-h-[500px] overflow-hidden border border-slate-700 bg-slate-950", className)} aria-label="Google Maps infrastructure context">
    <div ref={mapElement} className="absolute inset-0" />
    {mapState === "loading" && <div className="absolute inset-0 grid place-items-center bg-slate-950 text-center text-xs font-semibold uppercase tracking-[.14em] text-slate-200">Loading map...</div>}
    {mapState === "missing-key" && <div className="absolute inset-0 grid place-items-center bg-slate-950 p-8 text-center text-xs font-semibold uppercase tracking-[.14em] text-slate-200"><div><strong className="block text-sm text-white">Loading map tiles...</strong><span className="mt-3 block max-w-md normal-case font-normal leading-5 tracking-normal text-slate-400">Map is loading from OpenStreetMap.</span></div></div>}
    {mapState === "error" && <div className="absolute inset-0 grid place-items-center bg-slate-950 p-8 text-center text-xs font-semibold uppercase tracking-[.14em] text-slate-200"><div><strong className="block text-sm text-white">Google Maps could not load</strong><span className="mt-3 block max-w-md normal-case font-normal leading-5 tracking-normal text-slate-400">Set VITE_GOOGLE_MAPS_API_KEY on Vercel to enable Google Maps.</span></div></div>}
    <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] bg-slate-950/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.13em] text-slate-100 shadow-xl"><div>{validDefects.length} defect{validDefects.length === 1 ? "" : "s"} &middot; {validTelemetry.length} telemetry {shouldShowTelemetry ? "points" : "hidden"}</div><div className="mt-2 flex flex-wrap gap-2 text-[9px] tracking-[.08em]">{severityCounts.map(item => <span key={item.severity} className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[item.severity] }} />{item.count} {item.severity}</span>)}</div></div>
    <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2 bg-slate-950/95 p-2.5 text-[9px] font-semibold uppercase tracking-[.1em] text-slate-100 shadow-xl"><span className="mr-auto">Defect markers &middot; Campus boundaries</span><button type="button" onClick={focusTemporaryGrid} disabled={!transientDefects.length || mapState !== "ready"} className="pointer-events-auto border border-emerald-300/70 bg-emerald-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">FOCUS CAMPUSES</button><button type="button" onClick={() => setTelemetryVisible(current => !current)} disabled={!validTelemetry.length || mapState !== "ready"} className="pointer-events-auto border border-cyan-300/70 bg-cyan-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{shouldShowTelemetry ? "HIDE TELEMETRY" : `SHOW ${validTelemetry.length} TELEMETRY`}</button><button type="button" onClick={openStreetView} disabled={!selectedDefect || mapState !== "ready" || streetViewStatus === "checking"} className="pointer-events-auto border border-sky-300/70 bg-sky-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{streetViewStatus === "checking" ? "CHECKING" : "STREET VIEW"}</button></div>
    {streetViewStatus === "unavailable" && <div className="absolute bottom-16 left-3 z-10 max-w-xs bg-amber-950/95 px-3 py-2 text-[10px] leading-4 text-amber-50 shadow-xl" role="status">Street View is not available within 1 km of this coordinate; campus interiors may not have official road imagery.</div>}
    {streetViewStatus === "open" && <div className="absolute bottom-16 left-3 z-10 max-w-xs bg-sky-950/95 px-3 py-2 text-[10px] leading-4 text-sky-50 shadow-xl" role="status">Street View opened for the selected coordinate.</div>}
  </section>;
}
