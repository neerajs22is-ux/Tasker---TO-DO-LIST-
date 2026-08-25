from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.graph import TaskState


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    color: str = Field(default="#38bdf8", pattern=r"^#[0-9a-fA-F]{6}$")


class ProjectOut(ProjectIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    duration_estimate: float | None = Field(default=None, gt=0, le=1000)
    importance: int = Field(default=3, ge=1, le=5)
    deadline: datetime | None = None
    project_id: int | None = None


class TaskCreate(TaskIn):
    pass


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    duration_estimate: float | None = Field(default=None, gt=0, le=1000)
    importance: int | None = Field(default=None, ge=1, le=5)
    deadline: datetime | None = None
    project_id: int | None = None
    status: str | None = None

    @model_validator(mode="after")
    def _validate_status(self):
        if self.status is not None and self.status not in ("pending", "in_progress"):
            raise ValueError("use /complete to mark a task done")
        return self


class TaskOut(TaskIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    completed_at: datetime | None
    state: TaskState
    overdue: bool
    blocking_count: int
    priority_score: float | None


class EdgeCreate(BaseModel):
    task_id: int
    depends_on_task_id: int

    @model_validator(mode="after")
    def _no_self(self):
        if self.task_id == self.depends_on_task_id:
            raise ValueError("a task cannot depend on itself")
        return self


class EdgeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    task_id: int
    depends_on_task_id: int


class GameStateOut(BaseModel):
    xp: int
    level: int
    streak_count: int
    longest_streak: int
    last_activity_date: date | None
    streak_freezes_available: int
    momentum_score: float
    currency_balance: int
    xp_into_level: int
    xp_for_next_level: int
    profile_name: str
    profile_color: str


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class ResetResult(BaseModel):
    reset: str
    quests_deleted: int = 0
    logs_deleted: int = 0


class GraphOut(BaseModel):
    projects: list[ProjectOut]
    tasks: list[TaskOut]
    edges: list[EdgeOut]
    game_state: GameStateOut


class CompleteOut(BaseModel):
    awarded_xp: int
    total_xp: int
    level: int
    leveled_up: bool
    streak_count: int


class CycleOut(BaseModel):
    message: str
    cycle: list[str]


class DeleteOut(BaseModel):
    id: int
    removed_dependencies: int
