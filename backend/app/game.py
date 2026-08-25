from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.config import level_for_xp, level_threshold, xp_for_task
from app.models import ActivityLog, GameState, Task


def get_or_create_state(db: Session) -> GameState:
    state = db.get(GameState, 1)
    if state is None:
        state = GameState(id=1)
        db.add(state)
        db.commit()
    return state


def apply_completion(db: Session, task: Task, today: date) -> tuple[int, bool, int]:
    state = get_or_create_state(db)
    awarded = xp_for_task(task.duration_estimate, task.importance)
    old_level = level_for_xp(state.xp)
    new_total = state.xp + awarded
    new_level = level_for_xp(new_total)
    leveled_up = new_level > old_level

    if state.last_activity_date != today:
        yesterday = _yesterday(today)
        if state.last_activity_date == yesterday:
            state.streak_count += 1
        else:
            state.streak_count = 1
        state.longest_streak = max(state.longest_streak, state.streak_count)
        state.last_activity_date = today

    state.xp = new_total
    state.level = new_level
    if state.last_activity_date != today:
        yesterday = _yesterday(today)
        if state.last_activity_date == yesterday:
            state.streak_count += 1
        else:
            state.streak_count = 1
        state.longest_streak = max(state.longest_streak, state.streak_count)
        state.last_activity_date = today

    db.add(
        ActivityLog(
            task_id=task.id,
            type="level_up" if leveled_up else "task_complete",
            xp_delta=awarded,
            detail=f"{task.title} (level {old_level} -> {new_level})"
            if leveled_up
            else task.title,
        )
    )
    db.commit()
    return awarded, leveled_up, state.streak_count


def apply_reopen(db: Session, task: Task) -> int:
    state = get_or_create_state(db)
    penalty = min(state.xp, xp_for_task(task.duration_estimate, task.importance))
    state.xp -= penalty
    state.level = level_for_xp(state.xp)
    db.add(ActivityLog(task_id=task.id, type="task_reopen", xp_delta=-penalty, detail=task.title))
    db.commit()
    return penalty


def _yesterday(day: date) -> date:
    return day - timedelta(days=1)


def level_progress(state: GameState) -> tuple[int, int]:
    floor = level_threshold(state.level)
    ceiling = level_threshold(state.level + 1)
    return state.xp - floor, ceiling - floor
