# archive/ — pre-deploy holding pen

Files no longer used by the running product, kept here temporarily during the
pre-deployment cleanup (2026-06-20). **The project does not depend on any of
these** — verified: every reference to them was a comment or doc prose, never an
import or a runtime file read.

**Delete this whole folder after a successful deploy.**

Contents:
- `mock_engine.py` — the backend's old MOCK engine; superseded by the real engine wired via `backend/engine_bridge.py` (no longer imported).
- `musixmatch_llms_full.txt` — a vendored copy of the public Musixmatch API docs (dev reference).
- `prompt_build_dataset.md` — one-off prompt used to build the Spotify seed dataset.
- `lyra_decisions_and_buildplan.md` — the original engine build plan; decisions now live in `CLAUDE.md`'s decision log.
- `FRONTEND_HANDOFF.md` — Alberto's frontend task list, completed; status captured in `CLAUDE.md`.
- `NIGHT_REPORT.md` — one-off overnight-run report.
- `web-README.md` — the create-next-app boilerplate README from `web/`.
