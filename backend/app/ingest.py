from __future__ import annotations

import hashlib
import io
import json
import re
from difflib import SequenceMatcher

from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import ChunkParseError, get_provider
from app.config import (
    CONFIDENCE_THRESHOLD,
    DEFAULT_DURATION_HOURS,
    MAX_CHUNK_CHARS,
)
from app.graph import cycle_path_if_added
from app.models import Dependency, ImportBatch, Project, Task
from app.priority import recompute_all_priorities
from app.similarity import embed_task_text

FUZZY_MATCH_RATIO = 0.85
MERGE_RATIO = 0.9
FIELD_PRIORITY = ("dependencies", "duration", "scope", "priority")


def _norm(title: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", title.lower()).strip()


def _ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def text_to_chunks(text: str) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        if len(para) > MAX_CHUNK_CHARS:
            if current:
                chunks.append(current)
                current = ""
            for i in range(0, len(para), MAX_CHUNK_CHARS):
                chunks.append(para[i : i + MAX_CHUNK_CHARS])
            continue
        if len(current) + len(para) + 2 > MAX_CHUNK_CHARS:
            chunks.append(current)
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current:
        chunks.append(current)
    return chunks or ([text[:MAX_CHUNK_CHARS]] if text else [])


def markdown_to_sections(md: str) -> list[str]:
    lines = md.splitlines()
    sections: list[str] = []
    current: list[str] = []
    for line in lines:
        if re.match(r"^#{1,4}\s+", line) and current:
            sections.append("\n".join(current))
            current = [line]
        else:
            current.append(line)
    if current:
        sections.append("\n".join(current))
    return [s for s in sections if s.strip()]


def markdown_to_chunks(md: str) -> list[str]:
    chunks: list[str] = []
    for section in markdown_to_sections(md):
        if len(section) <= MAX_CHUNK_CHARS:
            chunks.append(section)
        else:
            chunks.extend(text_to_chunks(section))
    return chunks or [md[:MAX_CHUNK_CHARS]]


def pdf_to_chunks(data: bytes) -> list[str]:
    import pdfplumber

    pages: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text.strip():
                pages.append(text)
    joined = "\n\n".join(pages)
    return text_to_chunks(joined)


def parse_source(
    source_type: str, payload: str | bytes
) -> tuple[list[str], str, str | None, str]:
    if source_type == "markdown":
        md = payload.decode("utf-8") if isinstance(payload, bytes) else payload
        heading = None
        match = re.search(r"^#\s+(.+)$", md, re.MULTILINE)
        if match and match.group(1).strip():
            heading = match.group(1).strip()[:120]
        normalized = re.sub(r"\s+", " ", md.strip().lower())
        return markdown_to_chunks(md), md, heading, hashlib.sha256(normalized.encode()).hexdigest()
    if source_type == "pdf":
        data = payload if isinstance(payload, bytes) else payload.encode("utf-8")
        return pdf_to_chunks(data), "", None, hashlib.sha256(data).hexdigest()
    text = payload.decode("utf-8") if isinstance(payload, bytes) else payload
    normalized = re.sub(r"\s+", " ", text.strip().lower())
    return text_to_chunks(text), text, None, hashlib.sha256(normalized.encode()).hexdigest()


def run_extraction(chunks: list[str]) -> tuple[list[dict], int, list[str]]:
    provider = get_provider()
    extracted: list[dict] = []
    failures = 0
    errors: list[str] = []
    for chunk in chunks:
        try:
            extracted.extend(provider.extract_tasks(chunk))
        except ChunkParseError:
            failures += 1
        except Exception as exc:
            failures += 1
            if len(errors) < 3:
                errors.append(str(exc)[:300])
    return extracted, failures, errors


def merge_extracted(tasks: list[dict]) -> list[dict]:
    merged: list[dict] = []
    for task in sorted(tasks, key=lambda t: t["title"].lower()):
        duplicate = next(
            (m for m in merged if _ratio(m["title"], task["title"]) >= MERGE_RATIO),
            None,
        )
        if duplicate is None:
            merged.append(json.loads(json.dumps(task)))
            continue
        duplicate["rawContext"] = f"{duplicate['rawContext']}\n{task['rawContext']}".strip()
        durations = [d for d in (duplicate["guessedDuration"], task["guessedDuration"]) if d]
        duplicate["guessedDuration"] = max(durations) if durations else None
        priorities = [p for p in (duplicate["guessedPriority"], task["guessedPriority"]) if p]
        duplicate["guessedPriority"] = max(priorities) if priorities else None
        for key in ("duration", "priority", "scope"):
            duplicate["confidence"][key] = min(
                duplicate["confidence"][key], task["confidence"][key]
            )
    return merged


def group_into_projects(db: Session, extracted: list[dict]) -> dict[int, int | None]:
    if len(extracted) < 4:
        return {}
    try:
        payload = [
            {"id": i, "title": t["title"], "rawContext": t["rawContext"]}
            for i, t in enumerate(extracted)
        ]
        result = get_provider().group_tasks(payload)
        groups = result.get("groups", [])
    except Exception:
        return {}
    if len(groups) < 2:
        return {}

    assignment: dict[int, int | None] = {}
    for g in groups[:5]:
        name = str(g.get("name", "")).strip()[:60]
        if not name:
            continue
        project = db.scalar(select(Project).where(sa_func.lower(Project.name) == name.lower()))
        if project is None:
            project = Project(name=name)
            db.add(project)
            db.flush()
        for idx in g.get("taskIds", []):
            try:
                assignment[int(idx)] = project.id
            except (TypeError, ValueError):
                continue
    return assignment


def stage_drafts(db: Session, source_type: str, payload: str | bytes) -> tuple[ImportBatch, dict]:
    chunks, raw, suggested_project, content_hash = parse_source(source_type, payload)

    previous = db.scalar(
        select(ImportBatch)
        .where(ImportBatch.content_hash == content_hash)
        .where(ImportBatch.status != "discarded")
        .where(ImportBatch.reused_from.is_(None))
        .order_by(ImportBatch.created_at.desc())
    )
    if previous is not None:
        surviving = db.scalar(
            select(Task.id).where(Task.import_batch_id == previous.id).limit(1)
        )
        if surviving is not None:
            return _reuse_previous(db, previous)
        db.delete(previous)
        try:
            db.commit()
        except Exception:
            db.rollback()

    chunks_list, raw_text = chunks, raw
    extracted, failures, extraction_errors = run_extraction(chunks_list)
    extracted = merge_extracted(extracted)

    project_id: int | None = None
    if suggested_project:
        project = db.scalar(
            select(Project).where(sa_func.lower(Project.name) == suggested_project.lower())
        )
        if project is None:
            project = Project(name=suggested_project)
            db.add(project)
            db.flush()
        project_id = project.id

    grouped: dict[int, int | None] = {}
    if len(extracted) >= 4:
        db.flush()
        grouped = group_into_projects(db, extracted)

    batch = ImportBatch(
        source_type=source_type,
        raw_source=raw_text[:20000],
        content_hash=content_hash,
        status="awaiting_interview",
    )
    db.add(batch)
    db.flush()

    staged: list[tuple[Task, dict]] = []
    for idx, item in enumerate(extracted):
        task = Task(
            project_id=grouped.get(idx, project_id),
            title=item["title"][:255],
            description=item["rawContext"] or None,
            duration_estimate=item["guessedDuration"],
            importance=item["guessedPriority"] or 3,
            status="draft",
            import_batch_id=batch.id,
        )
        db.add(task)
        db.flush()
        staged.append((task, item))

    for task, item in staged:
        task.embedding = embed_task_text(task.title, task.description)
        task.confidence = json.dumps(
            {
                "confidence": item["confidence"],
                "resolvedDependencyIds": [],
                "unresolvedReferences": [],
                "guessed": False,
                "trivial": bool(item.get("trivial"))
                or (item["guessedDuration"] is not None and item["guessedDuration"] <= 0.5),
            }
        )
        task.confidence = json.dumps(
            {
                "confidence": item["confidence"],
                "resolvedDependencyIds": [],
                "unresolvedReferences": [],
                "guessed": False,
            }
        )

    state: dict = {
        "phase": "discovery",
        "discoveryRounds": 0,
        "depCandidates": [],
        "pendingQuestions": [],
        "failedChunks": failures,
        "extractionErrors": extraction_errors,
        "skippedAll": False,
    }

    if staged:
        dep_payload = [
            {"id": t.id, "title": t.title, "rawContext": t.description or ""}
            for t, _ in staged
        ]
        try:
            inferred = get_provider().infer_dependencies(dep_payload, raw_text[:3000])
        except Exception as exc:
            inferred = []
            extraction_errors.append(f"dependency inference failed: {str(exc)[:200]}")
        id_set = {t.id for t, _ in staged}
        candidates = []
        for d in inferred:
            try:
                dependent_id = int(d.get("dependentId"))
                prerequisite_id = int(d.get("prerequisiteId"))
            except (TypeError, ValueError):
                continue
            if dependent_id not in id_set or prerequisite_id not in id_set:
                continue
            if dependent_id == prerequisite_id:
                continue
            candidates.append(
                {
                    "dependentId": dependent_id,
                    "prerequisiteId": prerequisite_id,
                    "reason": str(d.get("reason", ""))[:300],
                    "accepted": True,
                }
            )
        state["depCandidates"] = candidates

    batch.interview_state = json.dumps(state)
    db.commit()
    build_interview_round(db, batch)
    return batch, {"reused": False, "created": len(staged), "edges": len(state.get("depCandidates", []))}


def _reuse_previous(db: Session, previous: ImportBatch) -> tuple[ImportBatch, dict]:
    originals = list(
        db.scalars(select(Task).where(Task.import_batch_id == previous.id))
    )
    batch = ImportBatch(
        source_type=previous.source_type,
        raw_source=previous.raw_source,
        content_hash=previous.content_hash,
        reused_from=previous.id,
        status="confirmed",
    )
    db.add(batch)
    db.flush()

    edges_prev = [
        (d.task_id, d.depends_on_task_id)
        for d in db.scalars(select(Dependency))
    ]
    id_map: dict[int, int] = {}
    created = 0
    for original in originals:
        if original.status == "draft":
            continue
        clone = Task(
            project_id=original.project_id,
            title=original.title,
            description=original.description,
            duration_estimate=original.duration_estimate,
            importance=original.importance,
            deadline=original.deadline,
            status="pending" if original.status != "done" else "done",
            completed_at=None,
            embedding=embed_task_text(original.title, original.description),
            confidence=original.confidence,
            priority_score=original.priority_score,
            import_batch_id=batch.id,
        )
        db.add(clone)
        db.flush()
        id_map[original.id] = clone.id
        created += 1

    new_edges = 0
    for old_dependent, old_prerequisite in edges_prev:
        if old_dependent in id_map and old_prerequisite in id_map:
            db.add(
                Dependency(task_id=id_map[old_dependent], depends_on_task_id=id_map[old_prerequisite])
            )
            new_edges += 1

    db.commit()
    recompute_all_priorities(db)
    return batch, {"reused": True, "created": created, "edges": new_edges}


KIND_BY_FIELD = {
    "dependencies": "choice",
    "duration": "duration",
    "scope": "text",
    "priority": "choice",
}


def _next_gap_for_task(task: Task, asked_fields: set[str]) -> dict | None:
    if task.confidence is None:
        return None
    blob = json.loads(task.confidence)
    conf = blob.get("confidence", {})
    for field in FIELD_PRIORITY:
        key = f"{task.id}:{field}"
        if field in asked_fields or key in asked_fields:
            continue
        if field == "duration" and task.duration_estimate is None:
            return {"field": field, "score": conf.get(field, 0.0)}
        if conf.get(field, 1.0) < 0.6:
            return {"field": field, "score": conf.get(field, 0.0)}
    return None


def _fallback_question(task_id: int, title: str, gap: str) -> dict:
    base = {"id": f"{gap}-{task_id}", "taskId": str(task_id), "field": gap}
    if gap == "duration":
        return {**base, "question": f'How many hours will "{title}" take?', "kind": "duration"}
    if gap == "dependencies":
        return {
            **base,
            "question": f'What must happen before "{title}"?',
            "kind": "choice",
            "options": ["Nothing"],
        }
    return {
        **base,
        "question": f'Tell me more about "{title}" — what does done look like?',
        "kind": "text",
    }


def build_interview_round(db: Session, batch: ImportBatch) -> bool:
    state = json.loads(batch.interview_state or "{}")
    rounds = state.setdefault("rounds", [])
    asked_fields: set[str] = {
        f"{q['taskId']}:{q['field']}" for round_ in rounds for q in round_
    }
    drafts = list(
        db.scalars(
            select(Task).where(Task.import_batch_id == batch.id, Task.status == "draft")
        )
    )

    phase = state.get("phase", "discovery")

    if phase == "discovery":
        if state.get("discoveryRounds", 0) < 2:
            discovery_candidates = [
                t
                for t in drafts
                if not t.confidence or not json.loads(t.confidence).get("trivial", False)
            ]
            context = {
                "tasks": [
                    {"id": str(t.id), "title": t.title, "description": t.description or ""}
                    for t in discovery_candidates
                ],
                "excerpt": (batch.raw_source or "")[:2500],
            }
            result = get_provider().discover_questions(context)
            state["discoveryRounds"] = state.get("discoveryRounds", 0) + 1
            questions = []
            for q in result.get("questions", [])[:3]:
                if isinstance(q, dict) and q.get("taskId") and q.get("question"):
                    questions.append(
                        {
                            "id": str(q.get("id") or f"d{q['taskId']}-{state['discoveryRounds']}"),
                            "taskId": str(q["taskId"]),
                            "field": "discovery",
                            "kind": "text",
                            "question": str(q["question"])[:400],
                        }
                    )
            valid_ids = {str(t.id) for t in discovery_candidates}
            questions = [q for q in questions if q["taskId"] in valid_ids]
            if questions:
                state["pendingQuestions"] = questions
                batch.interview_state = json.dumps(state)
                db.commit()
                return True
            state["phase"] = "mechanical"
        else:
            state["phase"] = "mechanical"

    if state.get("phase") == "mechanical":
        need_duration = [
            t
            for t in drafts
            if t.duration_estimate is None and f"{t.id}:duration" not in asked_fields
        ]
        if need_duration:
            grid = {
                "id": "duration-grid",
                "taskId": str(need_duration[0].id),
                "field": "duration",
                "kind": "duration_grid",
                "question": f"Set effort (hours) for {len(need_duration)} quest(s):",
                "taskIds": [str(t.id) for t in need_duration],
            }
            state["pendingQuestions"] = [grid]
            batch.interview_state = json.dumps(state)
            db.commit()
            return True

    state["phase"] = "done"
    if drafts and not state.get("checkinDone") and not state.get("skippedAll"):
        titles = '", "'.join(t.title for t in drafts[:5])
        state["pendingQuestions"] = [
            {
                "id": f"checkin-{batch.id}",
                "taskId": str(drafts[0].id),
                "field": "scope",
                "kind": "text",
                "question": (
                    f'Sanity check — I read {len(drafts)} quests: "{titles}". '
                    "Anything missing, badly titled, or should one of them split?"
                ),
            }
        ]
        state["checkinDone"] = True
        batch.interview_state = json.dumps(state)
        db.commit()
        return True

    state["pendingQuestions"] = []
    batch.interview_state = json.dumps(state)
    db.commit()
    return False


AFFIRMATIONS = {
    "looks good",
    "good",
    "ok",
    "okay",
    "all good",
    "fine",
    "no",
    "nope",
    "nothing",
    "nothing missing",
}


def _apply_discovery(
    db: Session,
    batch: ImportBatch,
    task: Task | None,
    text_value: str,
    counters: dict,
) -> None:
    if text_value.lower() in AFFIRMATIONS or text_value == "":
        return
    if task is None:
        return
    result = get_provider().interpret_answer(
        {"id": task.id, "title": task.title, "description": task.description},
        text_value,
    )
    action = result.get("action")
    if action == "split" and result.get("split"):
        for part in result["split"][:4]:
            if not isinstance(part, dict) or not part.get("title"):
                continue
            _clone_draft(db, batch, task, str(part["title"]), part.get("description"))
            counters["splits_created"] += 1
        db.delete(task)
    elif action == "add_task" and isinstance(result.get("task"), dict):
        _clone_draft(
            db,
            batch,
            task,
            str(result["task"].get("title", "New quest")),
            result["task"].get("description"),
        )
        counters["tasks_added"] += 1
    elif action == "add_dependency":
        prereq_title = str(result.get("prerequisiteTitle", ""))[:120]
        prereq = _find_or_create_prerequisite(db, batch, prereq_title)
        blob = json.loads(task.confidence or "{}")
        candidates = blob.get("resolvedDependencyIds", [])
        if prereq.id not in candidates and prereq.id != task.id:
            candidates.append(prereq.id)
            blob["resolvedDependencyIds"] = candidates
            task.confidence = json.dumps(blob)
            state = json.loads(batch.interview_state or "{}")
            state.setdefault("depCandidates", []).append(
                {
                    "dependentId": task.id,
                    "prerequisiteId": prereq.id,
                    "reason": str(result.get("reason", ""))[:300] or text_value[:200],
                    "accepted": True,
                }
            )
            batch.interview_state = json.dumps(state)
        counters["dependencies_added"] += 1
    else:
        update = result.get("update") or {}
        if update.get("title"):
            task.title = str(update["title"])[:255]
        if update.get("description"):
            task.description = str(update["description"])


def answer_questions(db: Session, batch: ImportBatch, answers: list[dict]) -> dict:
    state = json.loads(batch.interview_state or "{}")
    pending = {q["id"]: q for q in state.get("pendingQuestions", [])}
    counters = {"applied": 0, "splits_created": 0, "tasks_added": 0, "dependencies_added": 0}

    for answer in answers:
        question = pending.get(answer.get("questionId", ""))
        if not question or question.get("status") == "answered":
            continue
        apply_similar = bool(answer.get("applySimilar"))
        value = answer.get("value")
        text_value = value.strip() if isinstance(value, str) else ""

        if question["kind"] == "duration_grid":
            mapping = value if isinstance(value, dict) else {}
            id_list = [str(t) for t in question.get("taskIds", [])]
            fallback = mapping.get("*")
            for tid in id_list:
                raw = mapping.get(tid, fallback)
                try:
                    hours = max(0.25, float(raw))
                except (TypeError, ValueError):
                    hours = DEFAULT_DURATION_HOURS
                t = db.get(Task, int(tid))
                if t is not None and t.status == "draft":
                    t.duration_estimate = hours
                    _set_confidence(t, "duration", 1.0)

        elif question["field"] == "duration":
            try:
                hours = max(0.25, float(value))
            except (TypeError, ValueError):
                hours = DEFAULT_DURATION_HOURS
            if task := db.get(Task, int(question["taskId"])):
                if task.status == "draft":
                    task.duration_estimate = hours
                    _set_confidence(task, "duration", 1.0)

        elif question["field"] == "discovery":
            target = db.get(Task, int(question["taskId"]))
            if target is not None and target.status != "draft":
                target = None
            self_text = text_value

            if apply_similar:
                siblings = [
                    q2
                    for q2 in pending.values()
                    if q2["field"] == "discovery"
                    and q2["id"] != question["id"]
                    and q2.get("status") != "answered"
                ][:3]
            else:
                siblings = []

            _apply_discovery(db, batch, target, self_text, counters)
            for sib in siblings:
                sib_task = db.get(Task, int(sib["taskId"]))
                if sib_task is not None and sib_task.status == "draft":
                    before_title = sib_task.title
                    _apply_discovery(db, batch, sib_task, self_text, counters)
                    if sib_task.title != before_title or sib_task not in db.new:
                        counters["tasks_added"] += 0
                sib["status"] = "answered"
                sib["answer"] = (self_text or "")[:500]
                counters["applied"] += 1

        elif text_value or value is not None:
            if (task := db.get(Task, int(question["taskId"]))) and task.status == "draft":
                if question["field"] in ("scope", "priority", "dependencies"):
                    _set_confidence(task, question["field"], 1.0)
                    if question["field"] == "scope":
                        task.description = text_value or task.description

        question["status"] = "answered"
        question["answer"] = (
            json.dumps(value) if isinstance(value, dict) else (text_value or str(value))
        )[:500]
        counters["applied"] += 1

    db.commit()

    still_pending = [q for q in state.get("pendingQuestions", []) if q.get("status") != "answered"]
    state["pendingQuestions"] = still_pending
    batch.interview_state = json.dumps(state)
    db.commit()

    more = False
    if not still_pending:
        more = build_interview_round(db, batch)

    return {
        "applied": counters["applied"],
        "splitsCreated": counters["splits_created"],
        "tasksAdded": counters["tasks_added"],
        "dependenciesAdded": counters["dependencies_added"],
        "moreQuestions": more,
    }


def _clone_draft(db: Session, batch: ImportBatch, source: Task, title: str, description) -> Task:
    clone = Task(
        project_id=source.project_id,
        title=title[:255],
        description=(str(description) or "").strip() or None,
        duration_estimate=source.duration_estimate,
        importance=source.importance,
        status="draft",
        import_batch_id=batch.id,
        confidence=json.dumps(
            {
                "confidence": {"duration": 0.9, "priority": 0.9, "scope": 1.0},
                "resolvedDependencyIds": [],
                "unresolvedReferences": [],
                "guessed": True,
            }
        ),
    )
    db.add(clone)
    db.flush()
    clone.embedding = embed_task_text(clone.title, clone.description)
    return clone


def skip_interview(db: Session, batch: ImportBatch) -> None:
    drafts = list(
        db.scalars(select(Task).where(Task.import_batch_id == batch.id, Task.status == "draft"))
    )
    for task in drafts:
        blob = json.loads(task.confidence or "{}")
        conf = blob.setdefault("confidence", {})
        changed = False
        for field in FIELD_PRIORITY:
            if conf.get(field, 1.0) < 0.6:
                conf[field] = 1.0
                changed = True
        if task.duration_estimate is None:
            task.duration_estimate = DEFAULT_DURATION_HOURS
            changed = True
        if changed:
            blob["guessed"] = True
            task.confidence = json.dumps(blob)
    state = json.loads(batch.interview_state or "{}")
    state["pendingQuestions"] = []
    state["skippedAll"] = True
    state["phase"] = "done"
    batch.interview_state = json.dumps(state)
    db.commit()


def confirm_batch(
    db: Session,
    batch: ImportBatch,
    task_ids: list[int] | None = None,
    accepted_dependencies: list[dict] | None = None,
    accepted_suggestions: list[dict] | None = None,
) -> dict:
    drafts = list(
        db.scalars(select(Task).where(Task.import_batch_id == batch.id, Task.status == "draft"))
    )
    selected = drafts if task_ids is None else [t for t in drafts if t.id in set(task_ids)]

    state = json.loads(batch.interview_state or "{}")
    candidate_map: dict[int, set[int]] = {}
    if accepted_dependencies is None:
        for c in state.get("depCandidates", []):
            if c.get("accepted", True):
                candidate_map.setdefault(int(c["dependentId"]), set()).add(
                    int(c["prerequisiteId"])
                )
    else:
        for pair in accepted_dependencies:
            candidate_map.setdefault(int(pair["taskId"]), set()).add(int(pair["prerequisiteId"]))
        for pair in accepted_suggestions or []:
            candidate_map.setdefault(int(pair["taskId"]), set()).add(int(pair["prerequisiteId"]))
    for draft in drafts:
        blob = json.loads(draft.confidence or "{}")
        for rid in blob.get("resolvedDependencyIds", []):
            candidate_map.setdefault(draft.id, set()).add(int(rid))

    title_by_id = {t.id: t.title for t in db.scalars(select(Task))}
    edges_now = [
        (d.task_id, d.depends_on_task_id) for d in db.scalars(select(Dependency))
    ]
    created_edges: list[dict] = []
    rejected: list[dict] = []

    for draft in selected:
        for prereq_id in sorted(candidate_map.get(draft.id, set())):
            if prereq_id == draft.id or db.get(Dependency, (draft.id, prereq_id)):
                continue
            cycle = cycle_path_if_added(edges_now, draft.id, prereq_id)
            if cycle:
                rejected.append(
                    {
                        "dependent_title": draft.title,
                        "prerequisite_title": title_by_id.get(prereq_id, "?"),
                        "cycle": [title_by_id.get(n, "?") for n in cycle],
                    }
                )
                continue
            db.add(Dependency(task_id=draft.id, depends_on_task_id=prereq_id))
            edges_now.append((draft.id, prereq_id))
            created_edges.append(
                {
                    "dependent_title": draft.title,
                    "prerequisite_title": title_by_id.get(prereq_id, "?"),
                }
            )

    confirmed_count = 0
    for draft in selected:
        draft.status = "pending"
        if draft.duration_estimate is None:
            draft.duration_estimate = DEFAULT_DURATION_HOURS
        confirmed_count += 1

    batch.status = "confirmed"
    db.commit()
    recompute_all_priorities(db)

    remaining = db.scalar(
        select(Task.id).where(Task.import_batch_id == batch.id, Task.status == "draft")
    )
    return {
        "confirmed": confirmed_count,
        "edges_created": created_edges,
        "edges_rejected": rejected,
        "remaining_drafts": remaining is not None,
    }


def discard_batch(db: Session, batch: ImportBatch) -> None:
    drafts = list(
        db.scalars(select(Task).where(Task.import_batch_id == batch.id, Task.status == "draft"))
    )
    for draft in drafts:
        db.delete(draft)
    batch.status = "discarded"
    db.commit()


def _set_confidence(task: Task, field: str, value: float) -> None:
    blob = json.loads(task.confidence or "{}")
    blob.setdefault("confidence", {})[field] = value
    task.confidence = json.dumps(blob)


def _find_or_create_prerequisite(db: Session, batch: ImportBatch, title: str) -> Task:
    drafts = list(
        db.scalars(select(Task).where(Task.import_batch_id == batch.id, Task.status == "draft"))
    )
    best = None
    best_score = 0.0
    for draft in drafts:
        score = _ratio(title, draft.title)
        if score > best_score:
            best_score = score
            best = draft
    if best is not None and best_score >= FUZZY_MATCH_RATIO:
        return best
    existing = list(db.scalars(select(Task).where(Task.status != "draft")))
    for task in existing:
        if _ratio(title, task.title) >= FUZZY_MATCH_RATIO:
            return task
    new_task = Task(
        project_id=None,
        title=title,
        description="Discovered during import interview",
        status="draft",
        importance=3,
        import_batch_id=batch.id,
        embedding=embed_task_text(title, None),
        confidence=json.dumps(
            {
                "confidence": {"duration": 0.5, "priority": 0.8, "scope": 0.8},
                "resolvedDependencyIds": [],
                "unresolvedReferences": [],
                "guessed": True,
            }
        ),
    )
    db.add(new_task)
    db.flush()
    return new_task


def batch_dto(db: Session, batch: ImportBatch) -> dict:
    drafts = list(
        db.scalars(
            select(Task)
            .where(Task.import_batch_id == batch.id, Task.status == "draft")
            .order_by(Task.created_at)
        )
    )
    state = json.loads(batch.interview_state or "{}")
    title_by_id = {t.id: t.title for t in db.scalars(select(Task))}
    from app.similarity import find_duplicates, suggest_dependencies

    return {
        "id": batch.id,
        "sourceType": batch.source_type,
        "status": batch.status,
        "createdAt": batch.created_at.isoformat(),
        "failedChunks": state.get("failedChunks", 0),
        "extractionErrors": state.get("extractionErrors", []),
        "skippedAll": state.get("skippedAll", False),
        "phase": state.get("phase", "done"),
        "questions": state.get("pendingQuestions", []),
        "depCandidates": [
            {
                "dependentId": c["dependentId"],
                "prerequisiteId": c["prerequisiteId"],
                "dependentTitle": title_by_id.get(c["dependentId"], "?"),
                "prerequisiteTitle": title_by_id.get(c["prerequisiteId"], "?"),
                "reason": c.get("reason", ""),
                "accepted": c.get("accepted", True),
            }
            for c in state.get("depCandidates", [])
        ],
        "drafts": [_draft_dto(db, t) for t in drafts],
    }


def _draft_dto(db: Session, task: Task) -> dict:
    blob = json.loads(task.confidence or "{}")
    conf = blob.get("confidence", {})
    from app.similarity import find_duplicates, suggest_dependencies

    duplicates = find_duplicates(db, task)
    suggestions = suggest_dependencies(db, task)
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "duration_estimate": task.duration_estimate,
        "importance": task.importance,
        "project_id": task.project_id,
        "confidence": conf,
        "belowThreshold": {k: v for k, v in conf.items() if v < CONFIDENCE_THRESHOLD},
        "guessed": blob.get("guessed", False),
        "resolvedDependencyIds": blob.get("resolvedDependencyIds", []),
        "unresolvedReferences": blob.get("unresolvedReferences", []),
        "duplicates": duplicates,
        "suggestions": suggestions,
    }
