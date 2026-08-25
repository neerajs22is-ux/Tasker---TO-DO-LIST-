from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.graph import cycle_path_if_added
from app.models import Dependency, Task
from app.schemas import CycleOut, EdgeCreate, EdgeOut

router = APIRouter(prefix="/dependencies", tags=["dependencies"])


def _edges(db: Session) -> list[tuple[int, int]]:
    return [(d.task_id, d.depends_on_task_id) for d in db.scalars(select(Dependency))]


@router.get("", response_model=list[EdgeOut])
def list_dependencies(db: Session = Depends(get_db)):
    return list(db.scalars(select(Dependency).order_by(Dependency.created_at)))


@router.post("", response_model=EdgeOut, status_code=201)
def create_dependency(payload: EdgeCreate, db: Session = Depends(get_db)):
    for tid in (payload.task_id, payload.depends_on_task_id):
        task = db.get(Task, tid)
        if task is None:
            raise HTTPException(404, f"task {tid} not found")
        if task.status == "draft":
            raise HTTPException(409, f"task {tid} is a draft — confirm its import batch first")
    existing = db.get(Dependency, (payload.task_id, payload.depends_on_task_id))
    if existing:
        raise HTTPException(409, "this dependency already exists")
    cycle = cycle_path_if_added(_edges(db), payload.task_id, payload.depends_on_task_id)
    if cycle:
        titles = []
        for node_id in cycle:
            titles.append(db.get(Task, node_id).title)
        problem = CycleOut(message="circular dependency rejected", cycle=titles)
        raise HTTPException(409, problem.model_dump())
    edge = Dependency(task_id=payload.task_id, depends_on_task_id=payload.depends_on_task_id)
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return edge


@router.delete("/{task_id}/{depends_on_task_id}", status_code=204)
def delete_dependency(
    task_id: int, depends_on_task_id: int, db: Session = Depends(get_db)
):
    edge = db.get(Dependency, (task_id, depends_on_task_id))
    if edge is None:
        raise HTTPException(404, "dependency not found")
    db.delete(edge)
    db.commit()
