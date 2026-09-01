# External footage audit

## Existing Pexels clips

- Road clip: https://videos.pexels.com/video-files/14501261/14501261-hd_1920_1080_24fps.mp4. Direct visual analysis found real visible asphalt cracking and breakup around the central manhole cover throughout approximately 00:00–00:05. The existing overlay claim is supported.
- Railway clip: https://videos.pexels.com/video-files/4907960/4907960-hd_1920_1080_30fps.mp4. Direct visual analysis found intact rails, properly positioned concrete sleepers, and no visible broken rail, displaced sleeper, or measurable misalignment during approximately 00:00–00:18. It does not support a confirmed rail-damage claim.
- Bridge clip: https://videos.pexels.com/video-files/36553220/15498637_3840_2160_25fps.mp4. Direct visual analysis found a worker and a visible gap/missing exterior panel section, but no clear structural crack, spalling, or concrete damage in the sampled frames. It does not support a confirmed bridge-crack claim.

## Candidate openly licensed sources

- U.S. DOT / ROSA P annotated bridge inspection dataset: https://rosap.ntl.bts.gov/view/dot/88076, DOI https://doi.org/10.5281/zenodo.17477702. The page states the dataset contains drone-collected bridge inspection imagery and videos with annotated Crack, Spalling, Wetspot, Rust, ExposedRebars, and other concrete defect classes. It is open access under CC BY 4.0, but the ZIP is approximately 25.4 GB, so it is not practical to pull wholesale into this demo.
- Wikimedia Commons rail defects: https://commons.wikimedia.org/wiki/Category:Rail_defects. The category lists openly licensed rail-defect images, including longitudinal rail cracks and rail-head damage.
- Wikimedia Commons rail buckling: https://commons.wikimedia.org/wiki/Category:Rail_buckling. The category lists buckled rails and damaged railway-track media; the listed items are primarily still images rather than convenient video clips.

## Repair implication

The road clip can retain a confirmed visible-crack overlay. The rail and bridge clips should not be presented as confirmed damage unless replaced with real defect-bearing source media. A truthful interim UI must label them as condition-review footage. The public demo PDF endpoint was added and directly verified against https://drift-node-api.onrender.com/api/trpc/drift.reports.demoPdf; it returned a valid PDF payload that decoded to a 19-page A4 PDF of 162,580 bytes.
