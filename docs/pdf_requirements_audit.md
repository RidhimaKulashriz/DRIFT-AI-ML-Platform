# DRIFT PDF Requirements Audit Notes

## Source

Original brief reviewed from `/home/ubuntu/upload/ds.pdf` on 2026-08-25.

## Key product expectations visible in the brief

| Area | Requirement inferred from PDF |
|---|---|
| Mission | AI-powered drone-based infrastructure inspection system for roads, bridges, and public assets |
| Core workflow | Drone capture → AI detection → classify & alert → dashboard → digital record |
| Detection scope | Potholes, cracks, structural defects, corrosion, and spalling |
| Inspection value | Faster inspection, predictive maintenance, early defect detection, improved public safety, and digital inspection records |
| Roles/stakeholders | Admin, Engineer, Citizen, maintenance teams, authorities |
| Prioritization | Severity and risk analysis with smart ranking; ZeroError-branded severity reporting |
| Economics | Cost estimation / repair budgeting module |
| Data layer | Historical logging, persistent inspection records, asset history, location mapping |
| Geospatial | Defect location on maps with coordinate-linked dashboard evidence |
| Alerts | Critical issue escalation and notifications |
| Output artifacts | Interactive dashboard, maps, charts, PDF reports, digital records |
| Integration | External system APIs, government portals, asset management systems, third-party services |
| Real-time behavior | Real-time capture, real-time alerts, data streaming / live updates |
| Hardware | Real drone/hardware integration is explicitly part of the concept |
| Demo expectations | Dashboard and hardware drone model shown; implies both hardware-backed and demonstrable flows |

## Notable technical references shown in the brief

| Category | Technologies named in PDF |
|---|---|
| Computer vision | YOLO11n, SAM2, OpenCV |
| AI/analysis | PyTorch, Ultralytics, CUDA |
| Backend | FastAPI, Uvicorn, WebSockets |
| Data | PostgreSQL, PostGIS |
| Visualization/reporting | Streamlit, Folium, Plotly, ReportLab |
| Deployment/edge | Docker Compose, NVIDIA Jetson, local AI/Ollama |

## Problem/solution claims to preserve honestly

| Problem | Expected system response |
|---|---|
| Manual inspections are time-consuming, expensive, dangerous, inconsistent, and error-prone | Drone-based capture with AI-assisted detection and structured records |
| No severity prioritization | AI-based severity ranking |
| No cost estimation | Repair cost estimation module |
| Slow/manual process | Faster digital workflow with alerts and reports |
| Dangerous for inspectors | Remote capture / reduced manual exposure |

## Industry-readiness implications for the current hardening pass

| Theme | Hardening implication |
|---|---|
| Hardware connection | Need a real adapter contract for telemetry, GPS, media, mission state, health, and retries |
| Real geospatial map | Need production map provider configuration and coordinate-aware evidence UI |
| Real media | Need provenance-aware ingestion for photos/video and clear separation between simulator/demo data and real inspections |
| AI/ML | Need pluggable production inference interfaces, versioned model outputs, confidence, and review workflow |
| Auditability | Need durable records, timestamps, role-based review, and report generation suitable for maintenance programs |
| Operations | Need graceful degradation when drone, ML, map, or AI providers are unavailable |

## Constraints to handle honestly

The PDF shows a broad ambition and a reference stack, but the current web application can only be called fully hardware-ready after integrating a specific drone ecosystem, authenticated map provider configuration, and a production CV pipeline with real assets. These items can be implemented as concrete supported integration paths, but should not be overstated as universally compatible without the target hardware and credentials.

## Verified hardware integration source

The official [PX4 Companion Computers guide](https://docs.px4.io/main/en/companion_computer/) states that a Linux companion computer connects to the flight controller over serial or Ethernet and commonly communicates using MAVLink or uXRCE-DDS. It also identifies MAVSDK as a drone/ground-system interface and MAVLink Router as the bridge for vehicle telemetry to ground stations or IP networks. DRIFT should therefore implement a telemetry/media bridge boundary, with the aircraft’s flight controller and safety logic remaining outside DRIFT’s web application.

This supports a concrete first hardware path: PX4 or ArduPilot flight controller → companion computer (for example Raspberry Pi or Jetson) → MAVLink/MAVSDK bridge → authenticated DRIFT HTTPS ingestion. A DJI-specific path should remain a separate adapter because vendor cloud APIs and payloads differ.

## External asset and policy references

The simulator’s real pothole reference asset is [File:Pothole Big.jpg on Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Pothole_Big.jpg). The file page identifies the image as a large pothole on a country road, authored by Uncl3dad, and released worldwide into the public domain by the copyright holder. DRIFT labels it as simulator/reference media and does not claim its source location is the displayed New Delhi route.

The map provider policy reference is [Google Maps JavaScript API policies](https://developers.google.com/maps/documentation/javascript/policies), which requires preserving visible attribution and not hiding or obscuring Google Maps provider UI. The hardware architecture reference is [PX4 Companion Computers](https://docs.px4.io/main/en/companion_computer/), which documents serial/Ethernet links, MAVLink, MAVSDK, and MAVLink Router between a flight controller, companion computer, and ground/cloud systems.
