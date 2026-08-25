from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import dependencies, game, graph, ingest, projects, tasks

app = FastAPI(title="Tasker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(dependencies.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(game.router, prefix="/api")
app.include_router(ingest.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
