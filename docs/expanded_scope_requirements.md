# Expanded DRIFT scope requirements

## External grounding

PX4 documents a flight-controller plus companion-computer architecture: PX4 runs core flight and safety code on the flight controller, while a Linux companion computer handles general or computationally expensive software. The two commonly communicate over serial or Ethernet using MAVLink or uXRCE-DDS, with MAVLink Router used to route traffic to ground stations or cloud services. Source: [PX4 Companion Computers](https://docs.px4.io/main/en/companion_computer/).

NIST’s AI Risk Management Framework describes trustworthy AI characteristics including validity and reliability, safety, security and resilience, accountability and transparency, explainability and interpretability, privacy enhancement, and fairness. It organizes operational risk work into GOVERN, MAP, MEASURE, and MANAGE. Source: [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) and [NIST AI RMF 1.0](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf).

## Product requirements derived from the user request

DRIFT should support a configurable inspection taxonomy spanning roads, bridges, railways, buildings, utilities, drainage, pavement, signage, barriers, lighting, tunnels, and under-structure zones. The system should accept imagery and telemetry from operator-approved drone hardware, including GPS, altitude, heading, camera identifier, capture time, media type, and a declared capture zone such as above-deck, under-bridge, tunnel, confined, low-light, or oblique.

The AI layer must not claim universal detection or guaranteed accuracy. Every finding should carry model/version provenance, calibrated confidence, image-quality status, coverage status, evidence references, uncertainty, and a mandatory human-review state. Findings from multiple passes should be correlatable across images, video frames, GPS traces, assets, and missions.

The hardware boundary must remain operator-controlled. DRIFT should ingest telemetry and media through an authenticated bridge, while flight safety, arming, geofencing, lost-link behavior, and mission execution remain under the approved flight controller and operator procedures. Reports should include domain-specific findings, linked evidence, uncertainty, recommended follow-up inspection, and engineer sign-off state.
