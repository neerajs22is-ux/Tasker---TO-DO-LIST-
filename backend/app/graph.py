from collections import defaultdict
from datetime import datetime

NodeId = int
Edge = tuple[NodeId, NodeId]
TaskState = str

STATE_LOCKED = "locked"
STATE_AVAILABLE = "available"
STATE_IN_PROGRESS = "in_progress"
STATE_DONE = "done"


def cycle_path_if_added(edges: list[Edge], frm: NodeId, to: NodeId) -> list[NodeId] | None:
    if frm == to:
        return [frm]
    adjacency: dict[NodeId, list[NodeId]] = defaultdict(list)
    for dependent, prerequisite in edges:
        adjacency[dependent].append(prerequisite)
    parent: dict[NodeId, NodeId | None] = {to: None}
    stack = [to]
    found = False
    while stack and not found:
        current = stack.pop()
        for nxt in adjacency[current]:
            if nxt not in parent:
                parent[nxt] = current
                if nxt == frm:
                    found = True
                    break
                stack.append(nxt)
    if not found:
        return None
    chain = [frm]
    cursor = frm
    while parent[cursor] is not None:
        cursor = parent[cursor]
        chain.append(cursor)
    return [frm] + list(reversed(chain))


def derive_states(
    statuses: dict[NodeId, tuple[str, datetime | None]], edges: list[Edge], now: datetime
) -> dict[NodeId, tuple[TaskState, bool]]:
    done = {tid for tid, (status, _) in statuses.items() if status == "done"}
    prerequisites: dict[NodeId, list[NodeId]] = defaultdict(list)
    for dependent, prerequisite in edges:
        prerequisites[dependent].append(prerequisite)
    result: dict[NodeId, tuple[TaskState, bool]] = {}
    for tid, (status, deadline) in statuses.items():
        if status == "done":
            state = STATE_DONE
        elif status == "in_progress":
            state = STATE_IN_PROGRESS
        elif any(p not in done for p in prerequisites[tid]):
            state = STATE_LOCKED
        else:
            state = STATE_AVAILABLE
        overdue = deadline is not None and deadline < now and status != "done"
        result[tid] = (state, overdue)
    return result


def blocking_counts(edges: list[Edge], done_ids: set[NodeId]) -> dict[NodeId, int]:
    counts: dict[NodeId, int] = defaultdict(int)
    for dependent, prerequisite in edges:
        if dependent not in done_ids:
            counts[prerequisite] += 1
    return counts
