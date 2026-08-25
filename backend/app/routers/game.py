from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.game import get_or_create_state, level_progress
from app.models import ActivityLog, Dependency, ImportBatch, Project, Task
from app.schemas import GameStateOut, ProfileUpdate, ResetResult

router = APIRouter(prefix="/game-state", tags=["game"])


def _state_out(state) -> GameStateOut:
    into_level, for_next = level_progress(state)
    return GameStateOut(
        xp=state.xp,
        level=state.level,
        streak_count=state.streak_count,
        longest_streak=state.longest_streak,
        last_activity_date=state.last_activity_date,
        streak_freezes_available=state.streak_freezes_available,
        momentum_score=state.momentum_score,
        currency_balance=state.currency_balance,
        xp_into_level=into_level,
        xp_for_next_level=for_next,
        profile_name=state.profile_name,
        profile_color=state.profile_color,
    )


state_out = _state_out


@router.get("", response_model=GameStateOut)
def game_state(db: Session = Depends(get_db)):
    return state_out(get_or_create_state(db))


@router.patch("/profile", response_model=GameStateOut)
def update_profile(payload: ProfileUpdate, db: Session = Depends(get_db)):
    state = get_or_create_state(db)
    state.profile_name = payload.name.strip()[:40] or "PLAYER ONE"
    state.profile_color = payload.color
    db.commit()
    return state_out(state)


def _wipe_quests(db: Session) -> tuple[int, int]:
    logs_deleted = db.query(ActivityLog).delete(synchronize_session=False)
    deps_deleted = db.query(Dependency).delete(synchronize_session=False)
    tasks_deleted = db.query(Task).delete(synchronize_session=False)
    _ = deps_deleted
    db.commit()
    return tasks_deleted, logs_deleted


def _reset_stats(state) -> None:
    state.xp = 0
    state.level = 1
    state.streak_count = 0
    state.longest_streak = 0
    state.last_activity_date = None
    state.momentum_score = 50.0
    state.currency_balance = 0


@router.post("/reset/{scope}", response_model=ResetResult)
def reset(scope: str, db: Session = Depends(get_db)):
    from fastapi import HTTPException

    state = get_or_create_state(db)

    if scope == "stats":
        logs = db.query(ActivityLog).delete(synchronize_session=False)
        _reset_stats(state)
        db.commit()
        return ResetResult(reset="stats", logs_deleted=logs)

    if scope == "tasks":
        tasks, logs = _wipe_quests(db)
        return ResetResult(reset="tasks", quests_deleted=tasks, logs_deleted=logs)

    if scope == "all":
        tasks, logs = _wipe_quests(db)
        projects = db.query(Project).delete(synchronize_session=False)
        batches = db.query(ImportBatch).delete(synchronize_session=False)
        _ = projects, batches
        _reset_stats(state)
        db.commit()
        return ResetResult(reset="all", quests_deleted=tasks, logs_deleted=logs)

    raise HTTPException(404, "unknown reset scope")
