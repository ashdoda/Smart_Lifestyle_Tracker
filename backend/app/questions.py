"""Loads questions.json and handles which questions show and what answers are valid."""
import json
import re

from . import config

_data = json.loads(config.QUESTIONS_PATH.read_text(encoding="utf-8"))

RULES: dict = _data["rules"]
QUESTIONS: list[dict] = sorted(_data["questions"], key=lambda q: (q["domain"] != "general", q["domain"], q["period"], q["order"]))
BY_ID: dict[str, dict] = {q["id"]: q for q in QUESTIONS}

MANDATORY = set(RULES["mandatory_domains"])
ALL_DOMAINS = list(RULES["domains"])
OPTIONAL_DOMAINS = [d for d in ALL_DOMAINS if d not in MANDATORY]
PERIODS = ("morning", "evening")
_EMPTY = {s.lower() for s in RULES["empty_text_values"]}


def is_filled(value) -> bool:
    """A real answer: not missing, not blank, not 'N/A' / 'none' and the like."""
    if value is None:
        return False
    if isinstance(value, list):
        return len(value) > 0
    if isinstance(value, str):
        return value.strip().lower().rstrip(".") not in _EMPTY
    return True


def is_visible(q: dict, day_answers: dict) -> bool:
    """Evaluate show_if against all of that day's answers (morning + evening)."""
    cond = q.get("show_if")
    if not cond:
        return True
    parent = day_answers.get(cond["question"])
    if "equals" in cond:
        return parent == cond["equals"]
    if cond.get("filled"):
        return is_filled(parent)
    return True


def for_checkin(period: str, domains: set[str]) -> list[dict]:
    domains = domains | MANDATORY
    return [q for q in QUESTIONS if q["period"] == period and q["domain"] in domains]


_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def validate(q: dict, value):
    """Return the cleaned value, or raise ValueError with a message for the front end."""
    t = q["type"]
    if t == "yes_no":
        if value not in ("Yes", "No"):
            raise ValueError("must be 'Yes' or 'No'")
        return value
    if t == "scale_0_10":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 10:
            raise ValueError("must be a number from 0 to 10")
        return value
    if t in ("integer", "minutes"):
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ValueError("must be a whole number, 0 or more")
        return value
    if t == "time":
        if not isinstance(value, str) or not _TIME.match(value):
            raise ValueError("must be a time as HH:MM (24-hour)")
        return value
    if t == "text":
        if not isinstance(value, str):
            raise ValueError("must be text")
        return value.strip()
    if t == "single_choice":
        if value not in q["options"]:
            raise ValueError(f"must be one of {q['options']}")
        return value
    if t == "multi_choice":
        if not isinstance(value, list) or any(v not in q["options"] for v in value) or len(set(value)) != len(value):
            raise ValueError(f"must be a list using only {q['options']}")
        return value
    raise ValueError(f"unknown question type {t}")
