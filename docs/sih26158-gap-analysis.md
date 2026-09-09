# SIH26158 production-readiness and requirements traceability

## Executive conclusion

The current DRIFT website is **not yet a contest-ready implementation of SIH26158**. It contains a substantial inspection-platform shell, public map workspaces, a reconstruction intake contract, a Cesium globe, and a WebGL viewer. It does not yet prove the central SIH requirement: processing an original single-pass 1080p/4K drone video into a georeferenced, metrically accurate, textured 3D model or point cloud within the required processing target.

The decisive missing production capability is a deployed photogrammetry compute path. The repository contains a worker scaffold for OpenDroneMap, but the worker is not running, the website does not upload the selected video into durable object storage, and a job without an HTTPS source URL cannot be processed. Consequently, a job can remain in `awaiting_source` or `queued` without producing GLB, LAS, GeoTIFF, OBJ, PLY, or FBX artifacts. The UI must not present this as a completed reconstruction.

## Source requirements

The attached SIH problem statement defines the target as an **AI-enabled single-pass drone video to accurate 3D model generation system** for terrain, structures, facades, rooftops, roads, infrastructure, vegetation, obstacles, textured meshes, and point clouds. The mandatory inputs are drone video at 1080p/4K, GPS coordinates, and flight metadata. Optional inputs are IMU data, barometric altitude, camera intrinsics, and RTK/PPK corrections. The desired output table specifies a 3D mesh or point cloud, processing under 15 minutes for a 10-minute video, spatial accuracy of at most 1 metre, coverage of the entire visible scene, output formats including OBJ, PLY, LAS, GeoTIFF, GLB/GLTF, and FBX, and a web-based or desktop viewer.

The evaluation weighting in the PDF is **30% reconstruction accuracy, 20% model completeness, 20% processing speed, 15% innovation, 10% scalability, and 5% user interface**. This weighting means that a polished map or dashboard cannot compensate for an absent reconstruction engine.

## Traceability matrix

| SIH requirement | Current repository state | Evidence | Readiness | Required production work |
|---|---|---|---|---|
| Single-pass 1080p/4K drone video | Metadata form accepts video metadata; browser file is not durably uploaded to the worker | `ReconstructionWorkspace.tsx` | Partial | Add resumable multipart upload to object storage and persist the resulting source URL |
| GPS coordinates | Latitude, longitude, and altitude fields are persisted | `reconstructionJobs` schema and input validation | Partial | Bind coordinates to video metadata and reject contradictions between EXIF, flight log, and form input |
| Flight metadata | Manual metadata fields exist | Reconstruction input contract | Partial | Parse DJI/flight-log metadata and preserve the original metadata file as provenance |
| IMU, barometer, intrinsics, RTK/PPK | Boolean availability flags exist | Quality scoring service | Partial | Ingest actual telemetry and camera calibration values; use them in the reconstruction pipeline |
| 3D terrain and structures | No deployed processor produces geometry | OpenDroneMap worker scaffold only | Missing | Deploy worker with ODM or COLMAP plus conversion tools |
| Facades and rooftops | No production reconstruction output | No completed artifacts | Missing | Use oblique-frame selection, calibrated camera model, dense stereo, and mesh texturing |
| Roads and infrastructure | No production reconstruction output | No completed artifacts | Missing | Add semantic segmentation and infrastructure classes after geometry creation |
| Vegetation and obstacles | No production reconstruction output | No completed artifacts | Missing | Add semantic layers with confidence and unknown-class handling |
| Textured mesh or point cloud | WebGL viewer exists but has no published artifact to load | `ReconstructionViewer.tsx` | Partial | Publish real GLB and LAS/LAZ artifacts with browser-readable URLs |
| Georeferencing | Input origin is recorded; no independent georeferencing validation | Reconstruction manifest | Partial | Use camera poses, RTK/PPK where available, GCP/checkpoint support, CRS metadata, and error report |
| At most 1 metre accuracy | No survey validation exists | Quality warning only | Missing | Require checkpoints or GCPs and report RMSE, horizontal/vertical error, and confidence intervals |
| Under 15 minutes for a 10-minute video | No benchmark has been run | No worker deployment | Missing | Create benchmark dataset, GPU/CPU profiles, frame-budget controls, and latency telemetry |
| Entire visible scene coverage | No coverage metric exists | No reconstruction report | Missing | Compute camera frustum coverage, sparse/dense point density, occlusion zones, and missing-surface masks |
| OBJ, PLY, LAS, GeoTIFF, GLB/GLTF, FBX | Manifest contract names some formats; real files are not generated | `buildArtifactManifest` | Partial | Add verified converters and reject missing required outputs |
| Web or desktop visualization | Cesium globe and Three.js GLB viewer exist | Public workspaces | Partial | Add point-cloud rendering, orthomosaic, clipping, measurement, annotations, and artifact download |
| Near-real-time situational awareness | Map polling exists; reconstruction worker is not running | `GodsEyeMap.tsx` | Partial | Add WebSocket/SSE job progress, telemetry, alert pins, and worker heartbeat |
| Scalability | PostgreSQL queue schema exists; no durable worker deployment or backpressure | Worker scaffold | Partial | Add idempotent leases, retries, concurrency limits, quotas, dead-letter jobs, and object lifecycle policies |

## Current demo-only or misleading surfaces

The repository contains simulator and campus demo paths that are useful for development but cannot be used as evidence of SIH compliance. These include temporary simulator missions, campus sample defects, sample CCTV candidates, uploaded preview video, and UI pipeline stages that represent a contract rather than completed computation. They must be visibly labeled as demonstration data and must never be included in an SIH accuracy or completeness claim.

The current public reconstruction queue is also not equivalent to a working reconstruction system. It creates a database job only. A real job requires an HTTPS source URL, a persistent worker, object storage, an artifact-serving path, and a completed quality gate. The website now exposes this distinction through explicit statuses such as `awaiting_source`, `processing`, `completed`, and `failed`.

## Required production architecture

The minimum credible architecture is a web application, an object-storage upload service, a PostgreSQL job database, a persistent photogrammetry worker, an artifact store, and a browser viewer. The browser should upload the original video directly to object storage using a short-lived signed URL. The API should persist the object key, SHA-256 checksum, byte size, MIME type, and metadata. A queue worker should claim the job with a lease, download the immutable source, run the selected reconstruction engine, validate outputs, upload artifacts, and write an immutable manifest.

OpenDroneMap is the preferred first engine because it provides an end-to-end aerial mapping pipeline. COLMAP is an alternative when the team needs explicit control over feature extraction, matching, camera poses, dense stereo, and downstream mesh/point-cloud conversion. Neither engine alone guarantees one-metre accuracy. Accuracy must be measured using independent checkpoints, and the UI must report the measured error rather than a subjective grade.

## Acceptance tests that are still required

A submission-ready implementation must run a fixed 10-minute benchmark video through the entire system. The benchmark must record upload duration, queue delay, frame extraction rate, pose-recovery success, sparse-point count, dense-point count, mesh triangle count, artifact sizes, total processing time, horizontal RMSE, vertical RMSE, completeness ratio, and failure reasons. The test must be repeated for a 1080p capture, a 4K capture, motion blur, shadows, vegetation, dynamic objects, and missing RTK/GCP data.

A reconstruction should be marked `completed` only when the required artifacts exist, checksums are stored, the manifest records coordinate reference system and origin, the quality gate has passed, and the validation report is available. Otherwise it should remain `failed`, `awaiting_source`, or `review_required`.

## What is needed to make the website genuinely winnable

The next implementation phase must prioritize durable video upload, deployment of a real ODM/COLMAP worker, artifact storage, benchmark instrumentation, and accuracy validation. The God’s Eye map and WebGL viewer should then consume the real reconstruction manifest, not simulator records. Live CCTV should remain limited to owned or explicitly authorized feeds, while the map can show public satellite imagery and open-data layers with attribution.

Until an original SIH-style video is processed and independently checked, the project should be described as a **production-oriented prototype with an implemented processing contract**, not as a completed accurate 3D reconstruction system. This distinction is necessary for technical credibility and for avoiding a false claim of one-metre accuracy.

## References

[1]: /home/ubuntu/upload/SIH26158.pdf "SIH26158 problem statement PDF: Single-Pass Drone Video to Accurate 3D Model Generation System"
[2]: /home/ubuntu/upload/pasted_content.txt "Pasted SIH26158 problem statement text"
[3]: https://github.com/RidhimaKulashriz/DRIFT-AI-ML-Platform "DRIFT-AI-ML-Platform repository"
[4]: https://www.opendronemap.org/ "OpenDroneMap official project"
[5]: https://colmap.github.io/ "COLMAP official documentation"
[6]: https://cesium.com/platform/cesiumjs/ "CesiumJS official platform documentation"
[7]: https://threejs.org/ "Three.js official documentation"
