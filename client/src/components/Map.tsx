import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";

interface MapViewProps {
  className?: string;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  onMapReady?: (map: L.Map) => void;
  onMapError?: (message: string) => void;
  markers?: Array<{ id: number; position: { lat: number; lng: number }; label: string; color: string; onClick?: () => void }>;
}

export function MapView({ className, initialCenter = { lat: 28.6139, lng: 77.209 }, initialZoom = 12, onMapReady, onMapError, markers = [] }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    try {
      const map = L.map(container.current, { zoomControl: true, attributionControl: true }).setView([initialCenter.lat, initialCenter.lng], initialZoom);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 20, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>' }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      onMapReady?.(map);
      window.setTimeout(() => map.invalidateSize(), 0);
      return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
    } catch (error) {
      onMapError?.(error instanceof Error ? error.message : "The geographic map could not be loaded.");
    }
  }, [initialCenter.lat, initialCenter.lng, initialZoom, onMapError, onMapReady]);

  useEffect(() => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    markers.forEach(marker => {
      const point = L.circleMarker([marker.position.lat, marker.position.lng], { radius: 9, color: "#fff", weight: 2, fillColor: marker.color, fillOpacity: 0.92 }).addTo(layer);
      point.bindTooltip(marker.label, { direction: "top" });
      if (marker.onClick) point.on("click", marker.onClick);
    });
  }, [markers]);

  return <div className={cn("relative h-[500px] w-full overflow-hidden", className)}><div ref={container} className="h-full w-full" /></div>;
}
