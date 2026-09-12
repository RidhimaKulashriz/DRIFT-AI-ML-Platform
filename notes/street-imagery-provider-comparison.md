# Street-level imagery provider comparison

Mapillary's official API documentation says it provides street-level imagery through vector tiles and entity endpoints. Image and sequence entities require OAuth2 access tokens, while vector and coverage tiles support visualization. It is a strong Google Street View alternative, but coverage is community-contributed and access is token-based.

Sources:
- Mapillary API documentation: https://www.mapillary.com/developer/api-documentation
- Mapillary developer portal: https://www.mapillary.com/developer

KartaView's official FAQ says it is a crowdsourced street-level imagery platform with millions of photos and sequences, location/date/contributor search, coverage tiles, and application integration. Most public endpoints are accessible without authentication; tokens are needed for uploads, profile data, and higher rate limits. Its imagery is generally sequences/photos rather than Google's global 360-degree panorama experience, so coverage can vary by location.

Source:
- KartaView FAQ: https://kartaview.org/doc/faq

Recommendation for DRIFT: use KartaView as the lowest-friction free fallback because public imagery endpoints are available without an API key, while optionally adding Mapillary as a richer street-imagery layer when the user supplies a client token. Neither service guarantees Google-level coverage or a panorama at every coordinate. The product should label third-party imagery as public reference imagery, not DRIFT evidence or crack confirmation.
