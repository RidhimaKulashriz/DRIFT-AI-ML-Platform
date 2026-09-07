# SIH26158 research-backed reconstruction architecture

## Conclusion

A credible single-pass drone reconstruction system should not use one method for every output. The recommended architecture is a **metric geometry path plus a visual real-time path**.

The metric path should use an aerial mapping pipeline based on frame extraction, camera calibration, sequential/spatial matching, structure-from-motion, multi-view stereo, georeferencing, dense point-cloud generation, textured mesh generation, and independent checkpoint validation. OpenDroneMap is the most practical first implementation because its documented outputs include point clouds, textured models, orthophotos, digital elevation products, logs, and a browser-oriented Potree viewer. Its options include camera calibration, GPS accuracy, GCPs, rolling-shutter handling, GLTF output, LAS/LAZ point-cloud output, and orthophoto generation.[1]

COLMAP provides the most controllable classical pipeline. Its documentation describes feature extraction, sequential matching for video frames, spatial matching when accurate GPS is available, camera-model handling, sparse reconstruction, and dense reconstruction.[2] Sequential matching is especially appropriate for a drone video because nearby frames share overlap and exhaustive matching is unnecessary.

The visual path may use 3D Gaussian Splatting for fast novel-view rendering. The original paper reports high-quality real-time rendering at 1080p, but it also assumes calibrated camera poses and optimizes a radiance representation rather than producing a survey-grade metric mesh or point cloud.[3] Gaussian Splatting should therefore be treated as an optional visual preview, not as the SIH accuracy output.

DUSt3R provides a useful learned fallback for poorly calibrated or weakly geotagged imagery. Its paper describes pairwise pointmap regression without requiring prior camera calibration or poses, followed by global alignment for multiple images.[4] This makes it valuable for pose initialization, difficult frame pairs, or recovery when classical matching fails. It does not remove the need for scale alignment, georeferencing, and independent accuracy validation.

## Research-to-implementation decisions

| Decision | Research basis | Implementation consequence |
|---|---|---|
| Use sequential video sampling | COLMAP documents sequential matching for sequentially acquired frames | Extract frames at an adaptive rate and preserve frame order |
| Use GPS as a matching and alignment prior | COLMAP documents spatial matching using GPS; ODM exposes GPS accuracy and georeferencing controls | Preserve EXIF/flight metadata and pass GPS quality into processing |
| Use ODM for first end-to-end production path | ODM documents point cloud, textured model, orthophoto, DEM, GLTF, LAS, GCP, and precision workflows | Run ODM in a persistent worker and validate artifacts before completion |
| Use COLMAP when ODM fails or needs finer control | COLMAP exposes camera models, feature extraction, matching, sparse and dense stages | Add a selectable engine contract and preserve intermediate project files |
| Use DUSt3R/MASt3R for weak calibration and recovery | DUSt3R directly estimates pointmaps and can recover relative/absolute camera information | Use as an optional GPU-assisted pose/point initialization service |
| Use Gaussian Splatting for preview | Gaussian Splatting targets high-quality real-time rendering | Add a separate visual preview artifact, never conflate it with metric accuracy |
| Require checkpoints/GCPs for accuracy claims | ODM documents high-precision workflows and GCPs; single-pass geometry has unavoidable scale/occlusion limits | Expose RMSE, checkpoint count, CRS, and accuracy status in the manifest |

## Implemented worker changes

The worker now performs a real video-oriented sequence instead of passing a video file directly to ODM:

1. It downloads the original HTTPS source capture.
2. It probes duration, dimensions, size, and frame-rate metadata with FFprobe.
3. It rejects invalid or undersized inputs.
4. It adaptively samples frames with FFmpeg, bounded by a maximum frame budget.
5. It stores frames in an ODM-compatible project structure.
6. It runs OpenDroneMap with GLTF, LAS/LAZ point-cloud, high feature quality, high point-cloud quality, orthophoto, and concurrency settings.
7. It validates that both a textured model and a point-cloud artifact exist.
8. It writes frame count, sample rate, input probe data, engine, provenance, and artifact URLs into the job manifest.
9. It marks the quality gate as `review_required_until_checkpoint_validation` rather than claiming false one-metre accuracy.

## Required benchmark protocol

A submission-quality benchmark must use a fixed 10-minute 1080p/4K capture and record the following fields:

| Metric | Required measurement |
|---|---|
| Processing speed | Wall-clock time from worker claim to validated artifacts |
| Frame sampling | Number of retained frames and sampling rate |
| Registration | Registered-frame ratio, reprojection error, and camera-pose continuity |
| Geometry | Sparse-point count, dense-point count, mesh triangle count, and point density |
| Coverage | Visible-scene coverage and explicitly identified occlusion zones |
| Accuracy | Horizontal and vertical RMSE against checkpoints or GCPs |
| Outputs | GLB/GLTF, LAS/LAZ/PLY, OBJ, GeoTIFF, and optional FBX checksums |
| Robustness | Results under blur, shadows, vegetation, dynamic objects, and missing RTK |

The website should expose these values from the worker manifest rather than showing a single subjective quality letter.

## Remaining deployment requirement

The worker code is now a real processing implementation, but it still requires a persistent host with Docker, PostgreSQL access, object storage, and sufficient disk/RAM/CPU or GPU. The current sandbox has FFmpeg but does not have Docker, OpenDroneMap, or COLMAP installed, so an end-to-end reconstruction cannot be executed in this session. A public job with only a local file name cannot be processed; the source must be an HTTPS object-storage URL.

## References

[1]: https://docs.opendronemap.org/ "OpenDroneMap official documentation"
[2]: https://colmap.github.io/tutorial.html "COLMAP official reconstruction tutorial"
[3]: https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/ "3D Gaussian Splatting for Real-Time Radiance Field Rendering"
[4]: https://arxiv.org/abs/2312.14132 "DUSt3R: Geometric 3D Vision Made Easy"
[5]: https://github.com/naver/dust3r "Official DUSt3R implementation"
[6]: https://github.com/graphdeco-inria/gaussian-splatting "Official Gaussian Splatting implementation"
