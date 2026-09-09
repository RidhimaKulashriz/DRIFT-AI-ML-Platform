import sys
import os

# Add the project root so `import backend.xxx` works.
_ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _ROOT)

# Add backend/ to sys.path so intra-package bare imports
# (e.g. `from video_stream import ...`) resolve correctly when
# uvicorn loads "backend.main:app" as a dotted module path.
_BACKEND = os.path.join(_ROOT, "backend")
sys.path.insert(0, _BACKEND)

# CRITICAL: Bake the paths into PYTHONPATH so that the WatchFiles
# reloader child process (which doesn't inherit sys.path mutations)
# can also resolve all modules.
_existing = os.environ.get("PYTHONPATH", "")
os.environ["PYTHONPATH"] = os.pathsep.join(
    [p for p in [_ROOT, _BACKEND, _existing] if p]
)

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", os.getenv("GCS_PORT", "8000"))),
        reload=os.getenv("DRIFT_RELOAD", "0") == "1",
        reload_dirs=[_BACKEND],   # only watch backend/ — avoids re-triggering on data writes
    )

