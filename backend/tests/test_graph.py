from tests.conftest import make_edge, make_task


def test_chain_builds_and_states_derive(client):
    a = make_task(client, title="copy")
    b = make_task(client, title="dev")
    c = make_task(client, title="qa")

    assert make_edge(client, b["id"], a["id"]).status_code == 201
    assert make_edge(client, c["id"], b["id"]).status_code == 201

    tasks = {t["title"]: t for t in client.get("/api/graph").json()["tasks"]}
    assert tasks["copy"]["state"] == "available"
    assert tasks["dev"]["state"] == "locked"
    assert tasks["qa"]["state"] == "locked"

    client.post(f"/api/tasks/{a['id']}/complete")
    tasks = {t["title"]: t for t in client.get("/api/graph").json()["tasks"]}
    assert tasks["dev"]["state"] == "available"
    assert tasks["copy"]["state"] == "done"


def test_direct_cycle_rejected_with_path(client):
    a = make_task(client, title="A")
    b = make_task(client, title="B")
    assert make_edge(client, b["id"], a["id"]).status_code == 201
    response = make_edge(client, a["id"], b["id"])
    assert response.status_code == 409
    body = response.json()["detail"]
    assert set(body["cycle"]) == {"A", "B"}
    assert body["cycle"][0] == body["cycle"][-1]


def test_transitive_cycle_rejected_with_full_path(client):
    ids = {}
    for name in ("A", "B", "C"):
        ids[name] = make_task(client, title=name)["id"]
    assert make_edge(client, ids["B"], ids["A"]).status_code == 201
    assert make_edge(client, ids["C"], ids["B"]).status_code == 201
    response = make_edge(client, ids["A"], ids["C"])
    assert response.status_code == 409
    cycle = response.json()["detail"]["cycle"]
    assert cycle[0] == cycle[-1]
    assert set(cycle) == {"A", "B", "C"}


def test_self_loop_rejected(client):
    a = make_task(client)
    assert make_edge(client, a["id"], a["id"]).status_code in (400, 422)


def test_duplicate_edge_rejected(client):
    a = make_task(client)
    b = make_task(client)
    assert make_edge(client, b["id"], a["id"]).status_code == 201
    assert make_edge(client, b["id"], a["id"]).status_code == 409


def test_overdue_flag(client):
    from datetime import datetime, timedelta

    past = (datetime.now() - timedelta(days=1)).isoformat()
    future = (datetime.now() + timedelta(days=7)).isoformat()
    late = make_task(client, deadline=past)
    fine = make_task(client, deadline=future)
    tasks = {t["id"]: t for t in client.get("/api/tasks").json()}
    assert tasks[late["id"]]["overdue"] is True
    assert tasks[fine["id"]]["overdue"] is False


def test_blocking_count_counts_undone_dependents_only(client):
    a = make_task(client)
    b = make_task(client)
    c = make_task(client)
    make_edge(client, b["id"], a["id"])
    make_edge(client, c["id"], a["id"])
    client.post(f"/api/tasks/{b['id']}/complete")
    tasks = {t["id"]: t for t in client.get("/api/tasks").json()}
    assert tasks[a["id"]]["blocking_count"] == 1
