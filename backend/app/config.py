import os

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("TASKER_DB", "sqlite:///./tasker.db")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
EXTRACTION_MODEL = os.getenv("TASKER_EXTRACTION_MODEL", "llama-3.3-70b-versatile")
INTERVIEW_MODEL = os.getenv("TASKER_INTERVIEW_MODEL", "llama-3.1-8b-instant")

MAX_CHUNK_CHARS = 6000
CONFIDENCE_THRESHOLD = 0.6
DUPLICATE_THRESHOLD = 0.85
SUGGESTION_THRESHOLD = 0.6
DEFAULT_DURATION_HOURS = 1.0

URGENCY_WEIGHT = 30
IMPORTANCE_WEIGHT = 10
BLOCKING_WEIGHT = 4
EFFORT_PENALTY_WEIGHT = 15
URGENCY_WINDOW_DAYS = 21.0

XP_POINTS_PER_HOUR = 5.0
XP_PER_IMPORTANCE_POINT = 10
MIN_XP = 5
DEFAULT_IMPORTANCE = 3
STARTING_STREAK_FREEZES = 0
MOMENTUM_START = 50.0
STARTING_CURRENCY = 0
MAX_LEVEL = 99


def xp_for_task(duration_hours: float | None, importance: int | None) -> int:
    hours = duration_hours if duration_hours and duration_hours > 0 else 1.0
    imp = importance if importance else DEFAULT_IMPORTANCE
    return max(MIN_XP, round(hours * XP_POINTS_PER_HOUR + imp * XP_PER_IMPORTANCE_POINT))


def level_threshold(level: int) -> int:
    return 50 * level * (level - 1)


def level_for_xp(xp: int) -> int:
    level = 1
    while level < MAX_LEVEL and xp >= level_threshold(level + 1):
        level += 1
    return level
