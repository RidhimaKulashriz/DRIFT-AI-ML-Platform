# Frame-grounded detection findings

## Road clip

Frames `road-01.jpg` and `road-02.jpg` visibly show wet distressed asphalt around a central manhole cover, with a jagged broken/raised surface edge and branching surface fractures extending to the right and lower edge. The most defensible demo annotation is a polygon/box over the broken asphalt surrounding the central cover, labeled `SURFACE CRACK / BREAKUP (VISUAL OBSERVATION)`. Do not infer depth, severity, load rating, or repair priority from these frames.

Next: inspect railway and bridge frames before creating annotations.

## Railway clip

Frames `railway-01.jpg` and `railway-02.jpg` show a top-down railway corridor with two rails, sleepers, ballast, and track hardware. No clear broken rail, displaced sleeper, or measurable misalignment is visible at this sampling. A truthful overlay should be labeled `TRACK CONDITION / HARDWARE REVIEW ZONE (VISUAL OBSERVATION)` rather than claiming confirmed rail damage. The app should explicitly say that gauge, alignment, and structural safety require calibrated inspection.

## Bridge clip

Frames `bridge-01.jpg` and `bridge-02.jpg` show a real bridge inspection scene with workers and a lift beneath a snow-covered steel bridge. The sampled frames do not expose a clear close-up underside crack; they show the underside/inspection area at a distance. A truthful overlay should identify `UNDERSIDE INSPECTION AREA (VISUAL REVIEW ZONE)` and should not claim a confirmed crack from these frames. A close-up source frame or user-provided bridge footage is required for a real crack-confirmation overlay.
