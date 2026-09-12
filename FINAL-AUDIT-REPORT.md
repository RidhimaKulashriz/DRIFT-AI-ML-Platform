# DRIFT-AI-ML-Platform — Exhaustive Audit Report

**Audit scope:** repository source, visible UI text, interactive controls, public production deployment, Leaflet/OSM map, Mapillary/KartaView imagery, transient simulator, metrics, report paths, evidence cards, and deployment artifacts.

**Final repository commit:** `a3aa18d`

## Executive conclusion

The repository is type-safe, builds successfully, passes its automated test suite, contains no Google Maps runtime dependency, and has a working public transient simulator backend. The Mapillary discovery path has been repaired: the client now reads official Mapillary vector coverage tiles instead of relying on the empty Graph spatial lookup, selects real nearby image IDs, and prefers true panoramas when the tile data marks an image as panoramic. The application retains KartaView as the final street-image fallback.

The live Delhi corridor contains real Mapillary imagery, but the verified nine-tile neighborhood contains **zero genuine `is_pano` images**. Therefore the app can truthfully show real Mapillary perspective street imagery there, but it cannot truthfully label that exact Delhi imagery as a 360 panorama. The UI must continue to distinguish `360 PANORAMA` from `PERSPECTIVE` rather than inventing a 360 experience.

## Validation matrix

| Area | Result | Evidence |
|---|---|---|
| TypeScript | PASS | `pnpm check` completed with exit code 0. |
| Automated tests | PASS | 15 test files passed; 87 tests passed; 5 credential/secret tests intentionally skipped. |
| Production build | PASS | Vite completed in approximately 18.90 seconds; server bundle completed. |
| Git whitespace | PASS | `git diff --check` returned clean. |
| Dependency resolution | PASS | `pnpm list --depth 0` completed successfully. |
| Google Maps removal | PASS | No runtime Google Maps script or `google.maps` usage appears in the source scan. |
| Geographic map | PASS | Leaflet with OpenStreetMap tiles is present in the production bundle. |
| Mapillary discovery | PASS | Official `tiles.mapillary.com/maps/vtp/mly1_public` path is present in production. |
| KartaView fallback | PASS | `api.openstreetcam.org` fallback remains in the production bundle. |
| Public simulator API | PASS | Direct production tRPC mutation returned `stateless_demo`, 15 findings, and 30 telemetry points. |
| Public demo browser flow | PASS after refresh | A fresh production browser pass completed the transient demo and displayed the transient walkthrough banner, 15 advisory findings, and the `OPEN DEMO REPORT` control. |
| Report paths | CODE VERIFIED | Transient briefing and per-finding demo PDF handlers are wired with success/error guards; persistent reports require authenticated persisted missions. |
| Evidence cards | CODE VERIFIED | Road video, rail defect frame, and bridge spalling frame include visible overlays, provenance, source/license actions, and viewer actions. |
| Responsive imagery panel | CODE VERIFIED | Imagery card is contained and compact; mobile layout rules place it below the map. |

## Browser regression record

The browser was exercised through repeated fresh production navigations and control attempts. The first cache-busted build showed the simulator button remaining on `SIMULATING`; the direct API was healthy, so the public auth/session lookup was bounded to 1.5 seconds in `client/src/lib/supabase.ts`. After the fix was deployed, a fresh browser pass completed successfully: the button returned to `RUN TRANSIENT DEMO`, the click changed it to `SIMULATING`, then the transient walkthrough appeared with 15 advisory findings, temporary telemetry, and a toast confirming no records were stored.

Additional browser checks loaded the public page repeatedly, verified the Leaflet map section and imagery controls were present, and verified the app remained Google-free. The My Browser extension subsequently returned HTTP 504 timeouts during some navigation/click observations; those attempts are recorded as infrastructure-observation failures, not falsely marked as application passes. Direct production API and bundle checks were used for the same paths where the browser extension did not respond.

## Source and control audit

The source scan enumerated buttons, links, forms, inputs, selects, textareas, and event handlers across `client/src`. The three `href="#"` instances belong to the component-showcase pagination control and each has a real click handler that prevents default navigation and updates page state. No TODO, FIXME, `console.log`, or unimplemented placeholder was found in the scanned application/server paths. Report/download paths use either server-side PDF mutations or browser-generated Markdown downloads, and protected operations surface explicit sign-in or persistence-required errors.

## Important remaining limitation

A verified Mapillary tile probe over the nine zoom-14 tiles surrounding the selected Delhi finding found thousands of real image features but zero images with `is_pano=true`. This is a coverage limitation, not a token failure and not a client error. The correct production behavior is to show a real Mapillary perspective image with a `PERSPECTIVE` label, or KartaView fallback when Mapillary coverage is absent. A genuine 360 viewer requires selecting a location whose official Mapillary tile contains a panoramic image.

## Delivered changes

The final GitHub `main` branch contains the auth lookup timeout, Mapillary vector-tile discovery repair, panorama-first selection order, compact imagery/map handling, and the audit evidence files. The working tree is clean after commit `a3aa18d`.

## References

[1]: https://mapillary.github.io/mapillary-js/docs/main/control/ "MapillaryJS control documentation"
[2]: https://www.openstreetmap.org/copyright "OpenStreetMap copyright and attribution"
[3]: https://www.mapillary.com/developer/api-documentation "Mapillary API documentation"
[4]: https://kartaview.org/ "KartaView"
