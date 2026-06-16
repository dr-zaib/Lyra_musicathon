"""Bridge: make the real engine (../engine) importable from the backend.

The engine is self-contained — it loads its own `engine/.env` (Musixmatch key),
caches its embeddings under `engine/data/`, and imports its sibling modules by
bare name. We just put `engine/` on sys.path and re-export what the route needs.
This is the swap that replaces `mock_engine` with the real trajectory engine.
"""
import sys
from pathlib import Path

_ENGINE = Path(__file__).parent.parent / "engine"
if str(_ENGINE) not in sys.path:
    sys.path.insert(0, str(_ENGINE))

import trajectory as _trajectory  # noqa: E402
import softmap as _softmap  # noqa: E402

# engine: deterministic structured data
build_trajectory = _trajectory.build_trajectory
# stub intent reader (placeholder for the LLM agent): text -> (distribution, confidence)
text_to_intent = _softmap.text_to_intent
