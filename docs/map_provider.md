# DRIFT Map Provider and Geospatial Evidence Policy

## Provider configuration

DRIFT uses the managed Google Maps JavaScript proxy already configured by the platform. The frontend loads `MapView` with `VITE_FRONTEND_FORGE_API_URL` and `VITE_FRONTEND_FORGE_API_KEY`; no Google key is placed in application source. The Operations and Evidence Vault workspaces render the provider-backed map, with defect markers and telemetry traces derived from persisted mission coordinates.

The map provider is an operational dependency. If it cannot load, DRIFT shows a visible provider-unavailable state while keeping coordinate records, mission metadata, and defect tables available. The system does not replace missing live map data with a fabricated map.

## Attribution and licensing

The application must preserve the attribution rendered by Google Maps and must not hide, alter, obscure, or visually mix it with DRIFT’s own content. Google’s official [Maps JavaScript API policies](https://developers.google.com/maps/documentation/javascript/policies) state that Google Maps attribution is required when displaying Google Maps Platform content, and that included attribution must remain visible and legible. The deployment owner is responsible for maintaining an applicable Google Maps Platform agreement, billing configuration, quotas, and organizational compliance before public production use.

DRIFT’s dark industrial overlays sit in separate containers above the map. They must not cover the Google attribution, controls, copyright notices, or other provider UI. Any future custom map styling must be checked against the provider’s current policies before release.

## Coordinate data contract

Asset, mission telemetry, defect, and evidence records retain latitude and longitude as mission metadata. The server validates latitude in `[-90, 90]`, longitude in `[-180, 180]`, and telemetry timestamps against a future-skew window. Evidence uploads preserve the coordinate associated with the captured frame; missing GPS is shown as pending rather than invented.

The simulator uses a reproducible New Delhi reference route and marks all generated media as simulator evidence. Real hardware media is uploaded through the authenticated bridge route and remains distinguishable from simulator data through its source and provenance metadata.

## Production checklist

Before public deployment, the operator should confirm that the Google Maps agreement and billing/quota controls are active, the map proxy environment is present, attribution remains visible at desktop and mobile widths, the map continues to render when the database has no records, and the Evidence Vault map is scoped to the selected mission. Map screenshots or exported reports must retain required attribution or use a separately licensed static-map workflow.

## References

[1]: https://developers.google.com/maps/documentation/javascript/policies "Policies and attributions for Maps JavaScript API | Google for Developers"
[2]: https://docs.px4.io/main/en/companion_computer/ "Companion Computers | PX4 Guide"
