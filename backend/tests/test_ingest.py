import pytest

from app.ai import MockProvider, set_provider
from app.embeddings import DeterministicEmbedder, set_embedder


@pytest.fixture(autouse=True)
def mock_ai():
    provider = MockProvider()
    set_provider(provider)
    set_embedder(DeterministicEmbedder())
    yield provider
    set_provider(None)
    set_embedder(None)


def ingest_text(client, text="plan sprint alpha beta gamma"):
    response = client.post("/api/ingest/text", json={"text": text})
    assert response.status_code == 201, response.text
    return response.json()


def get_batch(client, batch_id):
    return client.get(f"/api/import-batches/{batch_id}").json()


def answer(client, batch_id, answers):
    return client.post(
        f"/api/import-batches/{batch_id}/answer", json={"answers": answers}
    ).json()


def skip_interview(client, batch_id):
    return client.post(f"/api/import-batches/{batch_id}/skip-interview").json()["batch"]


def confirm(client, batch_id, payload=None):
    return client.post(
        f"/api/import-batches/{batch_id}/confirm", json=payload or {}
    ).json()


def test_staging_creates_drafts_with_audited_dep_candidates_excluded_from_graph(client):
    data = ingest_text(client)
    batch = data["batch"]
    assert len(batch["drafts"]) == 3
    assert data["reused"] is False

    candidates = batch["depCandidates"]
    assert len(candidates) == 2
    assert all(c["accepted"] is True and c["reason"] for c in candidates)

    graph = client.get("/api/graph").json()
    assert graph["tasks"] == []


def test_complete_rejected_for_drafts(client):
    batch = ingest_text(client)["batch"]
    draft_id = batch["drafts"][0]["id"]
    assert client.post(f"/api/tasks/{draft_id}/complete").status_code == 409
    edge = client.post(
        "/api/dependencies", json={"task_id": draft_id, "depends_on_task_id": 999}
    )
    assert edge.status_code in (404, 409)


def test_discovery_then_mechanical_then_done_round_sequence(client):
    batch = ingest_text(client)["batch"]

    assert len(batch["questions"]) == 1
    assert batch["questions"][0]["field"] == "discovery"

    working = batch
    fields_seen = []
    rounds = 0
    while working["questions"] and rounds < 6:
        fields_seen.append([q["field"] for q in working["questions"]])
        answers = []
        for q in working["questions"]:
            if q["kind"] == "duration":
                answers.append({"questionId": q["id"], "value": "3"})
            elif q["kind"] == "choice":
                answers.append({"questionId": q["id"], "value": "Nothing"})
            else:
                answers.append(
                    {
                        "questionId": q["id"],
                        "value": (
                            "looks good"
                            if q["id"].startswith("checkin-")
                            else "no changes needed"
                        ),
                    }
                )
        working = answer(client, batch["id"], answers)["batch"]
        rounds += 1

    assert fields_seen[0][0] == "discovery"
    assert any("duration" in f for f in fields_seen)
    assert working["questions"] == []

    drafts = {d["title"]: d for d in working["drafts"]}
    assert drafts["Draft beta"]["duration_estimate"] == 3.0
    assert drafts["Draft gamma"]["duration_estimate"] == 3.0
    assert drafts["Draft alpha"]["guessed"] is False


def test_discovery_answer_can_add_missing_prerequisite_task(client):
    batch = ingest_text(client)["batch"]
    before_ids = {d["id"] for d in batch["drafts"]}

    result = answer(
        client,
        batch["id"],
        [
            {
                "questionId": batch["questions"][0]["id"],
                "value": "I am not connected with the people yet",
            }
        ],
    )["batch"]

    after_ids = {d["id"] for d in result["drafts"]}
    assert len(after_ids) == len(before_ids) + 1


def test_skip_marks_guessed_and_confirm_forges_candidates(client):
    data = ingest_text(client)
    batch = skip_interview(client, data["batch"]["id"])
    assert batch["skippedAll"] is True

    result = confirm(client, batch["id"])
    assert result["confirmed"] == 3
    assert result["remaining_drafts"] is False
    assert len(result["edges_created"]) == 2

    graph = client.get("/api/graph").json()
    titles = {t["title"]: t for t in graph["tasks"]}
    assert set(titles) == {"Draft alpha", "Draft beta", "Draft gamma"}
    edges = {(e["task_id"], e["depends_on_task_id"]) for e in graph["edges"]}
    assert (titles["Draft beta"]["id"], titles["Draft alpha"]["id"]) in edges
    assert (titles["Draft gamma"]["id"], titles["Draft alpha"]["id"]) in edges
    assert all(t["priority_score"] is not None for t in graph["tasks"])


def test_unchecked_candidate_is_not_forged(client):
    data = ingest_text(client)
    batch = skip_interview(client, data["batch"]["id"])

    kept = batch["depCandidates"][0]
    dropped = batch["depCandidates"][1]
    accepted_dependencies = [
        {"taskId": kept["dependentId"], "prerequisiteId": kept["prerequisiteId"]}
    ]

    result = confirm(
        client, batch["id"], {"acceptedDependencies": accepted_dependencies}
    )
    assert len(result["edges_created"]) == 1
    assert result["edges_created"][0]["prerequisite_title"] == kept["prerequisiteTitle"]


def test_cycle_in_candidates_rejected_not_fatal(client):
    class CycleProvider(MockProvider):
        def infer_dependencies(self, tasks, excerpt):
            base = super().infer_dependencies(tasks, excerpt)
            by_title = {t["title"]: t["id"] for t in tasks}
            base.append(
                {
                    "prerequisiteId": by_title["Draft beta"],
                    "dependentId": by_title["Draft gamma"],
                    "reason": "cycle probe",
                }
            )
            base.append(
                {
                    "prerequisiteId": by_title["Draft gamma"],
                    "dependentId": by_title["Draft beta"],
                    "reason": "cycle probe reverse",
                }
            )
            return base

    set_provider(CycleProvider())
    data = ingest_text(client)
    batch = skip_interview(client, data["batch"]["id"])
    result = confirm(client, batch["id"])

    graph = client.get("/api/graph").json()
    assert len(graph["tasks"]) == 3
    rejected_titles = {r["prerequisite_title"] for r in result["edges_rejected"]}
    assert "Draft beta" in rejected_titles or "Draft gamma" in rejected_titles


def test_total_extraction_failure_surfaces_errors(client):
    from app.ai import set_provider

    class BrokenProvider(MockProvider):
        def extract_tasks(self, text):
            raise RuntimeError("rate limit exceeded")

    set_provider(BrokenProvider())
    response = client.post("/api/ingest/text", json={"text": "anything"})
    assert response.status_code == 201
    batch = response.json()["batch"]
    assert batch["drafts"] == []
    assert batch["failedChunks"] >= 1
    assert any("rate limit" in e for e in batch["extractionErrors"])
    assert client.get("/api/graph").json()["tasks"] == []


def test_identical_text_reuses_previous_graph(client):
    first = ingest_text(client, "identical content plan")
    skip_interview(client, first["batch"]["id"])
    confirm(client, first["batch"]["id"])
    count_before = len(client.get("/api/graph").json()["tasks"])

    second = ingest_text(client, "identical content plan")
    assert second["reused"] is True
    assert second["created"] == 3

    graph = client.get("/api/graph").json()
    assert len(graph["tasks"]) == count_before + 3
    assert sum(1 for t in graph["tasks"] if t["status"] != "done") >= 3


def test_reuse_falls_back_to_fresh_after_tasks_wiped(client):
    first = ingest_text(client, "wipe then reupload same doc")
    skip_interview(client, first["batch"]["id"])
    confirm(client, first["batch"]["id"])

    client.post("/api/game-state/reset/tasks")

    second = ingest_text(client, "wipe then reupload same doc")
    assert second["reused"] is False
    assert len(second["batch"]["drafts"]) == 3

    confirm(client, second["batch"]["id"])
    graph = client.get("/api/graph").json()
    assert len(graph["tasks"]) == 3


def test_discard_hard_deletes_drafts(client):
    data = ingest_text(client)
    ids = [d["id"] for d in data["batch"]["drafts"]]
    assert client.delete(f"/api/import-batches/{data['batch']['id']}").status_code == 200
    for tid in ids:
        assert client.get(f"/api/tasks/{tid}").status_code == 404


def test_markdown_top_heading_creates_project(client):
    md = b"# Website Redesign\n\n- [ ] task one\n- [ ] task two\n"
    response = client.post(
        "/api/ingest/markdown", files={"file": ("notes.md", md, "text/markdown")}
    )
    assert response.status_code == 201
    batch = response.json()["batch"]

    projects = client.get("/api/projects").json()
    project = next(p for p in projects if p["name"] == "Website Redesign")
    assert all(d["project_id"] == project["id"] for d in batch["drafts"])
    client.delete(f"/api/import-batches/{batch['id']}")


def test_manual_create_gets_embedding_priority_and_duplicate_warning(client):
    a = client.post(
        "/api/tasks",
        json={"title": "Write homepage copy", "description": "hero text"},
    ).json()
    b = client.post(
        "/api/tasks",
        json={"title": "Write homepage copy", "description": "hero text"},
    ).json()

    fetched = client.get(f"/api/tasks/{b['id']}").json()
    assert fetched["priority_score"] is not None

    similar = client.get(f"/api/tasks/{b['id']}/similar").json()
    assert a["id"] in {d["task_id"] for d in similar["duplicates"]}


def test_smart_grouping_assigns_projects_when_batch_large(client):
    class FourTaskProvider(MockProvider):
        def extract_tasks(self, text):
            base = super().extract_tasks(text)
            base.append(
                {
                    "title": "Draft delta",
                    "rawContext": text[:120],
                    "guessedDuration": 1.0,
                    "guessedPriority": 2,
                    "confidence": {"duration": 0.9, "priority": 0.8, "scope": 0.9},
                }
            )
            return base

    set_provider(FourTaskProvider())
    data = ingest_text(client)
    batch = data["batch"]

    projects = client.get("/api/projects").json()
    names = {p["name"] for p in projects}
    assert "Core Sprint" in names
    assert "Support Work" in names
    assigned = {d["project_id"] for d in batch["drafts"]}
    assert None not in assigned
    assert len(assigned) == 2
    client.delete(f"/api/import-batches/{batch['id']}")


def test_small_batch_skips_grouping(client):
    data = ingest_text(client)
    projects = client.get("/api/projects").json()
    assert all(p["name"] != "Core Sprint" for p in projects)
    client.delete(f"/api/import-batches/{data['batch']['id']}")


def test_progress_log_stored_in_activity(client):
    task = client.post("/api/tasks", json={"title": "Logged task"}).json()

    empty = client.get(f"/api/tasks/{task['id']}/activity").json()
    assert empty == []

    ok = client.post(
        f"/api/tasks/{task['id']}/log", json={"note": "drafted two sections"}
    )
    assert ok.status_code == 201

    blank = client.post(f"/api/tasks/{task['id']}/log", json={"note": "  "})
    assert blank.status_code == 400

    draft_task = client.post("/api/ingest/text", json={"text": "plan things"}).json()["batch"]
    draft_id = draft_task["drafts"][0]["id"]
    assert (
        client.post(f"/api/tasks/{draft_id}/log", json={"note": "nope"}).status_code == 409
    )

    activity = client.get(f"/api/tasks/{task['id']}/activity").json()
    assert len(activity) == 1
    assert activity[0]["type"] == "progress"
    assert "two sections" in activity[0]["detail"]
