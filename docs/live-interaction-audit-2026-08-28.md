# Live interaction audit

The production build at https://drift-ai-ml-platform.vercel.app/?deploy=43e1b32 was tested interactively after running the transient demo. Leaflet rendered real OpenStreetMap geography with 15 colored markers and matching severity counts: 7 critical, 6 high, 2 medium, 0 low. Selecting an advisory populated score, confidence, GPS, quality gate, and review context.

The OPEN KARTAVIEW action opened an in-page KartaView street-level imagery panel for the selected advisory. The panel returned image ID 1397637449, image GPS 28.605073, 77.199044, capture timestamp 2021-12-22 08:48:58, and displayed the disclaimer that third-party imagery is not DRIFT evidence or an engineering determination. This proves the action responds, but the returned KartaView point is approximately 200 m from the selected demo coordinate 28.606700, 77.199600 and must be handled as nearby imagery rather than exact marker evidence.

The latest production evidence set visibly contains: road crack reference video with an asphalt-breakup overlay; a Wikimedia public rail longitudinal-crack frame; and a Yellowstone National Park public-domain bridge-spalling/exposed-rebar frame. The latter two are real defect frames, not moving videos. The UI labels them as published defect frames and explicitly disclaims DRIFT field evidence.

The live Reports workspace now exposes DOWNLOAD DEMO PDF / BUILDING DEMO PDF. Direct Render API verification returned a valid 19-page A4 PDF (162,580 bytes) containing transient demo report content. The public Vercel origin itself is static and correctly routes frontend tRPC traffic to the Render backend.
