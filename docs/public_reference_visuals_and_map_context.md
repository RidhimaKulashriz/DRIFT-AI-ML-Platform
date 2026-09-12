# Public Reference Visuals and Map Context Register

## Approved Demonstration-Only Sources

This register supports the public DRIFT prototype. It **does not create project evidence, defect findings, contractor tickets, or safety claims**. Every image and map point added from this register must be shown as an external reference or authoritative public-data context only.

| Item | Source | Licence / use basis | Prototype treatment |
|---|---|---|---|
| Road pothole photograph | [Wikimedia Commons: *Pothole Big.jpg*](https://commons.wikimedia.org/wiki/File:Pothole_Big.jpg) | Public domain dedication by the copyright holder; author: Uncl3dad | Real reference image only. It has no DRIFT flight, asset, mission, contractor, or project location. |
| Bridge spalling photograph | [Wikimedia Commons: *Lewis River Bridge – Spalling concrete*](https://commons.wikimedia.org/wiki/File:Lewis_River_Bridge_-_Spalling_concrete_(42223630094).jpg) | U.S. National Park Service work; public domain; author credit: Yellowstone National Park / Doug Madsen | Real reference image only. It is not a live DRIFT capture and never supports a ticket or repair claim. |
| Public bridge condition context | [USDOT/BTS National Bridge Inventory](https://geodata.bts.gov/datasets/usdot::national-bridge-inventory/about) and [NBI Feature Service](https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_National_Bridge_Inventory/FeatureServer/0) | U.S. Government public data; the service metadata states unrestricted public use | Read-only sample map context. Values are published inspection fields, not real-time conditions, defect imagery, a DRIFT detection, or a local project issue. |

## Bounded Public NBI Sample

The demo uses a small static sample queried from the 2025 NBI feature service on 27 August 2026. It is deliberately bounded to avoid bulk loading and is rendered in a separate **Public NBI context** layer.

| NBI structure number | Published feature description | Published deck condition field | Coordinates | Required UI limitation |
|---|---|---:|---|---|
| 0518 | Johnson River | 4 | 63.704797, -144.640464 | Historic/public inspection context only; no current condition or repair claim. |
| 0574 | Gulkana River | 4 | 62.268856, -145.373803 | Historic/public inspection context only; no current condition or repair claim. |
| 0581 | Upper Miller Creek | 4 | 63.375533, -145.729814 | Historic/public inspection context only; no current condition or repair claim. |

> The NBI contains bridge location, description, classification, and general-condition information. DRIFT treats it as map context only. A published condition field is not proof of an active defect, priority, closure status, or contractor obligation.

## Implementation Guardrails

The public map has separate visual labels for **DRIFT project evidence** and **public NBI context**. NBI locations cannot create tickets, route contractors, feed the DSI score, trigger CCTV analysis, or prepare UAV activity. Reference photographs are excluded from the Evidence Vault’s field-evidence workflow and from site-specific reports.

## References

[1] [Federal Highway Administration, National Bridge Inventory](https://www.fhwa.dot.gov/bridge/nbi.cfm)

[2] [Bureau of Transportation Statistics, National Bridge Inventory dataset](https://geodata.bts.gov/datasets/usdot::national-bridge-inventory/about)

[3] [Wikimedia Commons, *Pothole Big.jpg*](https://commons.wikimedia.org/wiki/File:Pothole_Big.jpg)

[4] [Wikimedia Commons, *Lewis River Bridge – Spalling concrete*](https://commons.wikimedia.org/wiki/File:Lewis_River_Bridge_-_Spalling_concrete_(42223630094).jpg)
