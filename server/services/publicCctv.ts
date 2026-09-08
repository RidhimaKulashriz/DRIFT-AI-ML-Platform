type PublicCamera = {
  id: string;
  cameraCode: string;
  displayName: string;
  zoneLabel: string;
  latitude: number;
  longitude: number;
  accessClassification: "public_open_data";
  sourceKind: "austin-open-data" | "caltrans-open-data" | "tfl-open-data" | "india-osm-public";
  sourceUrl: string;
  frameUrl: string | null;
  provider: string;
};

type CacheState = { expiresAt: number; cameras: PublicCamera[] };
let cache: CacheState = { expiresAt: 0, cameras: [] };
let inflight: Promise<PublicCamera[]> | null = null;
const CACHE_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_CAMERAS = 900;
const CALTRANS_DISTRICTS = [3, 4, 7, 11];
const AUSTIN_URL = "https://data.austintexas.gov/api/views/b4k4-adkb/rows.json?accessType=DOWNLOAD";
const TFL_URL = "https://api.tfl.gov.uk/Place/Type/JamCam";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const INDIA_CITY_BOXES = [
  [28.40, 76.80, 28.90, 77.40, "Delhi NCR"],
  [18.80, 72.70, 19.35, 73.10, "Mumbai"],
  [12.80, 77.35, 13.15, 77.80, "Bengaluru"],
  [17.20, 78.20, 17.65, 78.70, "Hyderabad"],
  [12.80, 80.00, 13.25, 80.40, "Chennai"],
  [22.35, 88.20, 22.75, 88.55, "Kolkata"],
  [18.40, 73.65, 18.70, 74.00, "Pune"],
] as const;

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function getJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "DRIFT-public-cctv/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function loadAustin(): Promise<PublicCamera[]> {
  try {
    const payload: any = await getJson(AUSTIN_URL);
    const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    return rows.flatMap((row: any, index: number) => {
      const values = Array.isArray(row) ? row : [];
      const location = String(row?.location ?? values[33] ?? "");
      const point = /POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i.exec(location);
      const latitude = finite(row?.latitude ?? row?.lat ?? (point ? point[2] : null));
      const longitude = finite(row?.longitude ?? row?.lon ?? (point ? point[1] : null));
      const image = String(row?.published_screenshots ?? row?.image_url ?? row?.url ?? values[30] ?? "");
      if (latitude === null || longitude === null) return [];
      return [{
        id: `austin-${String(row?.camera_id ?? values[8] ?? index)}`,
        cameraCode: `AUSTIN-${String(row?.camera_id ?? values[8] ?? index)}`,
        displayName: String(row?.location_name ?? row?.name ?? values[9] ?? `Austin public camera ${index + 1}`),
        zoneLabel: "Austin, Texas",
        latitude, longitude,
        accessClassification: "public_open_data" as const,
        sourceKind: "austin-open-data" as const,
        sourceUrl: AUSTIN_URL,
        frameUrl: image.startsWith("https://") ? image : null,
        provider: "City of Austin Open Data",
      }];
    });
  } catch (error) {
    console.warn("[public-cctv] Austin catalog unavailable:", error instanceof Error ? error.message : error);
    return [];
  }
}

async function loadCaltransDistrict(district: number): Promise<PublicCamera[]> {
  const url = `https://cwwp2.dot.ca.gov/data/d${district}/cctv/cctvStatusD${String(district).padStart(2, "0")}.json`;
  try {
    const payload: any = await getJson(url);
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return rows.flatMap((row: any, index: number) => {
      const cctv = row?.cctv;
      const location = cctv?.location ?? {};
      const latitude = finite(location.latitude);
      const longitude = finite(location.longitude);
      const image = String(cctv?.imageData?.static?.currentImageURL ?? "");
      if (String(cctv?.inService).toLowerCase() !== "true" || latitude === null || longitude === null || !image.startsWith("https://cwwp2.dot.ca.gov/")) return [];
      const name = String(location.locationName ?? `Caltrans District ${district} camera ${index + 1}`).replace(/^([A-Za-z0-9_-]+)\s*--\s*/, "");
      return [{
        id: `caltrans-d${district}-${index}`,
        cameraCode: `CALTRANS-D${district}-${index}`,
        displayName: name,
        zoneLabel: `California · Caltrans District ${district}`,
        latitude, longitude,
        accessClassification: "public_open_data" as const,
        sourceKind: "caltrans-open-data" as const,
        sourceUrl: url,
        frameUrl: image,
        provider: "Caltrans Open Data",
      }];
    });
  } catch (error) {
    console.warn(`[public-cctv] Caltrans D${district} unavailable:`, error instanceof Error ? error.message : error);
    return [];
  }
}

async function loadTfl(): Promise<PublicCamera[]> {
  try {
    const places: any = await getJson(TFL_URL);
    if (!Array.isArray(places)) return [];
    return places.flatMap((place: any) => {
      const properties = Object.fromEntries((place?.additionalProperties ?? []).filter((item: any) => item?.key).map((item: any) => [item.key, item.value]));
      const latitude = finite(place?.lat);
      const longitude = finite(place?.lon);
      const image = String(properties.imageUrl ?? "");
      if (String(properties.available).toLowerCase() !== "true" || latitude === null || longitude === null || !image.startsWith("https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/")) return [];
      const id = String(place?.id ?? "").replace(/^JamCams_/, "");
      if (!id) return [];
      return [{
        id: `tfl-${id}`,
        cameraCode: `TFL-${id}`,
        displayName: String(place?.commonName ?? `TfL JamCam ${id}`),
        zoneLabel: "London · Transport for London",
        latitude, longitude,
        accessClassification: "public_open_data" as const,
        sourceKind: "tfl-open-data" as const,
        sourceUrl: TFL_URL,
        frameUrl: image,
        provider: "Transport for London Open Data",
      }];
    });
  } catch (error) {
    console.warn("[public-cctv] TfL catalog unavailable:", error instanceof Error ? error.message : error);
    return [];
  }
}

async function loadIndiaCity(box: readonly [number, number, number, number, string]): Promise<PublicCamera[]> {
  const [south, west, north, east, city] = box;
  const query = `[out:json][timeout:20];(nwr["surveillance:type"="traffic"](${south},${west},${north},${east});nwr["surveillance"="public"]["surveillance:type"="camera"](${south},${west},${north},${east}););out center tags;`;
  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "DRIFT-public-cctv/1.0" },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`${response.status} ${city}`);
    const payload: any = await response.json();
    return (Array.isArray(payload?.elements) ? payload.elements : []).flatMap((element: any) => {
      const latitude = finite(element?.lat ?? element?.center?.lat);
      const longitude = finite(element?.lon ?? element?.center?.lon);
      if (latitude === null || longitude === null) return [];
      const tags = element?.tags ?? {};
      const id = `india-osm-${element.type}-${element.id}`;
      return [{
        id,
        cameraCode: id.toUpperCase(),
        displayName: String(tags.name ?? tags.ref ?? `Public traffic camera · ${city}`),
        zoneLabel: `${city}, India · OpenStreetMap public mapping`,
        latitude, longitude,
        accessClassification: "public_open_data" as const,
        sourceKind: "india-osm-public" as const,
        sourceUrl: "https://www.openstreetmap.org/",
        frameUrl: null,
        provider: "OpenStreetMap public camera mapping",
      }];
    });
  } catch (error) {
    console.warn(`[public-cctv] India ${city} catalog unavailable:`, error instanceof Error ? error.message : error);
    return [];
  }
}

export async function listPublicCctv(): Promise<PublicCamera[]> {
  if (cache.expiresAt > Date.now()) return cache.cameras;
  if (inflight) return inflight;
  inflight = Promise.all([loadAustin(), ...CALTRANS_DISTRICTS.map(loadCaltransDistrict), loadTfl(), ...INDIA_CITY_BOXES.map(loadIndiaCity)])
    .then(groups => groups.flat().slice(0, MAX_CAMERAS))
    .then(cameras => {
      cache = { cameras, expiresAt: Date.now() + CACHE_MS };
      return cameras;
    })
    .catch(() => cache.cameras)
    .finally(() => { inflight = null; });
  return inflight;
}

export type { PublicCamera };
