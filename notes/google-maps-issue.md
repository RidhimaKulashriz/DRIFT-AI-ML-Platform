# Google Maps issue

User-reported browser errors:

- `maps.googleapis.com/maps/api/mapsjs/gen_204?csp_test=true`: `net::ERR_BLOCKED_BY_CLIENT`.
- Google Maps JavaScript API warning: `google.maps.Marker` is deprecated as of February 21, 2024; Google recommends `google.maps.marker.AdvancedMarkerElement`.
- Google Maps Demo Key warning: daily quota for Maps JavaScript 2D has been met; the key/account needs a quota-enabled billing/project configuration for uninterrupted use.

Official references from the browser console:
- https://developers.google.com/maps/deprecations
- https://developers.google.com/maps/documentation/javascript/advanced-markers/migration

Implementation goal: keep the construction footage, add a graceful non-Google map fallback when the Maps script is blocked or quota-exhausted, and modernize marker rendering where compatible with the current app.
