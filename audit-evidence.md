# DRIFT exhaustive audit evidence

## Static validation

The repository typecheck passed with `pnpm check`. The complete Vitest run passed with 87 tests across 15 files, with 5 credential/secret tests intentionally skipped. The production build passed: Vite completed in approximately 20.66 seconds and the server bundle completed in approximately 15 milliseconds. `git diff --check` passed and the dependency tree resolved successfully.

## Live Mapillary verification

The old Graph `/images` spatial lookup returned HTTP 200 with an empty `data` array at the selected Delhi point. Mapillary's official `mly1_public` vector tile for Delhi returned 7,656 image features and 97 sequences, including real image key `1194048889559441`. Mapillary's own website opened that key successfully and rendered a real Delhi street-level image credited to Ibigrp, dated February 24, 2026. This proves the token and coverage are valid and the spatial entity lookup was the wrong discovery path.

The code was patched to use official Mapillary coverage tiles through `@mapbox/vector-tile` and `pbf`, select nearby image IDs, prefer panoramas, and initialize MapillaryJS with the selected real image ID. The patch is committed and pushed as `274ec61`.

## Browser regression pass 1

The live app loaded with Leaflet and no Google Maps script. Clicking `RUN TRANSIENT DEMO` on the deployed Vercel URL remained visually stuck on `SIMULATING` during repeated browser observation, while the direct Render tRPC mutation returned HTTP 200 with 15 findings and 30 telemetry entries in under 30 seconds. This indicates a browser-side request or deployment/runtime integration issue remains to be isolated; it is not a backend simulator failure.

The selected previous production build also showed KartaView imagery successfully, while the old Mapillary Graph query showed empty imagery. The new vector-tile deployment must be reloaded and tested after the Vercel asset is confirmed live.

## Panorama coverage result

The official Mapillary `mly1_public` image layer was decoded for all nine zoom-14 tiles around the demo finding. The tiles contained 89, 346, 301, 5842, 7656, 642, 9593, 9663, and 911 image features respectively, but every tile reported zero `is_pano` images. The Delhi corridor therefore has substantial real Mapillary perspective coverage but no genuine Mapillary 360 panorama in the app's selected 3x3 neighborhood. The app must correctly label and display perspective imagery there; it cannot honestly show a 360 panorama for that location without selecting a different location that actually contains `is_pano=true` coverage.
