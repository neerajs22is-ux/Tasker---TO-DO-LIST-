import os

os.environ["TASKER_DB"] = "sqlite://"
os.environ["TASKER_EMBEDDER"] = "mock"

from datetime import date  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import GameState  # noqa: E402


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = TestingSession()
    session.add(GameState(id=1))
    session.commit()

    def override():
        yield session

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    session.close()
    engine.dispose()


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = TestingSession()
    session.add(GameState(id=1))
    session.commit()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture()
def today() -> date:
    return date.today()


def make_task(client, **overrides):
    payload = {"title": overrides.pop("title", "task")}
    payload.update(overrides)
    response = client.post("/api/tasks", json=payload)
    assert response.status_code == 201
    return response.json()


def make_edge(client, task_id, depends_on):
    return client.post(
        "/api/dependencies", json={"task_id": task_id, "depends_on_task_id": depends_on}
    )
