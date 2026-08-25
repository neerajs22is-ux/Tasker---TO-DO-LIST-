from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.game import apply_completion, apply_reopen
from app.graph import blocking_counts, derive_states
from app.models import ActivityLog, Dependency, GameState, Task
from app.priority import recompute_all_priorities
from app.schemas import CompleteOut, DeleteOut, TaskCreate, TaskOut, TaskUpdate
from app.similarity import embed_task_text

from .projects import ensure_project_exists

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _task_out(task: Task, db: Session) -> TaskOut:
    edges = [
        (d.task_id, d.depends_on_task_id)
        for d in db.scalars(select(Dependency))
    ]
    states = derive_states({t.id: (t.status, t.deadline) for t in [task]}, edges, datetime.now())
    state, overdue = states[task.id]
    done_ids = {t.id for t in db.scalars(select(Task).where(Task.status == "done"))}
    blocking = blocking_counts(edges, done_ids).get(task.id, 0)
    return TaskOut(
        **{
            "id": task.id,
            "project_id": task.project_id,
            "title": task.title,
            "description": task.description,
            "duration_estimate": task.duration_estimate,
            "importance": task.importance,
            "deadline": task.deadline,
            "status": task.status,
            "completed_at": task.completed_at,
            "state": state,
            "overdue": overdue,
            "blocking_count": blocking,
            "priority_score": task.priority_score,
        }
    )

def _graph_edges(db: Session) -> list[tuple[int, int]]:
    return [(d.task_id, d.depends_on_task_id) for d in db.scalars(select(Dependency))]


def _ensure_not_draft(task: Task) -> None:
    if task.status == "draft":
        raise HTTPException(409, "task is still a draft â€” confirm its import batch first")


@router.get("", response_model=list[TaskOut])
def list_tasks(include_drafts: bool = False, db: Session = Depends(get_db)):
    query = select(Task).order_by(Task.created_at)
    if not include_drafts:
        query = query.where(Task.status != "draft")
    tasks = list(db.scalars(query))
    edges = _graph_edges(db)
    states = derive_states({t.id: (t.status, t.deadline) for t in tasks}, edges, datetime.now())
    done_ids = {t.id for t in tasks if t.status == "done"}
    blocking = blocking_counts(edges, done_ids)
    return [
        TaskOut(
            id=t.id,
            project_id=t.project_id,
            title=t.title,
            description=t.description,
            duration_estimate=t.duration_estimate,
            importance=t.importance,
            deadline=t.deadline,
            status=t.status,
            completed_at=t.completed_at,
            state=states[t.id][0],
            overdue=states[t.id][1],
            blocking_count=blocking.get(t.id, 0),
            priority_score=t.priority_score,
        )
        for t in tasks
    ]


@router.post("", response_model=TaskOut, status_code=201)
def create_task(payload: TaskCreate, db: Session = Depends(get_db)):
    ensure_project_exists(db, payload.project_id)
    task = Task(**payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    task.embedding = embed_task_text(task.title, task.description)
    db.commit()
    recompute_all_priorities(db)
    return _task_out(task, db)


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "task not found")
    return _task_out(task, db)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "task not found")
    changes = payload.model_dump(exclude_unset=True)
    if "project_id" in changes:
        ensure_project_exists(db, changes["project_id"])
    if "status" in changes and (task.status == "done" or changes["status"] == "done"):
        raise HTTPException(400, "use /complete and /reopen for status transitions")
    text_changed = "title" in changes or "description" in changes
    for field, value in changes.items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    if text_changed:
        task.embedding = embed_task_text(task.title, task.description)
        db.commit()
    if any(f in changes for f in ("deadline", "duration_estimate", "importance", "status")):
        recompute_all_priorities(db)
    return _task_out(task, db)


@router.delete("/{task_id}", response_model=DeleteOut)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "task not found")
    was_draft = task.status == "draft"
    removed = (
        db.query(Dependency)
        .filter(
            (Dependency.task_id == task_id) | (Dependency.depends_on_task_id == task_id)
        )
        .delete(synchronize_session=False)
    )
    db.delete(task)
    db.commit()
    if not was_draft:
        recompute_all_priorities(db)
    return DeleteOut(id=task_id, removed_dependencies=removed)


@router.post("/{task_id}/complete", response_model=CompleteOut)
def complete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "task not found")
    _ensure_not_draft(task)
    if task.status == "done":
        raise HTTPException(409, "task is already complete")
    task.status = "done"
    task.completed_at = datetime.now()
    awarded, leveled_up, streak = apply_completion(db, task, datetime.now().date())
    recompute_all_priorities(db)
    return CompleteOut(
        awarded_xp=awarded,
        total_xp=db.get(GameState, 1).xp,
        level=db.get(GameState, 1).level,
        leveled_up=leveled_up,
        streak_count=streak,
    )


@router.post("/{task_id}/reopen", response_model=TaskOut)
def reopen_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "task not found")
    _ensure_not_draft(task)
    if task.status != "done":
        raise HTTPException(409, "task is not complete")
    apply_reopen(db, task)
    task.status = "pending"
    task.completed_at = None
    db.commit()
    db.refresh(task)
    recompute_all_priorities(db)
    return _task_out(task, db)


@router.post("/{task_id}/log", status_code=201)
def log_progress(task_id: int, body: dict, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "task not found")
    _ensure_not_draft(task)
    note = str(body.get("note", "")).strip()
    if not note:
        raise HTTPException(400, "note is required")
    entry = ActivityLog(task_id=task_id, type="progress", detail=note[:500])
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"id": entry.id, "at": entry.created_at, "detail": entry.detail}


@router.get("/{task_id}/activity", response_model=list[dict])
def task_activity(task_id: int, db: Session = Depends(get_db)):
    rows = db.scalars(
        select(ActivityLog)
        .where(ActivityLog.task_id == task_id)
        .order_by(ActivityLog.created_at.desc())
    )
    return [
        {"type": r.type, "xp_delta": r.xp_delta, "detail": r.detail, "at": r.created_at}
        for r in rows
    ]


@router.get("/{task_id}/similar")
def similar_tasks_route(task_id: int, db: Session = Depends(get_db)):
    from app.similarity import find_duplicates, suggest_dependencies

    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "task not found")
    if task.status == "draft":
        raise HTTPException(409, "similarity is computed during review instead")
    return {
        "duplicates": find_duplicates(db, task),
        "suggestions": suggest_dependencies(db, task),
    }
