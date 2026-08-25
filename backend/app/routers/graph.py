from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.game import get_or_create_state
from app.graph import blocking_counts, derive_states
from app.models import Dependency, Project, Task
from app.routers.game import state_out
from app.schemas import EdgeOut, GraphOut, ProjectOut, TaskOut

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("", response_model=GraphOut)
def graph_payload(db: Session = Depends(get_db)):
    state = get_or_create_state(db)

    projects = list(
        db.scalars(select(Project).order_by(Project.created_at))
    )
    tasks = list(
        db.scalars(select(Task).where(Task.status != "draft").order_by(Task.created_at))
    )
    deps = list(db.scalars(select(Dependency).order_by(Dependency.created_at)))

    edges = [(d.task_id, d.depends_on_task_id) for d in deps]
    states = derive_states({t.id: (t.status, t.deadline) for t in tasks}, edges, datetime.now())
    done_ids = {t.id for t in tasks if t.status == "done"}
    blocking = blocking_counts(edges, done_ids)

    game_state_out = state_out(state)

    return GraphOut(
        projects=[ProjectOut.model_validate(p) for p in projects],
        tasks=[
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
        ],
        edges=[EdgeOut.model_validate(d) for d in deps],
        game_state=game_state_out,
    )
