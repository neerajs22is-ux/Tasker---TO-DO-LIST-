from datetime import datetime, timedelta

from app.database import SessionLocal
from app.game import apply_completion
from app.models import Dependency, GameState, Project, Task


def main():
    db = SessionLocal()
    if db.get(GameState, 1) is None:
        db.add(GameState(id=1))
    if db.query(Project).count() > 0:
        print("database already has data; skipping seed")
        return

    site = Project(name="Website Redesign", color="#a78bfa")
    life = Project(name="Life Admin", color="#34d399")
    db.add_all([site, life])
    db.flush()

    now = datetime.now()

    def task(project_id, title, hours, importance, deadline_days=None, description=None):
        deadline = (
            now + timedelta(days=deadline_days) if deadline_days is not None else None
        )
        t = Task(
            project_id=project_id,
            title=title,
            description=description,
            duration_estimate=hours,
            importance=importance,
            deadline=deadline,
        )
        db.add(t)
        db.flush()
        return t

    copy = task(site.id, "Write new website copy", 3.0, 4, -2)
    design = task(site.id, "Design homepage mockups", 6.0, 5, 5)
    dev = task(site.id, "Build frontend from mockups", 12.0, 5, 18, description="React + Tailwind rebuild of all marketing pages")
    qa = task(site.id, "QA pass across browsers", 4.0, 3, 22)
    launch = task(
        site.id, "Launch redesigned site", 1.0, 5, 25, description="DNS cutover + announcement post"
    )

    rent = task(life.id, "Pay rent", 0.2, 5, 3)
    dentist = task(life.id, "Book dentist appointment", 0.3, 2, None)

    edges = [
        (design.id, copy.id),
        (dev.id, design.id),
        (qa.id, dev.id),
        (launch.id, qa.id),
    ]
    for dependent, prerequisite in edges:
        db.add(Dependency(task_id=dependent, depends_on_task_id=prerequisite))
    db.flush()

    copy.status = "done"
    copy.completed_at = now
    apply_completion(db, copy, (now - timedelta(days=1)).date())
    rent.status = "done"
    rent.completed_at = now
    apply_completion(db, rent, now.date())

    db.commit()
    print("seeded: Website Redesign chain (copy done -> design -> dev -> qa -> launch) + Life Admin")


if __name__ == "__main__":
    main()
