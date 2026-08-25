from __future__ import annotations

import json
import re
import threading
from typing import Protocol

from app.config import (
    EXTRACTION_MODEL,
    GROQ_API_KEY,
    INTERVIEW_MODEL,
    MAX_CHUNK_CHARS,
)

EXTRACT_TASKS_PROMPT = """You extract structured tasks from raw notes for a dependency-graph todo app.
Return ONLY a JSON object {"tasks":[...]} where each task has:
- title: short imperative phrase (max 80 chars)
- rawContext: the original wording this came from
- guessedDuration: effort in HOURS as a number, or null
- guessedPriority: integer 1-5, or null
- confidence: object {duration, priority, scope} each 0-1
Rules:
- Only genuinely distinct pieces of work become separate tasks.
- Do NOT include relationships between tasks here — a later stage handles those.
- null over fabrication; reflect uncertainty in confidence.
JSON only."""

INFER_DEPS_PROMPT = """You are given a list of tasks extracted from someone's notes, plus an excerpt of those notes.
Decide which tasks MUST be completed before others. Be strict: only include a dependency when the
notes imply it, or when it is universally required in the real world for that specific task pair.
Return ONLY JSON {"dependencies":[{"prerequisiteId":"<id>","dependentId":"<id>","reason":"<one sentence>"}]}.
- Use exactly the ids provided.
- Every entry REQUIRES a concrete reason. No speculation, no filler.
- Empty list is a valid answer.
JSON only."""

DISCOVERY_PROMPT = """You are a meticulous project manager running a quick discovery check-in.
Given the draft tasks and an excerpt of the original notes, find the riskiest ASSUMPTIONS and
hidden PREREQUISITES people usually miss. Ask about the real world, e.g.:
"Get 3 LinkedIn recommendations" -> "Is your profile fully up to date?" / "Are you already
connected with all three people?"
Return ONLY JSON {"questions":[{"id":"q1","taskId":"<id>","question":"..."}],"done":false}.
- Max 3 questions. Open-ended, specific to THESE tasks, not estimates or dates.
- When nothing meaningful remains, return {"questions":[],"done":true}.
JSON only."""

ANSWER_INTERPRET_PROMPT = """A user answered a discovery question about their draft task.
Task: {task}. Their answer: "{answer}".
Decide what plan-change their answer implies and return ONLY JSON, one action:
{"action":"update","update":{"title":str|null,"description":str|null}}
{"action":"split","split":[{"title":str,"description":str}]}
{"action":"add_task","task":{"title":str,"description":str}}
{"action":"add_dependency","prerequisiteTitle":str,"reason":str}
{"action":"none"}
- add_dependency: the ANSWER revealed something external must happen/be true BEFORE this task;
  prerequisiteTitle is a short imperative name for that missing prerequisite.
- Prefer the least invasive action that captures what they said.
JSON only."""


GROUP_PROMPT = """You cluster extracted tasks into meaningful PROJECTS.
Input: tasks with ids, titles, context. Return ONLY JSON {"groups":[{"name":"<short project name>","taskIds":["<id>",...]}]}.
Rules:
- 2 to 5 groups maximum, each with a punchy uppercase-friendly name (max 40 chars).
- EVERY task id must appear in exactly one group. Use a group named "General" as catch-all if needed.
- Group by theme/domain (e.g. Website, Marketing, Admin), never by status or order.
JSON only."""


class ChunkParseError(Exception):
    pass


class LLMProvider(Protocol):
    def extract_tasks(self, text: str) -> list[dict]:
        ...

    def infer_dependencies(self, tasks: list[dict], excerpt: str) -> list[dict]:
        ...
    def discover_questions(self, context: dict) -> dict:
        ...
    def group_tasks(self, tasks: list[dict]) -> dict:
        ...

    def discover_questions(self, context: dict) -> dict:
        ...


def _extract_json(content: str) -> dict:
    content = content.strip()
    content = re.sub(r"^```(?:json)?\s*", "", content)
    content = re.sub(r"\s*```$", "", content)
    start = content.find("{")
    end = content.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object found")
    return json.loads(content[start : end + 1])


def _num_or_none(v):
    try:
        return max(0.0, float(v)) if v is not None else None
    except (TypeError, ValueError):
        return None


def _int_or_none(v):
    try:
        return max(1, min(5, int(v))) if v is not None else None
    except (TypeError, ValueError):
        return None


def validate_extraction(data: dict) -> list[dict]:
    tasks = data.get("tasks")
    if not isinstance(tasks, list):
        raise ValueError("missing tasks array")
    cleaned = []
    for t in tasks:
        if not isinstance(t, dict) or not isinstance(t.get("title"), str) or not t["title"].strip():
            continue
        conf = t.get("confidence") if isinstance(t.get("confidence"), dict) else {}
        cleaned.append(
            {
                "title": t["title"].strip()[:120],
                "rawContext": str(t.get("rawContext") or "")[:2000],
                "guessedDuration": _num_or_none(t.get("guessedDuration")),
                "guessedPriority": _int_or_none(t.get("guessedPriority")),
                "confidence": {
                    key: max(0.0, min(1.0, float(conf.get(key, 0.0) or 0.0)))
                    for key in ("duration", "priority", "scope")
                },
            }
        )
    return cleaned


class GroqProvider:
    def __init__(self) -> None:
        from groq import Groq

        self._client = Groq(api_key=GROQ_API_KEY)

    def _complete_json(self, model: str, system: str, user: str, retry_hint: str | None = None) -> dict:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user if retry_hint is None else f"{user}\n\n{retry_hint}"},
        ]
        response = self._client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0,
            response_format={"type": "json_object"},
        )
        return _extract_json(response.choices[0].message.content or "")

    def extract_tasks(self, text: str) -> list[dict]:
        user = f"Extract tasks from:\n\n{text[:MAX_CHUNK_CHARS]}"
        try:
            data = self._complete_json(EXTRACTION_MODEL, EXTRACT_TASKS_PROMPT, user)
        except (ValueError, json.JSONDecodeError):
            data = self._complete_json(
                EXTRACTION_MODEL,
                EXTRACT_TASKS_PROMPT,
                user,
                retry_hint='Your previous response was not valid JSON. Respond again with ONLY {"tasks":[...]}.',
            )
        return validate_extraction(data)

    def infer_dependencies(self, tasks: list[dict], excerpt: str) -> list[dict]:
        slim = [
            {"id": str(t["id"]), "title": t["title"], "context": (t.get("rawContext") or "")[:200]}
            for t in tasks
        ]
        user = json.dumps({"tasks": slim, "excerpt": excerpt[:2500]})
        try:
            data = self._complete_json(EXTRACTION_MODEL, INFER_DEPS_PROMPT, user)
        except (ValueError, json.JSONDecodeError):
            data = self._complete_json(
                EXTRACTION_MODEL,
                INFER_DEPS_PROMPT,
                user,
                retry_hint='Respond again with ONLY valid JSON {"dependencies":[...]}.',
            )
        valid_ids = {str(t["id"]) for t in tasks}
        out = []
        for d in data.get("dependencies", []):
            pre = str(d.get("prerequisiteId", ""))
            dep = str(d.get("dependentId", ""))
            reason = str(d.get("reason", "")).strip()
            if pre in valid_ids and dep in valid_ids and pre != dep and reason:
                out.append({"prerequisiteId": pre, "dependentId": dep, "reason": reason[:300]})
        return out

    def discover_questions(self, context: dict) -> dict:
        user = json.dumps(context)
        try:
            return self._complete_json(INTERVIEW_MODEL, DISCOVERY_PROMPT, user)
        except (ValueError, json.JSONDecodeError):
            return {"questions": [], "done": True}

    def group_tasks(self, tasks: list[dict]) -> dict:
        slim = [{"id": str(t["id"]), "title": t["title"], "context": (t.get("rawContext") or "")[:150]} for t in tasks]
        user = json.dumps({"tasks": slim})
        try:
            data = self._complete_json(EXTRACTION_MODEL, GROUP_PROMPT, user)
        except (ValueError, json.JSONDecodeError):
            data = self._complete_json(
                EXTRACTION_MODEL,
                GROUP_PROMPT,
                user,
                retry_hint='Respond again with ONLY valid JSON {"groups":[{"name":"...","taskIds":["..."]}]}',
            )
        valid_ids = {str(t["id"]) for t in tasks}
        groups = []
        seen_ids: set[str] = set()
        for g in data.get("groups", [])[:5]:
            name = str(g.get("name", "")).strip()[:40]
            ids = [str(i) for i in (g.get("taskIds") or []) if str(i) in valid_ids and str(i) not in seen_ids]
            if not name or not ids:
                continue
            seen_ids.update(ids)
            groups.append({"name": name, "taskIds": ids})
        leftovers = [i for i in valid_ids if i not in seen_ids]
        if leftovers and len(groups) < 5:
            groups.append({"name": "General", "taskIds": leftovers})
        elif leftovers:
            groups[-1]["taskIds"].extend(leftovers)
        return {"groups": groups}

    def interpret_answer(self, task_payload: dict, answer: str) -> dict:
        user = json.dumps({"task": task_payload, "answer": answer})
        try:
            data = self._complete_json(INTERVIEW_MODEL, ANSWER_INTERPRET_PROMPT, user)
        except (ValueError, json.JSONDecodeError):
            data = {"action": "update", "update": {"description": answer}}
        action = data.get("action")
        if action not in ("update", "split", "add_task", "add_dependency", "none"):
            data = {"action": "update", "update": {"description": answer}}
        return data


class MockProvider:
    def __init__(self) -> None:
        self.extract_calls = 0
        self.discover_calls = 0

    def extract_tasks(self, text: str) -> list[dict]:
        self.extract_calls += 1
        marker = "MOCK_SPLIT" in text
        base_conf = {"duration": 0.9, "priority": 0.9, "scope": 0.8}
        tasks = [
            {"title": "Draft alpha", "rawContext": text[:120], "guessedDuration": 2.0,
             "guessedPriority": 3, "confidence": dict(base_conf)},
            {"title": "Draft beta", "rawContext": text[:120], "guessedDuration": None,
             "guessedPriority": None, "confidence": {"duration": 0.3, "priority": 0.4, "scope": 0.9}},
            {"title": "Draft gamma", "rawContext": text[:120], "guessedDuration": None,
             "guessedPriority": 3, "confidence": {"duration": 0.3, "priority": 0.9, "scope": 0.9}},
        ]
        if marker:
            tasks.append(
                {"title": "Split target", "rawContext": text[:120], "guessedDuration": None,
                 "guessedPriority": 2, "confidence": {"duration": 0.85, "priority": 0.9, "scope": 0.15}}
            )
        return tasks

    def infer_dependencies(self, tasks: list[dict], excerpt: str) -> list[dict]:
        by_title = {t["title"]: t["id"] for t in tasks}
        out = []

        def link(pre_title, dep_title, reason):
            if pre_title in by_title and dep_title in by_title:
                out.append(
                    {"prerequisiteId": by_title[pre_title], "dependentId": by_title[dep_title], "reason": reason}
                )

        link("Draft alpha", "Draft beta", "alpha comes first in the notes order")
        link("Draft alpha", "Draft gamma", "gamma references alpha's output")

        if "CYCLE" in excerpt:
            link("Draft beta", "Draft gamma", "cycle probe")
            link("Draft gamma", "Draft beta", "cycle probe reverse")
        return out

    def discover_questions(self, context: dict) -> dict:
        self.discover_calls += 1
        if self.discover_calls > 1:
            return {"questions": [], "done": True}
        tasks = context.get("tasks", [])[:1]
        if not tasks:
            return {"questions": [], "done": True}
        t = tasks[0]
        return {
            "questions": [
                {
                    "id": f"d1-{t['id']}",
                    "taskId": str(t["id"]),
                    "question": f"What has to be true before '{t['title']}' can realistically start?",
                }
            ],
            "done": False,
        }

    def interpret_answer(self, task_payload: dict, answer: str) -> dict:
        low = answer.lower()
        if "not connected" in low or "missing" in low:
            return {
                "action": "add_task",
                "task": {"title": f"Reach out to contact for '{task_payload['title']}'", "description": answer},
            }
        if "split" in low:
            return {
                "action": "split",
                "split": [
                    {"title": f"{task_payload['title']} — part A", "description": answer},
                    {"title": f"{task_payload['title']} — part B", "description": ""},
                ],
            }
        if "after" in low and "before" not in low:
            return {
                "action": "add_dependency",
                "prerequisiteTitle": f"Prerequisite for '{task_payload['title']}'",
                "reason": answer,
            }
        if low.strip() in {"nothing", "looks good", "no"}:
            return {"action": "none"}
        return {"action": "update", "update": {"description": answer}}

    def group_tasks(self, tasks: list[dict]) -> dict:
        half = max(1, len(tasks) // 2)
        groups = [
            {"name": "Core Sprint", "taskIds": [str(t["id"]) for t in tasks[:half]]},
            {"name": "Support Work", "taskIds": [str(t["id"]) for t in tasks[half:]]},
        ]
        return {"groups": [g for g in groups if g["taskIds"]]}


_provider_lock = threading.Lock()
_provider_instance: LLMProvider | None = None


def get_provider() -> LLMProvider:
    global _provider_instance
    with _provider_lock:
        if _provider_instance is None:
            _provider_instance = GroqProvider() if GROQ_API_KEY else MockProvider()
        return _provider_instance


def set_provider(provider: LLMProvider | None) -> None:
    global _provider_instance
    with _provider_lock:
        _provider_instance = provider
