/**
 * GOOGLE MAPS FRONTEND INTEGRATION - ESSENTIAL GUIDE
 *
 * USAGE FROM PARENT COMPONENT:
 * ======
 *
 * const mapRef = useRef<google.maps.Map | null>(null);
 *
 * <MapView
 *   initialCenter={{ lat: 40.7128, lng: -74.0060 }}
 *   initialZoom={15}
 *   onMapReady={(map) => {
 *     mapRef.current = map; // Store to control map from parent anytime, google map itself is in charge of the re-rendering, not react state.
 * </MapView>
 *
 * ======
 * Available Libraries and Core Features:
 * -------------------------------
 * 📍 MARKER (from `marker` library)
 * - Attaches to map using { map, position }
 * new google.maps.marker.AdvancedMarkerElement({
 *   map,
 *   position: { lat: 37.7749, lng: -122.4194 },
 *   title: "San Francisco",
 * });
 *
 * -------------------------------
 * 🏢 PLACES (from `places` library)
 * - Does not attach directly to map; use data with your map manually.
 * const place = new google.maps.places.Place({ id: PLACE_ID });
 * await place.fetchFields({ fields: ["displayName", "location"] });
 * map.setCenter(place.location);
 * new google.maps.marker.AdvancedMarkerElement({ map, position: place.location });
 *
 * -------------------------------
 * 🧭 GEOCODER (from `geocoding` library)
 * - Standalone service; manually apply results to map.
 * const geocoder = new google.maps.Geocoder();
 * geocoder.geocode({ address: "New York" }, (results, status) => {
 *   if (status === "OK" && results[0]) {
 *     map.setCenter(results[0].geometry.location);
 *     new google.maps.marker.AdvancedMarkerElement({
 *       map,
 *       position: results[0].geometry.location,
 *     });
 *   }
 * });
 *
 * -------------------------------
 * 📐 GEOMETRY (from `geometry` library)
 * - Pure utility functions; not attached to map.
 * const dist = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
 *
 * -------------------------------
 * 🛣️ ROUTES (from `routes` library)
 * - Combines DirectionsService (standalone) + DirectionsRenderer (map-attached)
 * const directionsService = new google.maps.DirectionsService();
 * const directionsRenderer = new google.maps.DirectionsRenderer({ map });
 * directionsService.route(
 *   { origin, destination, travelMode: "DRIVING" },
 *   (res, status) => status === "OK" && directionsRenderer.setDirections(res)
 * );
 *
 * -------------------------------
 * 🌦️ MAP LAYERS (attach directly to map)
 * - new google.maps.TrafficLayer().setMap(map);
 * - new google.maps.TransitLayer().setMap(map);
 * - new google.maps.BicyclingLayer().setMap(map);
 *
 * -------------------------------
 * ✅ SUMMARY
 * - “map-attached” → AdvancedMarkerElement, DirectionsRenderer, Layers.
 * - “standalone” → Geocoder, DirectionsService, DistanceMatrixService, ElevationService.
 * - “data-only” → Place, Geometry utilities.
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef, useState } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
  }
}

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

function loadMapScript() {
  return new Promise<void>((resolve, reject) => {
    if (!API_KEY) return reject(new Error("Google Maps is not configured. Set a domain-restricted VITE_GOOGLE_MAPS_API_KEY."));
    if (window.google?.maps) return resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => { resolve(); script.remove(); };
    script.onerror = () => { script.remove(); reject(new Error("Google Maps provider could not be loaded.")); };
    document.head.appendChild(script);
  });
}

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
  onMapError?: (message: string) => void;
  markers?: Array<{
    id: number;
    position: google.maps.LatLngLiteral;
    label: string;
    color: string;
    onClick?: () => void;
  }>;
}

export function MapView({
  className,
  initialCenter = { lat: 37.7749, lng: -122.4194 },
  initialZoom = 12,
  onMapReady,
  onMapError,
  markers = [],
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markerRefs = useRef<google.maps.Marker[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const init = usePersistFn(async () => {
    try {
      await loadMapScript();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Maps could not be loaded.";
      setLoadError(message);
      onMapError?.(message);
      return;
    }
    if (!mapContainer.current || !window.google?.maps) {
      console.error("Map container not found");
      return;
    }
    map.current = new window.google.maps.Map(mapContainer.current, {
      zoom: initialZoom,
      center: initialCenter,
      mapTypeControl: true,
      fullscreenControl: true,
      zoomControl: true,
      streetViewControl: true,
    });
    setMapReady(true);
    if (onMapReady) {
      onMapReady(map.current);
    }
  });

  useEffect(() => {
    if (!mapReady || !map.current || !window.google?.maps) return;
    markerRefs.current.forEach(marker => marker.setMap(null));
    markerRefs.current = markers.map(marker => {
      const instance = new window.google!.maps.Marker({
        map: map.current!,
        position: marker.position,
        title: marker.label,
        label: { text: marker.label, color: "#ffffff", fontSize: "10px", fontWeight: "700" },
        icon: { path: window.google!.maps.SymbolPath.CIRCLE, scale: 9, fillColor: marker.color, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 },
      });
      if (marker.onClick) instance.addListener("click", marker.onClick);
      return instance;
    });
    return () => markerRefs.current.forEach(marker => marker.setMap(null));
  }, [mapReady, markers]);

  useEffect(() => {
    init();
    return () => {
      markerRefs.current.forEach(marker => marker.setMap(null));
      markerRefs.current = [];
      map.current = null;
    };
  }, [init]);

  return (
    <div className={cn("relative w-full h-[500px]", className)}>
      <div ref={mapContainer} className="h-full w-full" />
      {loadError && <div className="absolute inset-0 flex items-center justify-center bg-slate-950 p-6 text-center text-sm text-slate-200"><p>{loadError}</p></div>}
    </div>
  );
}
