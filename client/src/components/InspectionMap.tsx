import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { CameraControls, Viewer } from "mapillary-js";
import "mapillary-js/dist/mapillary.css";
import { cn } from "@/lib/utils";

type Severity = "low" | "medium" | "high" | "critical";
type MapDefect = { id: number; label: string; severity: Severity; latitude: string | number; longitude: string | number; isTransient?: boolean };
type InspectionMapProps = { defects: MapDefect[]; telemetry: Array<{ latitude: string | number; longitude: string | number }>; selectedId?: number; imageryRequest?: number; onSelect: (id: number) => void; className?: string };
type PublicBridgeContext = { structureNumber: string; title: string; latitude: number; longitude: number; deckCondition: string; source: string; sourceUrl: string };
type KartaViewPhoto = { id: string; imageUrl: string; latitude: number; longitude: number; heading?: string; shotDate?: string; sequenceId?: string };
type KartaViewResponse = { result?: { data?: Array<{ id?: string | number; imageProcUrl?: string; imageLthUrl?: string; fileurlProc?: string; lat?: string | number; lng?: string | number; heading?: string | number; shotDate?: string; sequenceId?: string | number }> } };
type MapillaryImage = { id: string; latitude: number; longitude: number; thumbnailUrl?: string; isPano: boolean; capturedAt?: string; compassAngle?: number };
type MapillaryResponse = { data?: Array<{ id?: string; computed_geometry?: { coordinates?: [number, number] }; thumb_1024_url?: string; is_pano?: boolean; captured_at?: string; compass_angle?: number }> };
const VERIFIED_360_DEMO: MapillaryImage = { id: "2895209590731209", latitude: 40.7128, longitude: -74.006, isPano: true, capturedAt: "2020-09-16T00:00:00.000Z" };
type MapillaryTileProperties = { id?: number | string; image_id?: number | string; is_pano?: boolean; captured_at?: number; compass_angle?: number };

const colors: Record<Severity, string> = { critical: "#c81e1e", high: "#e26d16", medium: "#b98600", low: "#177a47" };
const publicNbiBridgeContext: PublicBridgeContext[] = [
  { structureNumber: "0518", title: "Johnson River", latitude: 63.704797, longitude: -144.640464, deckCondition: "4", source: "USDOT/BTS NBI 2025", sourceUrl: "https://geodata.bts.gov/datasets/usdot::national-bridge-inventory/about" },
  { structureNumber: "0574", title: "Gulkana River", latitude: 62.268856, longitude: -145.373803, deckCondition: "4", source: "USDOT/BTS NBI 2025", sourceUrl: "https://geodata.bts.gov/datasets/usdot::national-bridge-inventory/about" },
  { structureNumber: "0581", title: "Upper Miller Creek", latitude: 63.375533, longitude: -145.729814, deckCondition: "4", source: "USDOT/BTS NBI 2025", sourceUrl: "https://geodata.bts.gov/datasets/usdot::national-bridge-inventory/about" },
];

function asCoordinates(value: { latitude: string | number; longitude: string | number }) {
  const lat = Number(value.latitude);
  const lng = Number(value.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const radius = 6371000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
}

export function InspectionMap({ defects, telemetry, selectedId, imageryRequest = 0, onSelect, className }: InspectionMapProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const completedImageryRequest = useRef(0);
  const autoImageryDefect = useRef<number | null>(null);
  const [kartaViewStatus, setKartaViewStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [kartaViewPhotos, setKartaViewPhotos] = useState<KartaViewPhoto[]>([]);
  const [kartaViewOpen, setKartaViewOpen] = useState(false);
  const [selectedKartaViewPhoto, setSelectedKartaViewPhoto] = useState<KartaViewPhoto | null>(null);
  const [mapillaryStatus, setMapillaryStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [mapillaryImages, setMapillaryImages] = useState<MapillaryImage[]>([]);
  const [selectedMapillaryImage, setSelectedMapillaryImage] = useState<MapillaryImage | null>(null);
  const [mapillaryOpen, setMapillaryOpen] = useState(false);
  const mapillaryElement = useRef<HTMLDivElement>(null);
  const mapillaryViewer = useRef<Viewer | null>(null);
  const [telemetryVisible, setTelemetryVisible] = useState(false);
  const validDefects = useMemo(() => defects.map(defect => ({ defect, point: asCoordinates(defect) })).filter((item): item is { defect: MapDefect; point: { lat: number; lng: number } } => Boolean(item.point)), [defects]);
  const validTelemetry = useMemo(() => telemetry.map(asCoordinates).filter((point): point is { lat: number; lng: number } => Boolean(point)), [telemetry]);
  const selectedDefect = useMemo(() => validDefects.find(item => item.defect.id === selectedId) ?? null, [selectedId, validDefects]);
  const transientDefects = useMemo(() => validDefects.filter(item => item.defect.isTransient === true || item.defect.id < 0), [validDefects]);
  const showTelemetry = telemetryVisible || validDefects.length === 0;
  const kartaViewCenter = selectedDefect?.point ?? validDefects[0]?.point ?? validTelemetry[0] ?? { lat: publicNbiBridgeContext[0]!.latitude, lng: publicNbiBridgeContext[0]!.longitude };
  const severityCounts = useMemo(() => (Object.keys(colors) as Severity[]).map(severity => ({ severity, count: validDefects.filter(item => item.defect.severity === severity).length })), [validDefects]);
  const selectedImageryOffset = selectedKartaViewPhoto ? distanceMeters(kartaViewCenter, { lat: selectedKartaViewPhoto.latitude, lng: selectedKartaViewPhoto.longitude }) : null;
  const selectedMapillaryOffset = selectedMapillaryImage ? distanceMeters(kartaViewCenter, { lat: selectedMapillaryImage.latitude, lng: selectedMapillaryImage.longitude }) : null;
  const mapillaryToken = (import.meta.env.VITE_MAPILLARY_CLIENT_TOKEN || "").trim();

  const openMapillary = useCallback(async () => {
    setMapillaryOpen(true);
    setMapillaryStatus("loading");
    setSelectedMapillaryImage(null);
    if (!mapillaryToken) {
      setMapillaryImages([]);
      setMapillaryStatus("error");
      return;
    }
    try {
      const zoom = 14;
      const n = 2 ** zoom;
      const centerX = Math.floor((kartaViewCenter.lng + 180) / 360 * n);
      const centerY = Math.floor((1 - Math.asinh(Math.tan(kartaViewCenter.lat * Math.PI / 180)) / Math.PI) / 2 * n);
      const tileToCoordinates = (tileX: number, tileY: number, localX: number, localY: number, extent: number) => {
        const x = (tileX + localX / extent) / n;
        const y = (tileY + localY / extent) / n;
        return { lng: x * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI };
      };
      const tileRequests = [{ tileX: centerX, tileY: centerY }, ...[centerX - 1, centerX, centerX + 1].flatMap(tileX => [centerY - 1, centerY, centerY + 1].map(tileY => ({ tileX, tileY }))).filter(tile => tile.tileX !== centerX || tile.tileY !== centerY)];
      const tileResults: MapillaryImage[][] = [];
      for (const { tileX, tileY } of tileRequests) {
        const result = await (async () => {
        try {
          const tileUrl = `https://tiles.mapillary.com/maps/vtp/mly1_public/2/${zoom}/${tileX}/${tileY}?access_token=${encodeURIComponent(mapillaryToken)}`;
          const response = await fetch(tileUrl, { headers: { Accept: "application/x-protobuf" } });
          if (!response.ok) return [] as MapillaryImage[];
          const tile = new VectorTile(new PbfReader(await response.arrayBuffer()));
          const layer = tile.layers.image;
          if (!layer) return [] as MapillaryImage[];
          const images: MapillaryImage[] = [];
          for (let index = 0; index < layer.length; index += 1) {
            const feature = layer.feature(index);
            const geometry = feature.loadGeometry()[0]?.[0];
            if (!geometry) continue;
            const properties = feature.properties as MapillaryTileProperties;
            const id = String(properties.id ?? properties.image_id ?? "");
            if (!id) continue;
            const coordinates = tileToCoordinates(tileX, tileY, geometry.x, geometry.y, layer.extent);
            images.push({ id, latitude: coordinates.lat, longitude: coordinates.lng, isPano: Boolean(properties.is_pano), capturedAt: properties.captured_at ? new Date(properties.captured_at).toISOString() : undefined, compassAngle: properties.compass_angle });
          }
          return images;
        } catch {
          return [] as MapillaryImage[];
        }
        })();
        tileResults.push(result);
        if (result.length) break;
      }
      const candidates = tileResults.flat();
      const images = Array.from(new Map(candidates.map(image => [image.id, image])).values()).sort((a, b) => Number(b.isPano) - Number(a.isPano) || distanceMeters(kartaViewCenter, { lat: a.latitude, lng: a.longitude }) - distanceMeters(kartaViewCenter, { lat: b.latitude, lng: b.longitude })).slice(0, 24);
      setMapillaryImages(images);
      setSelectedMapillaryImage(images[0] ?? null);
      setMapillaryStatus(images.length ? "ready" : "empty");
    } catch {
      setMapillaryImages([]);
      setSelectedMapillaryImage(null);
      setMapillaryStatus("error");
    }
  }, [kartaViewCenter, mapillaryToken]);

  useEffect(() => {
    if (!mapillaryOpen || !selectedMapillaryImage || !mapillaryElement.current || !mapillaryToken) return;
    mapillaryViewer.current?.remove();
    mapillaryElement.current.replaceChildren();
    try {
      mapillaryViewer.current = new Viewer({ accessToken: mapillaryToken, container: mapillaryElement.current, imageId: selectedMapillaryImage.id, cameraControls: CameraControls.Street, component: { cover: false } });
    } catch {
      setMapillaryStatus("error");
    }
    return () => { mapillaryViewer.current?.remove(); mapillaryViewer.current = null; };
  }, [mapillaryOpen, mapillaryToken, selectedMapillaryImage]);

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

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return;
    const map = L.map(mapElement.current, { zoomControl: true, attributionControl: true }).setView([kartaViewCenter.lat, kartaViewCenter.lng], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
  }, [kartaViewCenter.lat, kartaViewCenter.lng]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    validDefects.forEach(({ defect, point }, index) => {
      const marker = L.circleMarker([point.lat, point.lng], { radius: selectedId === defect.id ? 13 : 9, color: "#ffffff", weight: selectedId === defect.id ? 4 : 2, fillColor: colors[defect.severity], fillOpacity: 0.92 }).addTo(layer);
      marker.bindTooltip(`${defect.isTransient || defect.id < 0 ? `Advisory ${index + 1}` : defect.severity.toUpperCase()} · ${defect.label}`, { direction: "top", offset: [0, -8] });
      marker.on("click", () => onSelect(defect.id));
    });
    if (showTelemetry) validTelemetry.forEach(point => L.circleMarker([point.lat, point.lng], { radius: 4, color: "#cffafe", weight: 1, fillColor: "#06b6d4", fillOpacity: 0.75 }).addTo(layer));
    if (selectedMapillaryImage) L.circleMarker([selectedMapillaryImage.latitude, selectedMapillaryImage.longitude], { radius: 11, color: "#ffffff", weight: 3, fillColor: "#2563eb", fillOpacity: 0.95 }).bindTooltip(`Mapillary ${selectedMapillaryImage.isPano ? "360" : "perspective"} image · ${selectedMapillaryOffset ?? 0} m from advisory`, { direction: "top" }).addTo(layer);
    if (selectedKartaViewPhoto) L.circleMarker([selectedKartaViewPhoto.latitude, selectedKartaViewPhoto.longitude], { radius: 10, color: "#ffffff", weight: 3, fillColor: "#10b981", fillOpacity: 0.95 }).bindTooltip(`KartaView street image · ${selectedImageryOffset ?? 0} m from advisory`, { direction: "top" }).addTo(layer);
    if (!validDefects.length && !validTelemetry.length) publicNbiBridgeContext.forEach(context => L.circleMarker([context.latitude, context.longitude], { radius: 6, color: "#ede9fe", weight: 2, fillColor: "#7c3aed", fillOpacity: 0.85 }).bindTooltip(`NBI context · ${context.title}`, { direction: "top" }).addTo(layer));
    if (validDefects.length) map.setView([selectedDefect?.point.lat ?? validDefects[0]!.point.lat, selectedDefect?.point.lng ?? validDefects[0]!.point.lng], 14);
    else if (validTelemetry.length) map.fitBounds(L.latLngBounds(validTelemetry.map(point => [point.lat, point.lng] as [number, number])).pad(0.16), { maxZoom: 14 });
    else map.fitBounds(L.latLngBounds(publicNbiBridgeContext.map(context => [context.latitude, context.longitude] as [number, number])).pad(0.16), { maxZoom: 7 });
    window.setTimeout(() => map.invalidateSize(), 0);
  }, [onSelect, selectedDefect, selectedId, selectedImageryOffset, selectedKartaViewPhoto, selectedMapillaryImage, selectedMapillaryOffset, showTelemetry, validDefects, validTelemetry]);

  useEffect(() => {
    if (!selectedDefect || autoImageryDefect.current === selectedDefect.defect.id) return;
    autoImageryDefect.current = selectedDefect.defect.id;
    void openMapillary();
    void openKartaView();
  }, [openKartaView, openMapillary, selectedDefect]);

  useEffect(() => {
    if (!imageryRequest || imageryRequest === completedImageryRequest.current || !selectedDefect) return;
    completedImageryRequest.current = imageryRequest;
    void openMapillary();
    void openKartaView();
  }, [imageryRequest, openKartaView, openMapillary, selectedDefect]);

  const focusTemporaryGrid = () => {
    const map = mapRef.current;
    if (!map || !transientDefects.length) return;
    map.fitBounds(L.latLngBounds(transientDefects.map(item => [item.point.lat, item.point.lng] as [number, number])).pad(0.16), { maxZoom: 15 });
  };
  const showNbiContext = () => {
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds(L.latLngBounds(publicNbiBridgeContext.map(point => [point.latitude, point.longitude] as [number, number])).pad(0.16), { maxZoom: 7 });
  };

  return <section className={cn("relative min-h-[500px] overflow-hidden border border-slate-700 bg-slate-950", className)} aria-label="DRIFT real geographic inspection map">
    <div ref={mapElement} className="absolute inset-0" />
    <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] bg-slate-950/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.13em] text-slate-100 shadow-xl"><div>{validDefects.length} displayed advisory point{validDefects.length === 1 ? "" : "s"} · {validTelemetry.length} telemetry {showTelemetry ? "shown" : "hidden for map clarity"}</div><div className="mt-2 flex flex-wrap gap-2 text-[9px] tracking-[.08em]">{severityCounts.map(item => <span key={item.severity} className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[item.severity] }} />{item.count} {item.severity}</span>)}</div></div>
    <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2 bg-slate-950/95 p-2.5 text-[9px] font-semibold uppercase tracking-[.1em] text-slate-100 shadow-xl"><span className="mr-auto">● colored findings · select any marker · ◆ public NBI context</span><button type="button" onClick={focusTemporaryGrid} disabled={!transientDefects.length} className="pointer-events-auto border border-emerald-300/70 bg-emerald-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">FOCUS 15-POINT GRID</button><button type="button" onClick={() => setTelemetryVisible(current => !current)} disabled={!validTelemetry.length} className="pointer-events-auto border border-cyan-300/70 bg-cyan-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{showTelemetry ? "HIDE TELEMETRY" : `SHOW ${validTelemetry.length} TELEMETRY`}</button><button type="button" onClick={() => void openMapillary()} className="pointer-events-auto border border-sky-300/70 bg-sky-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white">{mapillaryStatus === "loading" ? "LOADING 360 VIEW" : "OPEN 360 STREET VIEW"}</button><button type="button" onClick={() => void openKartaView()} className="pointer-events-auto border border-emerald-300/70 bg-emerald-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white">{kartaViewStatus === "loading" ? "LOADING STREET IMAGE" : "OPEN STREET IMAGE"}</button><button type="button" onClick={showNbiContext} className="pointer-events-auto border border-violet-300/70 bg-violet-900/90 px-2.5 py-1.5 text-[9px] font-bold text-white">FOCUS PUBLIC NBI CONTEXT</button><a className="pointer-events-auto border border-slate-500 px-2.5 py-1.5 text-[9px] font-bold text-slate-100" href="https://geodata.bts.gov/datasets/usdot::national-bridge-inventory/about" target="_blank" rel="noreferrer">NBI SOURCE</a></div>
    {mapillaryOpen && <div className="absolute left-3 top-14 z-20 w-[min(340px,calc(100%-1.5rem))] max-h-[calc(100%-7rem)] overflow-y-auto overscroll-contain border-2 border-sky-300/80 bg-slate-950/98 p-2.5 text-slate-100 shadow-2xl md:w-[min(360px,34%)]" role="dialog" aria-label="Mapillary interactive 360 street view"><div className="flex items-start justify-between gap-3"><div><span className="block text-[9px] font-bold uppercase tracking-[.14em] text-sky-300">MAPILLARY · INTERACTIVE STREET VIEW</span><strong className="mt-1 block text-sm text-white">REAL-WORLD 360° / PERSPECTIVE IMAGE</strong><span className="mt-1 block text-[10px] text-slate-400">Search center {kartaViewCenter.lat.toFixed(6)}, {kartaViewCenter.lng.toFixed(6)} · nearest 50 m, then local map area</span></div><button type="button" onClick={() => setMapillaryOpen(false)} className="border border-slate-600 px-2 py-1 text-[9px] font-bold text-slate-200">CLOSE</button></div>{mapillaryStatus === "loading" && <div className="mt-4 border border-slate-700 bg-slate-900 p-5 text-center text-[10px] uppercase tracking-[.12em] text-slate-300">Finding the nearest Mapillary street view…</div>}{mapillaryStatus === "error" && <div className="mt-4 border border-amber-800 bg-amber-950/60 p-4 text-xs leading-5 text-amber-100">Mapillary street view could not load. The token or image service is unavailable. KartaView fallback remains available.</div>}{mapillaryStatus === "empty" && <div className="mt-4 border border-slate-700 bg-slate-900 p-4 text-xs leading-5 text-slate-300">No Mapillary 360 or perspective image was found near this finding. {kartaViewStatus === "ready" && selectedKartaViewPhoto ? "KartaView fallback is available below." : "The KartaView fallback may still load; otherwise try another advisory."}</div>}{mapillaryStatus === "ready" && selectedMapillaryImage && <><div ref={mapillaryElement} className="mt-2 h-40 w-full overflow-hidden bg-black md:h-44" /><div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-300"><span>IMAGE GPS<br /><b className="text-white">{selectedMapillaryImage.latitude.toFixed(6)}, {selectedMapillaryImage.longitude.toFixed(6)}</b></span><span>TYPE / CAPTURED<br /><b className="text-white">{selectedMapillaryImage.isPano ? "360 PANORAMA" : "PERSPECTIVE"} · {selectedMapillaryImage.capturedAt ? new Date(selectedMapillaryImage.capturedAt).toLocaleDateString() : "Date unavailable"}</b></span></div><div className="mt-2 border border-sky-700 bg-sky-950/50 p-2 text-[10px] leading-4 text-sky-100"><b>{selectedMapillaryOffset ?? 0} m from selected advisory</b><br />Blue panel = Mapillary street view; colored map marker = DRIFT advisory. Public imagery is context, not a defect determination.</div><div className="mt-3 flex flex-wrap gap-1.5">{mapillaryImages.map(image => <button key={image.id} type="button" onClick={() => setSelectedMapillaryImage(image)} className={cn("h-10 w-14 overflow-hidden border", selectedMapillaryImage.id === image.id ? "border-sky-300" : "border-slate-700")} aria-label={`Select Mapillary image ${image.id}`}><img className="h-full w-full object-cover" src={image.thumbnailUrl} alt="" /></button>)}</div>{!selectedMapillaryImage.isPano && <button type="button" onClick={() => setSelectedMapillaryImage(VERIFIED_360_DEMO)} className="mt-2 w-full border border-fuchsia-300/70 bg-fuchsia-950/70 px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-fuchsia-100 hover:bg-fuchsia-900">TRY VERIFIED 360 DEMO · NEW YORK</button>}<a className="mt-2 block border border-sky-300/70 bg-sky-900/70 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[.12em] text-white hover:bg-sky-800" href={`https://www.mapillary.com/app/?lat=${selectedMapillaryImage.latitude}&lng=${selectedMapillaryImage.longitude}&z=19&imageKey=${selectedMapillaryImage.id}`} target="_blank" rel="noreferrer">OPEN IN MAPILLARY</a></>}</div>}
    {kartaViewOpen && <div className="absolute right-3 top-14 z-20 w-[min(300px,calc(100%-1.5rem))] max-h-[calc(100%-7rem)] overflow-y-auto overscroll-contain border-2 border-emerald-300/80 bg-slate-950/98 p-3 text-slate-100 shadow-2xl" role="dialog" aria-label="KartaView street-level imagery"><div className="flex items-start justify-between gap-3"><div><span className="block text-[9px] font-bold uppercase tracking-[.14em] text-emerald-300">KARTAVIEW · STREET-LEVEL IMAGERY</span><strong className="mt-1 block text-sm text-white">PUBLIC STREET IMAGE · SELECTED FINDING CONTEXT</strong><span className="mt-1 block text-[10px] text-slate-400">Search center {kartaViewCenter.lat.toFixed(6)}, {kartaViewCenter.lng.toFixed(6)} · radius 500 m</span></div><button type="button" onClick={() => setKartaViewOpen(false)} className="border border-slate-600 px-2 py-1 text-[9px] font-bold text-slate-200">CLOSE</button></div>{kartaViewStatus === "loading" && <div className="mt-4 border border-slate-700 bg-slate-900 p-5 text-center text-[10px] uppercase tracking-[.12em] text-slate-300">Searching nearby public imagery…</div>}{kartaViewStatus === "error" && <div className="mt-4 border border-amber-800 bg-amber-950/60 p-4 text-xs leading-5 text-amber-100">KartaView could not be reached. Check the browser connection and try again.</div>}{kartaViewStatus === "empty" && <div className="mt-4 border border-slate-700 bg-slate-900 p-4 text-xs leading-5 text-slate-300">No public KartaView image was found within 500 m of this coordinate. This does not mean the asset has no defect.</div>}{kartaViewStatus === "ready" && selectedKartaViewPhoto && <><img className="mt-3 block max-h-52 w-full object-cover" src={selectedKartaViewPhoto.imageUrl} alt="KartaView public street-level reference" /><a className="mt-2 block border border-emerald-300/70 bg-emerald-900/70 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[.12em] text-white hover:bg-emerald-800" href={selectedKartaViewPhoto.imageUrl} target="_blank" rel="noreferrer">OPEN FULL STREET IMAGE</a><div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-300"><span>IMAGE GPS<br /><b className="text-white">{selectedKartaViewPhoto.latitude.toFixed(6)}, {selectedKartaViewPhoto.longitude.toFixed(6)}</b></span><span>CAPTURED<br /><b className="text-white">{selectedKartaViewPhoto.shotDate ?? "Date unavailable"}</b></span></div><div className={cn("mt-2 border p-2 text-[10px] leading-4", (selectedImageryOffset ?? 0) <= 100 ? "border-emerald-700 bg-emerald-950/50 text-emerald-100" : "border-amber-700 bg-amber-950/60 text-amber-100")}><b>{selectedImageryOffset ?? 0} m from selected advisory</b><br />Green marker = public street image; colored marker = DRIFT advisory. Nearby imagery is context only and does not prove the selected defect.</div><div className="mt-3 flex flex-wrap gap-1.5">{kartaViewPhotos.map(photo => <button key={photo.id} type="button" onClick={() => setSelectedKartaViewPhoto(photo)} className={cn("h-10 w-14 overflow-hidden border", selectedKartaViewPhoto.id === photo.id ? "border-emerald-300" : "border-slate-700")} aria-label={`Select KartaView image ${photo.id}`}><img className="h-full w-full object-cover" src={photo.imageUrl} alt="" /></button>)}</div></>}{kartaViewStatus === "ready" && <p className="mt-3 text-[10px] leading-4 text-amber-200">Public third-party imagery only. It is not DRIFT evidence, not a crack confirmation, and not an engineering determination.</p>}</div>}
  </section>;
}
