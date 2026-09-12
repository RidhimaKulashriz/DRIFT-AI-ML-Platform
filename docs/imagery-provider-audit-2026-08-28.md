# Imagery provider audit

## Mapillary
Official API documentation: https://www.mapillary.com/developer/api-documentation

Verified facts from the official documentation on 2026-08-28: Mapillary API v4 exposes vector tiles and entity endpoints. Requests to graph.mapillary.com and tiles.mapillary.com require a client or user access token. The API documentation states that image radius search supports latitude/longitude/radius parameters, with a maximum radius of 50 m, and that the service can prefer 360-degree images. MapillaryJS official viewer documentation is available at https://mapillary.github.io/mapillary-js/ and its ViewerOptions accept an accessToken, container, and optional imageId. MapillaryJS can render navigable street-level imagery, including 360 imagery when a 360 image is available.

Live probe with the user-provided Mapillary access token returned HTTP 200. At central Delhi coordinates 28.6139, 77.2090, the API returned 11 images but zero 360 panoramas. At the simulated selected point 28.6067, 77.1996, the strict 50 m search returned no image; the implementation now retries with a small official bounding-box search and then falls back to KartaView. Therefore a blank 360 state at some simulated points is a provider-coverage result, not evidence of a panorama.

## Google Street View
Official billing documentation: https://developers.google.com/maps/documentation/streetview/usage-and-billing

Verified facts: Google’s Street View Static API documentation states that billing must be enabled on each project and an API key or OAuth token must accompany all API or SDK requests. Static Street View panoramas are billed under the static Street View panoramas SKU. The project therefore keeps Google excluded and uses Mapillary first, with KartaView fallback.
