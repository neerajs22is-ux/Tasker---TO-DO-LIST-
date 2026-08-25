from datetime import date, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import level_for_xp, level_threshold, xp_for_task
from app.database import Base
from app.game import _yesterday, apply_completion, apply_reopen, get_or_create_state
from app.models import GameState

_engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
Base.metadata.create_all(_engine)
_session = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)()
_session.add(GameState(id=1))
_session.commit()


def fresh_session():
    Base.metadata.drop_all(_engine)
    Base.metadata.create_all(_engine)
    return sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)()


def test_xp_formula_scales_with_effort_and_importance():
    assert xp_for_task(1.0, 3) == 35
    assert xp_for_task(8.0, 5) > xp_for_task(1.0, 3)
    assert xp_for_task(None, None) >= 5
    assert xp_for_task(-4, 0) >= 5


def test_level_curve_monotonic():
    levels = [level_for_xp(x) for x in range(0, 2000, 25)]
    assert levels == sorted(levels)
    assert level_for_xp(0) == 1
    assert level_threshold(2) == 100
    assert level_threshold(3) == 300


class FakeTask:
    def __init__(self, id, title="t"):
        self.id = id
        self.title = title
        self.duration_estimate = 2.0
        self.importance = 3


def test_streak_increments_on_consecutive_days():
    session = fresh_session()
    task = FakeTask(1)

    _, _, s1 = apply_completion(session, task, date(2026, 3, 9))
    _, _, s2 = apply_completion(session, task, date(2026, 3, 10))
    _, _, s3 = apply_completion(session, task, date(2026, 3, 11))
    _, _, s4 = apply_completion(session, task, date(2026, 3, 12))
    assert (s1, s2, s3, s4) == (1, 2, 3, 4)


def test_streak_resets_after_gap():
    session = fresh_session()
    task = FakeTask(1)
    _, _, first = apply_completion(session, task, date(2026, 3, 1))
    _, _, after_gap = apply_completion(session, task, date(2026, 3, 5))
    assert (first, after_gap) == (1, 1)


def test_reopen_reverses_xp_not_streak():
    session = fresh_session()
    task = FakeTask(1)
    awarded, _, _ = apply_completion(session, task, date.today())
    penalty = apply_reopen(session, task)
    state = get_or_create_state(session)
    assert penalty == awarded
    assert state.xp == 0


def test_yesterday_helper():
    assert _yesterday(date(2026, 3, 10)) == date(2026, 3, 9)
