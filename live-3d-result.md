# Live 3D/360 verification

Date: 2026-08-28
Production URL: https://drift-ai-ml-platform.vercel.app/?viewer360=f5f8426

The transient demo completed and populated 15 advisory findings. Mapillary coverage tile requests returned HTTP 200 and the panel displayed 24 nearby image IDs. The Delhi selected finding images are correctly classified as PERSPECTIVE; the surrounding verified 3x3 Delhi neighborhood contains no `is_pano=true` images.

A real Mapillary panorama control was tested using tile-verified image ID `2895209590731209` from a high-coverage New York tile. The browser created the MapillaryJS DOM viewer container, but the entity request returned HTTP 200 with `{"data":[]}` for both Authorization-header and access_token-query forms. The DOM had no canvas/image texture and remained visually blank. This means the client token can read coverage tiles but cannot retrieve that entity’s panorama payload; MapillaryJS cannot render a genuine 360 view from it.

This is a provider/API permission or entity-availability limitation, not a Leaflet map or CSS sizing issue. The app must not fabricate a 3D panorama. Current truthful behavior is to show real Delhi perspective imagery and KartaView fallback, while a genuine 360 requires a Mapillary image ID that the configured token can also read through the entity/image-tile service.
