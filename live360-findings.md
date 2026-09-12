Live production test on https://drift-ai-ml-platform.vercel.app/?live360=9b39161 after RUN TRANSIENT DEMO:

- Leaflet map loaded with 15 Delhi advisory points.
- Selected finding: SIM DEMO STRUCTURAL FRAME 01 at 28.606700, 77.199600.
- Mapillary panel opened automatically and showed: "No Mapillary 360 or perspective image was found near this finding. KartaView fallback is available below."
- KartaView panel was ready with image GPS 28.605073, 77.199044, captured 2021-12-22, 189 m offset.
- The production UI therefore does not currently provide a visible Mapillary 360/perspective image for this test coordinate, despite earlier bundle verification.
- The map itself remained visible and did not show the former oversized viewer overlay in this viewport.

Additional live verification:

- Mapillary’s own app at the same Delhi area showed green coverage lines.
- Image key 1194048889559441 from the official mly1_public vector tile opened successfully at https://www.mapillary.com/app/?pKey=1194048889559441&focus=photo.
- The image rendered as a real Delhi street-level view, credited to Ibigrp, dated Feb 24, 2026.
- Therefore the Mapillary token and Delhi coverage are valid; the DRIFT app’s Graph /images spatial lookup is the actual failure. The vector-tile path must be used to obtain image IDs.
