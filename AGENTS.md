# Tasker — Agent Notes

Local-first AI-assisted todo tracker with a dependency DAG ("skill tree"), gamification layer, and (Phase 2) LLM ingestion via Groq.

## Commands

Backend (from `backend/`, venv at `backend/.venv`):

- Install: `.venv\Scripts\python.exe -m pip install -r requirements.txt`
- Migrate: `.venv\Scripts\python.exe -m alembic upgrade head`
- New migration: `.venv\Scripts\python.exe -m alembic revision --autogenerate -m "<msg>"`
- Run API: `.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000`
- Tests: `.venv\Scripts\python.exe -m pytest`
- Seed demo data: `.venv\Scripts\python.exe -m scripts.seed_demo`

Frontend (from `frontend/`):

- Install: `npm install`
- Dev: `npm run dev` (proxies `/api` to localhost:8000)
- Typecheck + build: `npm run build`
- Lint: `npm run lint`

## Architecture

- `backend/app/models.py` — SQLAlchemy 2.0 models. MetaData has explicit naming_convention (required for a mechanical Postgres migration later).
- `backend/app/graph.py` — pure functions: cycle detection (returns exact path), derived states (`locked/available/in_progress/done` + `overdue` flag), blocking counts.
- `backend/app/game.py` — XP formula, level curve, streak logic. Date-injected for testability.
- DB status values stored: `pending|in_progress|done`. `locked/available/overdue` are DERIVED at read time, never stored.
- `embedding` column is a nullable BLOB placeholder for Phase 2 (sentence-transformers, brute-force cosine in Python). Do not index it.
- Frontend talks only through `/api`; Vite dev server proxies to :8000 so no CORS coupling.
- Every mutation refetches the graph payload (`GET /api/graph`) — single source of truth, fine at local scale.

## Conventions

- No comments in code; types and names carry the docs.
- Config constants live in `backend/app/config.py` (XP weights, level curve).
- Phase discipline: no ingestion/interview/scheduling/stakes code until those phases start.

## Migration path (do not break)

SQLite now. Later: change connection string, run Alembic against Postgres, swap BLOB for `vector(384)`, replace brute-force similarity with pgvector query. Nothing above the data layer changes. This is why raw sqlite3 is forbidden and constraint names are explicit.
