# Rules for build agents (shared working tree)

- Several agents edit this repo AT THE SAME TIME in the same folder (y:\sost_smart_corridor). Touch ONLY the paths in your scope. Never reformat, move or delete files outside it. Never run `git add/commit/stash/checkout/reset` — the orchestrator commits.
- Run only YOUR tests (name your test files), never the whole suite (other agents' code may be mid-edit).
- Backend: `cd backend && uv run pytest -q tests/test_<yours>.py`. Each test file sets `os.environ["SOST_DATABASE_URL"]` to its own temp SQLite file BEFORE importing `app`. Don't touch `backend/data/`.
- Dependencies: avoid new ones. If unavoidable, `uv add <pkg>` / `pnpm add <pkg>` once and mention it in your report (shared lockfiles).
- Dev servers: backend `uv run uvicorn app.main:app --port 80NN` and frontend `pnpm dev --port 51NN` with your own agent number (A1→8001/5101 … F2→8006/5106). Kill what you start.
- Nothing faked on screen. Errors are plain sentences saying what to do next.
- Finish with a report: files changed, test summary line, what you verified and how, contract ambiguities you resolved.
