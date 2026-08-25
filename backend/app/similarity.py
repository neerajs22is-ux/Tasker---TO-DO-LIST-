from __future__ import annotations

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import DUPLICATE_THRESHOLD, SUGGESTION_THRESHOLD
from app.embeddings import get_embedder
from app.models import Dependency, Task


def _cosine(a: bytes, b: bytes) -> float:
    va = np.frombuffer(a, dtype=np.float32)
    vb = np.frombuffer(b, dtype=np.float32)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    if denom == 0.0:
        return 0.0
    return float(np.dot(va, vb) / denom)


def embed_task_text(title: str, description: str | None) -> bytes:
    text = f"{title}\n{description or ''}".strip()
    return get_embedder().embed([text])[0]


def similar_tasks(db: Session, task: Task, exclude_drafts: bool = True) -> list[dict]:
    if task.embedding is None:
        return []
    query = select(Task).where(Task.id != task.id).where(Task.embedding.is_not(None))
    if exclude_drafts:
        query = query.where(Task.status != "draft")
    rows = list(db.scalars(query))
    scored = []
    for other in rows:
        score = _cosine(task.embedding, other.embedding)
        scored.append({"task": other, "score": round(score, 4)})
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored


def find_duplicates(db: Session, task: Task) -> list[dict]:
    return [
        {"task_id": m["task"].id, "title": m["task"].title, "score": m["score"]}
        for m in similar_tasks(db, task)
        if m["score"] >= DUPLICATE_THRESHOLD and m["task"].status != "done"
    ]


def suggest_dependencies(db: Session, task: Task) -> list[dict]:
    suggestions = []
    seen_prereq_ids: set[int] = set()
    for match in similar_tasks(db, task):
        if match["score"] < SUGGESTION_THRESHOLD:
            break
        source = match["task"]
        if source.status != "done":
            continue
        if task.project_id is not None and source.project_id == task.project_id:
            continue
        prereq_ids = db.scalars(
            select(Dependency.depends_on_task_id).where(Dependency.task_id == source.id)
        ).all()
        for prereq in db.scalars(select(Task).where(Task.id.in_(prereq_ids or [-1]))):
            if prereq.status == "done" or prereq.id in seen_prereq_ids:
                continue
            if prereq.id == task.id:
                continue
            existing = db.get(Dependency, (task.id, prereq.id))
            if existing:
                continue
            seen_prereq_ids.add(prereq.id)
            suggestions.append(
                {
                    "prerequisite_id": prereq.id,
                    "prerequisite_title": prereq.title,
                    "because_completed": source.title,
                    "score": match["score"],
                }
            )
            if len(suggestions) >= 3:
                return suggestions
    return suggestions
