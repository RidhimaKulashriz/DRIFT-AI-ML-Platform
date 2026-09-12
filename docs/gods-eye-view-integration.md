# God's Eye View integration

## What the open-source project is

The open-source [God's Eye View project](https://github.com/bilawalsidhu/gods-eye-view) is a Vite/JavaScript/CesiumJS photorealistic 3D globe. Its repository describes separate data modules, a Cesium globe, Esri satellite imagery with OSM fallback, optional Cesium ion or Google Photorealistic 3D Tiles, and server-side brokering for private integrations. It is not a hosted embeddable widget with a public iframe API; to use the actual engine inside DRIFT, the reliable approach is to merge or mount its frontend runtime as a route/component and connect a DRIFT adapter to its layer registry.

CesiumJS is Apache 2.0 and supports WGS84, 3D Tiles, terrain, imagery, GeoJSON, CZML, glTF, and time-dynamic visualization. Provider imagery, terrain, Google Photorealistic 3D Tiles, Esri tiles, and third-party datasets remain subject to their own provider terms, quotas, attribution, and commercial-use restrictions.

## Recommended production architecture

1. Keep DRIFT as the authenticated system of record. The browser requests `/api/drift/god-eye` and receives sanitized GeoJSON-like records for defects, assets, reconstruction jobs, telemetry, authorized cameras, and reviewed CCTV candidates.
2. Add the God's Eye View Cesium runtime under a dedicated `/godseye` route or as a lazy-loaded component. Do not iframe the public GitHub demo because cross-origin data exchange, authentication, deep links, and reliable deployment would be weak.
3. Add a `driftLayer` adapter that converts each record into a Cesium `Entity`, `GeoJsonDataSource`, or 3D Tiles styling rule. Use stable IDs such as `drift:defect:123` and `drift:camera:17` so search results can fly the camera to an exact location.
4. Use Cesium ion or Google 3D Tiles only when the deployment has an approved token/key. Without those credentials, use Esri satellite imagery plus OSM/terrain fallback and clearly label the map source.
5. Keep all private credentials server-side. Restrict browser-visible Cesium/Google keys by origin, quota, and API scope. Never expose camera credentials or arbitrary camera discovery endpoints to the client.
6. Treat CCTV as an authorization-controlled layer. DRIFT should show only registered camera sources whose authorization has not expired and reviewed candidates that are explicitly present in the database. It must not scrape or discover private cameras.

## Current DRIFT implementation

DRIFT now includes a `/ ?workspace=godseye` workspace with a satellite-style bird's-eye map, OSM fallback, search, exact-coordinate popups, database-backed defect and asset markers, authorized CCTV markers, reviewed CCTV candidates, layer controls, and a privacy boundary. This is the safe integration stage while the full Cesium/God's Eye runtime is mounted.

The current endpoint is `drift.godEye`. It intentionally returns sanitized records rather than camera streams or private credentials. The next step for photorealistic 3D is to add the actual Cesium runtime and the `driftLayer` adapter described above.
