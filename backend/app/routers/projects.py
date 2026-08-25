from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Project, Task
from app.schemas import DeleteOut, ProjectIn, ProjectOut

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return list(db.scalars(select(Project).order_by(Project.created_at)))


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(payload: ProjectIn, db: Session = Depends(get_db)):
    exists = db.scalar(select(Project).where(Project.name == payload.name))
    if exists:
        raise HTTPException(409, "a project with this name already exists")
    project = Project(name=payload.name, color=payload.color)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int, payload: ProjectIn, db: Session = Depends(get_db)
):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    clash = db.scalar(
        select(Project).where(Project.name == payload.name, Project.id != project_id)
    )
    if clash:
        raise HTTPException(409, "a project with this name already exists")
    project.name = payload.name
    project.color = payload.color
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", response_model=DeleteOut)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "project not found")
    count = len(project.tasks)
    for task in project.tasks:
        task.project_id = None
    db.delete(project)
    db.commit()
    return DeleteOut(id=project_id, removed_dependencies=count)


def ensure_project_exists(db: Session, project_id: int | None) -> None:
    if project_id is not None and db.get(Project, project_id) is None:
        raise HTTPException(400, "project does not exist")
