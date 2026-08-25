from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import (
    BLOCKING_WEIGHT,
    EFFORT_PENALTY_WEIGHT,
    IMPORTANCE_WEIGHT,
    URGENCY_WEIGHT,
    URGENCY_WINDOW_DAYS,
)
from app.models import Dependency, Task


def transitive_dependents(edges: list[tuple[int, int]], start_id: int) -> set[int]:
    dependents: dict[int, list[int]] = defaultdict(list)
    for dependent, _prerequisite in edges:
        dependents[_prerequisite].append(dependent)
    seen: set[int] = set()
    queue = deque([start_id])
    while queue:
        current = queue.popleft()
        for nxt in dependents.get(current, []):
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    return seen


def urgency_score(deadline: datetime | None, now: datetime) -> float:
    if deadline is None:
        return 0.0
    days_remaining = (deadline - now).total_seconds() / 86400.0
    if days_remaining <= 0:
        return 100.0
    return max(0.0, round(100.0 * (1.0 - days_remaining / URGENCY_WINDOW_DAYS), 2))


def compute_priority(
    task: Task,
    blocking_count: int,
    max_duration: float,
    now: datetime,
) -> float:
    urgency = urgency_score(task.deadline, now)
    importance = task.importance
    normalized_duration = 0.0
    if task.duration_estimate and task.duration_estimate > 0 and max_duration > 0:
        normalized_duration = min(1.0, task.duration_estimate / max_duration)
    score = (
        URGENCY_WEIGHT * (urgency / 100.0)
        + IMPORTANCE_WEIGHT * ((importance - 1) / 4.0)
        + BLOCKING_WEIGHT * blocking_count
        - EFFORT_PENALTY_WEIGHT * normalized_duration
    )
    return round(score, 2)


def recompute_all_priorities(db: Session, now: datetime | None = None) -> None:
    now = now or datetime.now()
    tasks = [t for t in db.scalars(select(Task)) if t.status != "draft"]
    edges = [
        (d.task_id, d.depends_on_task_id)
        for d in db.scalars(select(Dependency))
    ]
    durations = [t.duration_estimate or 0.0 for t in tasks]
    max_duration = max(durations) if durations else 0.0
    for t in tasks:
        reachable = transitive_dependents(edges, t.id)
        t.priority_score = compute_priority(t, len(reachable), max_duration, now)
    db.commit()
