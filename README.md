# Tasker

A local-first, AI-assisted todo tracker. Paste messy notes or drop a file, answer a short AI interview, and your work lands as a living dependency DAG ("skill tree") wrapped in an XP/streak game layer.

**Flow:** Home → Capture (text / Markdown / PDF → extraction → chat-style interview → review) → Dashboard (graph + list). Markdown `# headings` become Projects.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + TypeScript + Vite, Tailwind v4, shadcn-style components, Zustand, Framer Motion |
| Graph | @xyflow/react + @dagrejs/dagre auto-layout |
| Backend | Python 3.12 + FastAPI + uvicorn |
| Persistence | SQLite via SQLAlchemy 2 + Alembic (Postgres+pgvector migration path designed in) |

## Quickstart

**Backend** (first run):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m alembic upgrade head
```

**Run it** (two terminals):

```powershell
# terminal 1 — API on :8000
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# terminal 2 — UI on :5173
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

Optional demo data:

```powershell
.venv\Scripts\python.exe -m scripts.seed_demo
```

## Feature map (Phase 1)

- Projects + flat tasks: title, description, duration estimate (hours), importance 1–5, deadline
- Dependency edges `A → B` ("A before B"); cycles rejected server-side with the exact path shown in the UI
- Derived task states: `locked` / `available` / `in_progress` / `done`, plus overdue flag
- Unified skill-tree graph view: dagre auto-layout, state-colored glowing nodes, chained locked nodes, pulsing overdue nodes, project color filter, drag-to-connect with live cycle rejection
- List view (mobile-friendly): group by project, one-tap check-off
- Game layer: XP per completion (effort × importance), levels, daily completion streak, activity log
- Deleting a task cascades its dependency edges (UI warns how many dependents are affected first)

## Design decisions on record

- Flat tasks + edges + projects; no parent/child hierarchy
- Desktop-first; mobile gets list/check-off only
- Dark RPG theme default
- Streak = completed ≥1 task that day
- SQLite now; SQLAlchemy/Alembic chosen specifically so Postgres later is connection-string + column-type work
- Embeddings: local `sentence-transformers` (all-MiniLM-L6-v2) stored as BLOB, brute-force cosine; Groq behind `LLMProvider` (extraction=llama-3.3-70b, interview=llama-3.1-8b — config-swappable)
- No Groq key set → app auto-falls back to a deterministic MockProvider (tests/dev without network)

See `taskforge-spec.md` sections 2–4 for the full product spec and phased roadmap.

## Phase 2 — AI ingestion

Paste text / drop Markdown / upload PDF → Groq extracts structured draft quests (chunked, JSON-validated with one retry) → drafts staged **outside** your real graph → clarifying interview on low-confidence fields (structured cards + free-text scope splits) → Review screen (inline edits, duplicate warnings via local embeddings, one-click dependency suggestions, cycle-checked confirm) → quests land in the tree with computed priority scores.

Setup: copy `backend/.env.example` to `backend/.env`, add your Groq key. First run downloads the embedding model (~90MB).
